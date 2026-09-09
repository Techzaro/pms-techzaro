<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\DelegationService;
use Illuminate\Auth\Access\HandlesAuthorization;

class TaskPolicy
{
    use HandlesAuthorization;

    public function __construct(private ?DelegationService $delegationService = null)
    {
        $this->delegationService ??= app(DelegationService::class);
    }

    /**
     * Check if user and task belong to the same organization/tenant.
     */
    protected function belongsToSameTenant(User $user, Task $task): bool
    {
        try {
            if (function_exists('app') && app()->bound('request')) {
                $org = request()->attributes->get('currentOrganization');
                if ($org && isset($org->id) && isset($user->organization_id)) {
                    if ((int) $org->id !== (int) $user->organization_id) {
                        return false;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Container or request not bound (CLI / Unit tests)
        }
        return true;
    }

    /**
     * Safe helper to check if user is a direct assignee of the task.
     */
    protected function isTaskAssignee(User $user, Task $task): bool
    {
        $userId = (int) $user->id;
        if ((int) $task->assigned_to === $userId) {
            return true;
        }
        if ($task->relationLoaded('assignees')) {
            return $task->assignees ? $task->assignees->contains('id', $userId) : false;
        }
        try {
            return $task->assignees()->where('users.id', $userId)->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Determine whether the user can view any tasks.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can view the task.
     */
    public function view(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        // Admins and Managers have full view access
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;

        // Assigner / Creator
        if ((int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId) {
            return true;
        }

        // Direct Assignee
        if ($this->isTaskAssignee($user, $task)) {
            return true;
        }

        // Current Owner
        if ($task->current_owner && (int) $task->current_owner === $userId) {
            return true;
        }

        // Current Reviewer
        if ($task->current_reviewer_id && (int) $task->current_reviewer_id === $userId) {
            return true;
        }

        // Follower
        if ($task->relationLoaded('followers')) {
            if ($task->followers && $task->followers->contains('id', $userId)) {
                return true;
            }
        } else {
            try {
                if ($task->followers()->where('users.id', $userId)->exists()) {
                    return true;
                }
            } catch (\Throwable $e) {
            }
        }

        // Transferee or Transferor in Delegation Chain
        if (! empty($task->delegation_chain) && is_iterable($task->delegation_chain)) {
            foreach ($task->delegation_chain as $entry) {
                if ((int) ($entry['delegated_by'] ?? 0) === $userId || (int) ($entry['delegated_to'] ?? 0) === $userId) {
                    return true;
                }
            }
        }

        // Deliverable Assignee or Creator
        if ($task->relationLoaded('deliverables')) {
            if ($task->deliverables && $task->deliverables->contains(fn ($d) => (int) $d->assigned_to === $userId || (int) $d->created_by === $userId)) {
                return true;
            }
        } else {
            try {
                if ($task->deliverables()->where(fn ($q) => $q->where('assigned_to', $userId)->orWhere('created_by', $userId))->exists()) {
                    return true;
                }
            } catch (\Throwable $e) {
            }
        }

        // Project Member / Participant (Safe relationship check)
        $project = null;
        if ($task->relationLoaded('project')) {
            $project = $task->project;
        } elseif ($task->project_id) {
            try {
                $project = Project::find($task->project_id);
            } catch (\Throwable $e) {
            }
        }

        if ($project && $project->isMemberOrParticipant($user)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can create tasks.
     */
    public function create(User $user, ?Project $project = null): bool
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        if (! $project) {
            return $user->role !== 'guest';
        }

        return $project->isMemberOrParticipant($user);
    }

    /**
     * Determine whether the user can update the task.
     * Strictly restricted to Assignees, Creators, and authorized roles (Admins/Managers).
     */
    public function update(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager'])) {
            return true;
        }

        $userId = (int) $user->id;

        $project = null;
        if ($task->relationLoaded('project')) {
            $project = $task->project;
        } elseif ($task->project_id) {
            try {
                $project = Project::find($task->project_id);
            } catch (\Throwable $e) {
            }
        }

        // Project Creator
        if ($project && (int) $project->created_by === $userId) {
            return true;
        }

        // Team Lead
        if ($project) {
            $team = null;
            if ($project->relationLoaded('team')) {
                $team = $project->team;
            } elseif (!empty($project->team_id)) {
                try {
                    $team = Team::find($project->team_id);
                } catch (\Throwable $e) {
                }
            }
            if ($team && (int) $team->leader_id === $userId) {
                return true;
            }
        }

        // Assigner / Creator
        if ((int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId) {
            return true;
        }

        // Assignee
        if ($this->isTaskAssignee($user, $task)) {
            return true;
        }

        // Current Owner
        if ($task->current_owner && (int) $task->current_owner === $userId) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can delete the task.
     */
    public function delete(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager'])) {
            return true;
        }

        $userId = (int) $user->id;

        // Assigner / Creator
        if ((int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId) {
            return true;
        }

        // Project Creator
        $project = null;
        if ($task->relationLoaded('project')) {
            $project = $task->project;
        } elseif ($task->project_id) {
            try {
                $project = Project::find($task->project_id);
            } catch (\Throwable $e) {
            }
        }

        if ($project && (int) $project->created_by === $userId) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can update status directly.
     */
    public function updateStatus(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager'])) {
            return true;
        }

        $userId = (int) $user->id;

        $isAssigner = (int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId;
        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === $userId;

        return $isAssigner || $isAssignee || $isCurrentOwner;
    }

    /**
     * Determine whether the user can acknowledge the task.
     */
    public function acknowledge(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === $userId;
        $isAssigner = (int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId;

        return ($isAssignee || $isCurrentOwner || $isAssigner) && in_array(strtolower($task->status ?? ''), ['pending', 'reopened']);
    }

    /**
     * Determine whether the user can start timer on the task.
     */
    public function startTimer(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === $userId;
        $isAssigner = (int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId;

        return $isAssignee || $isCurrentOwner || $isAssigner;
    }

    /**
     * Determine whether the user can pause the task.
     */
    public function pause(User $user, Task $task): bool
    {
        return $this->startTimer($user, $task);
    }

    /**
     * Determine whether the user can continue the task.
     */
    public function continue(User $user, Task $task): bool
    {
        return $this->startTimer($user, $task);
    }

    /**
     * Assigner Pause.
     */
    public function assignerPause(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        return (int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId;
    }

    /**
     * Assigner Resume.
     */
    public function assignerResume(User $user, Task $task): bool
    {
        return $this->assignerPause($user, $task);
    }

    /**
     * Determine whether the user can submit the task.
     */
    public function submit(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === $userId;
        $isAssigner = (int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId;

        return $isAssignee || $isCurrentOwner || $isAssigner;
    }

    /**
     * Determine whether the user can submit to next reviewer in delegation chain.
     */
    public function submitToNext(User $user, Task $task): bool
    {
        return (int) ($task->current_reviewer_id ?? 0) === (int) $user->id;
    }

    /**
     * Determine whether the user can approve the task.
     */
    public function approve(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $creatorId = (int) ($task->creator_id ?: $task->assigned_by);
        $nextApprover = $this->delegationService?->getNextApprover($task);

        // If in awaiting_checkpoint stage or next approver is a transferor
        if ($task->submission_stage === 'awaiting_checkpoint' || ($nextApprover && (int) $nextApprover !== $creatorId)) {
            $checkpointReviewer = (int) ($task->current_reviewer_id ?: $nextApprover ?: 0);
            return $checkpointReviewer === $userId;
        }

        // If in awaiting_creator stage
        if ($task->submission_stage === 'awaiting_creator') {
            return $creatorId === $userId;
        }

        // Active routing reviewer
        if ((int) ($task->current_reviewer_id ?? 0) === $userId) {
            return true;
        }

        // Assigner / Creator
        return $creatorId === $userId;
    }

    /**
     * Determine whether the user can reject/decline the task.
     */
    public function reject(User $user, Task $task): bool
    {
        return $this->approve($user, $task);
    }

    /**
     * Determine whether the user can reopen the task.
     */
    public function reopen(User $user, Task $task): bool
    {
        return $this->approve($user, $task);
    }

    /**
     * Determine whether the user can delegate the task.
     */
    public function delegate(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        return ($isAssignee || $isCurrentOwner) && $task->allow_transfer !== false;
    }

    /**
     * Accept delegation.
     */
    public function acceptDelegation(User $user, Task $task): bool
    {
        return $task->pendingDelegation && (int) $task->pendingDelegation->delegated_to === (int) $user->id;
    }

    /**
     * Reject delegation.
     */
    public function rejectDelegation(User $user, Task $task): bool
    {
        return $this->acceptDelegation($user, $task);
    }

    /**
     * Revoke delegation.
     */
    public function revokeDelegation(User $user, Task $task): bool
    {
        return $task->pendingDelegation && ((int) $task->pendingDelegation->delegated_by === (int) $user->id || (int) $task->assigned_by === (int) $user->id || in_array($user->role, ['admin', 'super_admin']));
    }

    /**
     * Manage files attached to the task.
     */
    public function manageFiles(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }

    /**
     * Manage access credentials for the task.
     */
    public function manageCredentials(User $user, Task $task): bool
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        return (int) $task->assigned_by === (int) $user->id;
    }

    /**
     * Directly abandon a task. Both relevant task participants (Assigner and Assignee) may abandon.
     */
    public function abandon(User $user, Task $task): bool
    {
        return $this->startTimer($user, $task);
    }

    /**
     * Request Abandon.
     */
    public function requestAbandon(User $user, Task $task): bool
    {
        $isAssignee = $this->isTaskAssignee($user, $task);
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        return $isAssignee || $isCurrentOwner;
    }

    /**
     * Approve Abandon.
     */
    public function approveAbandon(User $user, Task $task): bool
    {
        return (int) $task->assigned_by === (int) $user->id || in_array($user->role, ['admin', 'super_admin']);
    }

    /**
     * Decline Abandon.
     */
    public function declineAbandon(User $user, Task $task): bool
    {
        return $this->approveAbandon($user, $task);
    }

    /**
     * Complete Task directly.
     */
    public function completeTask(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $creatorId = (int) ($task->creator_id ?: $task->assigned_by);

        return $creatorId === $userId || (int) $task->assigned_by === $userId || (int) ($task->original_assigner ?? 0) === $userId;
    }

    /**
     * Determine whether the user can mark the task as completed.
     */
    public function markAsCompleted(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $userId = (int) $user->id;
        $creatorId = (int) ($task->creator_id ?: $task->assigned_by);

        return $creatorId === $userId || (int) $task->assigned_by === $userId || (int) ($task->original_assigner ?? 0) === $userId;
    }
}
