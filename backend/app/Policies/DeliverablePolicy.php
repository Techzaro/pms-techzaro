<?php

namespace App\Policies;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\DelegationService;
use Illuminate\Auth\Access\HandlesAuthorization;

class DeliverablePolicy
{
    use HandlesAuthorization;

    public function __construct(private ?DelegationService $delegationService = null)
    {
        $this->delegationService ??= app(DelegationService::class);
    }

    /**
     * Check if user and deliverable belong to the same organization/tenant.
     */
    protected function belongsToSameTenant(User $user, Deliverable $deliverable): bool
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
     * Safe helper to check if user is a direct assignee of the deliverable.
     */
    protected function isDeliverableAssignee(User $user, Deliverable $deliverable): bool
    {
        $userId = (int) $user->id;
        if ((int) $deliverable->assigned_to === $userId) {
            return true;
        }
        if ($deliverable->relationLoaded('assignees')) {
            return $deliverable->assignees ? $deliverable->assignees->contains('id', $userId) : false;
        }
        try {
            return $deliverable->assignees()->where('users.id', $userId)->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Safely obtain the deliverable's parent task without triggering unloaded database queries.
     */
    protected function getDeliverableTask(Deliverable $deliverable): ?Task
    {
        if ($deliverable->relationLoaded('task')) {
            return $deliverable->task;
        }

        if ($deliverable->task_id) {
            try {
                return Task::find($deliverable->task_id);
            } catch (\Throwable $e) {
                return null;
            }
        }

        return null;
    }

    /**
     * Determine whether the user is the creator of the deliverable or the assigner/creator of its parent task.
     */
    protected function isCreatorOrTaskAssigner(User $user, Deliverable $deliverable): bool
    {
        $userId = (int) $user->id;
        if ((int) $deliverable->created_by === $userId) {
            return true;
        }

        $task = $this->getDeliverableTask($deliverable);
        if ($task && ((int) $task->assigned_by === $userId || (int) ($task->creator_id ?? 0) === $userId)) {
            return true;
        }

        return false;
    }

    /**
     * Check if user is an active participant in task_delegations table, delegation_chain, or approval_chain for this deliverable.
     */
    protected function isDelegationParticipant(User $user, Deliverable $deliverable): bool
    {
        $userId = (int) $user->id;

        // 1. Check task_delegations table
        try {
            if (TaskDelegation::where('deliverable_id', $deliverable->id)
                ->where(function ($q) use ($userId) {
                    $q->where('delegated_by', $userId)
                      ->orWhere('delegated_to', $userId);
                })->exists()) {
                return true;
            }
        } catch (\Throwable $e) {
        }

        // 2. Check JSON delegation_chain
        $chain = is_string($deliverable->delegation_chain)
            ? json_decode($deliverable->delegation_chain, true)
            : $deliverable->delegation_chain;
        if (! empty($chain) && is_iterable($chain)) {
            foreach ($chain as $entry) {
                if ((int) ($entry['delegated_by'] ?? 0) === $userId || (int) ($entry['delegated_to'] ?? 0) === $userId) {
                    return true;
                }
            }
        }

        // 3. Check JSON approval_chain
        $approvalChain = is_string($deliverable->approval_chain)
            ? json_decode($deliverable->approval_chain, true)
            : $deliverable->approval_chain;
        if (! empty($approvalChain) && is_iterable($approvalChain)) {
            foreach ($approvalChain as $entry) {
                if ((int) ($entry['approver_id'] ?? 0) === $userId) {
                    return true;
                }
            }
        }

        // 4. Check DelegationService
        try {
            if ($this->delegationService?->isInDeliverableDelegationChain($deliverable, $user)) {
                return true;
            }
        } catch (\Throwable $e) {
        }

        return false;
    }

    /**
     * Check if user is the current active owner, assignee, or reviewer of the subtask.
     */
    protected function isCurrentOwnerOrReviewer(User $user, Deliverable $deliverable): bool
    {
        $userId = (int) $user->id;

        if ((int) ($deliverable->current_owner ?? 0) === $userId) {
            return true;
        }

        if ((int) ($deliverable->current_reviewer_id ?? 0) === $userId) {
            return true;
        }

        if ((int) ($deliverable->assigned_to ?? 0) === $userId) {
            return true;
        }

        if ($this->isDeliverableAssignee($user, $deliverable)) {
            return true;
        }

        // Check if user is next approver via DelegationService
        try {
            $nextApprover = $this->delegationService?->getDeliverableApprover($deliverable);
            if ($nextApprover && (int) $nextApprover === $userId) {
                return true;
            }
        } catch (\Throwable $e) {
        }

        return false;
    }

    /**
     * Determine whether the user can view any deliverables.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can view the deliverable.
     */
    public function view(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        // Admins and Managers have full view access
        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        $userId = (int) $user->id;

        // Deliverable Creator or Task Assigner
        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        // Deliverable Assignee / Current Owner / Reviewer
        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        // Original Assigner / Past Owner / Transferor
        if ($deliverable->original_assigner && (int) $deliverable->original_assigner === $userId) {
            return true;
        }

        // Delegation Chain / Task Delegations / Approval Chain
        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        // Parent Task Follower / Assignee / Delegation
        $task = $this->getDeliverableTask($deliverable);
        if ($task) {
            if ((int) $task->assigned_to === $userId || (int) ($task->current_owner ?? 0) === $userId) {
                return true;
            }
            if ($task->relationLoaded('assignees')) {
                if ($task->assignees && $task->assignees->contains('id', $userId)) {
                    return true;
                }
            } else {
                try {
                    if ($task->assignees()->where('users.id', $userId)->exists()) {
                        return true;
                    }
                } catch (\Throwable $e) {
                }
            }
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
            $taskChain = is_string($task->delegation_chain) ? json_decode($task->delegation_chain, true) : $task->delegation_chain;
            if (! empty($taskChain) && is_iterable($taskChain)) {
                foreach ($taskChain as $tEntry) {
                    if ((int) ($tEntry['delegated_by'] ?? 0) === $userId || (int) ($tEntry['delegated_to'] ?? 0) === $userId) {
                        return true;
                    }
                }
            }
        }

        // Parent Project Member / Participant
        $project = null;
        if ($deliverable->relationLoaded('project')) {
            $project = $deliverable->project;
        } elseif ($deliverable->project_id) {
            try {
                $project = Project::find($deliverable->project_id);
            } catch (\Throwable $e) {
            }
        }

        if (! $project && $task) {
            if ($task->relationLoaded('project')) {
                $project = $task->project;
            } elseif ($task->project_id) {
                try {
                    $project = Project::find($task->project_id);
                } catch (\Throwable $e) {
                }
            }
        }

        if ($project && $project->isMemberOrParticipant($user)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can create deliverables.
     */
    public function create(User $user, ?Project $project = null, ?Task $task = null): bool
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        if ($task) {
            if ((int) $task->assigned_by === (int) $user->id || (int) $task->assigned_to === (int) $user->id) {
                return true;
            }
            if ($task->relationLoaded('assignees')) {
                if ($task->assignees && $task->assignees->contains('id', $user->id)) {
                    return true;
                }
            } else {
                try {
                    if ($task->assignees()->where('users.id', $user->id)->exists()) {
                        return true;
                    }
                } catch (\Throwable $e) {
                }
            }
        }

        if ($project) {
            return $project->isMemberOrParticipant($user);
        }

        return $user->role !== 'guest';
    }

    /**
     * Determine whether the user can update the deliverable.
     */
    public function update(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager', 'team_lead'])) {
            return true;
        }

        $userId = (int) $user->id;

        // Creator or Task Assigner
        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        // Assignee or Current Owner or Reviewer
        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        // Active participant in delegation chain
        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        // Project Creator
        $project = null;
        if ($deliverable->relationLoaded('project')) {
            $project = $deliverable->project;
        } elseif ($deliverable->project_id) {
            try {
                $project = Project::find($deliverable->project_id);
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
    public function updateStatus(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager', 'team_lead'])) {
            return true;
        }

        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can delete the deliverable.
     */
    public function delete(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin', 'manager'])) {
            return true;
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Determine whether the user can acknowledge the deliverable.
     */
    public function acknowledge(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Determine whether the user can start timer.
     */
    public function startTimer(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Determine whether the user can pause the deliverable.
     */
    public function pause(User $user, Deliverable $deliverable): bool
    {
        return $this->startTimer($user, $deliverable);
    }

    /**
     * Determine whether the user can continue the deliverable.
     */
    public function continue(User $user, Deliverable $deliverable): bool
    {
        return $this->startTimer($user, $deliverable);
    }

    /**
     * Determine whether the user can abandon the deliverable.
     */
    public function abandon(User $user, Deliverable $deliverable): bool
    {
        return $this->startTimer($user, $deliverable);
    }

    /**
     * Request abandon deliverable.
     */
    public function requestAbandon(User $user, Deliverable $deliverable): bool
    {
        return $this->startTimer($user, $deliverable);
    }

    /**
     * Approve abandon deliverable.
     */
    public function approveAbandon(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        return $this->isDelegationParticipant($user, $deliverable);
    }

    /**
     * Decline abandon deliverable.
     */
    public function declineAbandon(User $user, Deliverable $deliverable): bool
    {
        return $this->approveAbandon($user, $deliverable);
    }

    /**
     * Assigner pause deliverable.
     */
    public function assignerPause(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Assigner resume deliverable.
     */
    public function assignerResume(User $user, Deliverable $deliverable): bool
    {
        return $this->assignerPause($user, $deliverable);
    }

    /**
     * Submit deliverable.
     */
    public function submit(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Determine whether the user can submit to next reviewer in delegation chain.
     */
    public function submitToNext(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        $userId = (int) $user->id;
        $nextApprover = $this->delegationService?->getDeliverableApprover($deliverable);
        if ($nextApprover && (int) $nextApprover === $userId) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        return $this->isDelegationParticipant($user, $deliverable);
    }

    /**
     * Determine whether the user can approve the deliverable.
     */
    public function approve(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        // Deliverable Creator or Task Assigner / Creator
        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        // Current Owner or Reviewer
        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        // Active participant in task_delegations, delegation_chain, or approval_chain
        if ($this->isDelegationParticipant($user, $deliverable)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can reject/decline the deliverable.
     */
    public function reject(User $user, Deliverable $deliverable): bool
    {
        return $this->approve($user, $deliverable);
    }

    /**
     * Reopen deliverable.
     */
    public function reopen(User $user, Deliverable $deliverable): bool
    {
        return $this->approve($user, $deliverable);
    }

    /**
     * Self-approve deliverable.
     */
    public function selfApprove(User $user, Deliverable $deliverable): bool
    {
        return $this->approve($user, $deliverable);
    }

    /**
     * Self-rework deliverable.
     */
    public function selfRework(User $user, Deliverable $deliverable): bool
    {
        return $this->approve($user, $deliverable);
    }

    /**
     * Delegate deliverable.
     */
    public function delegate(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if ($deliverable->allow_transfer === false) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        return $this->isDelegationParticipant($user, $deliverable);
    }

    /**
     * Accept delegation on deliverable.
     */
    public function acceptDelegation(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'super_admin', 'manager', 'team_lead'])) {
            return true;
        }

        $userId = (int) $user->id;

        try {
            if (TaskDelegation::where('deliverable_id', $deliverable->id)
                ->where('delegated_to', $userId)
                ->whereIn('status', ['pending', 'in_progress', 'accepted'])
                ->exists()) {
                return true;
            }
        } catch (\Throwable $e) {
        }

        $chain = is_string($deliverable->delegation_chain)
            ? json_decode($deliverable->delegation_chain, true)
            : $deliverable->delegation_chain;
        if (! empty($chain) && is_iterable($chain)) {
            foreach ($chain as $entry) {
                if ((int) ($entry['delegated_to'] ?? 0) === $userId) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Reject delegation on deliverable.
     */
    public function rejectDelegation(User $user, Deliverable $deliverable): bool
    {
        return $this->acceptDelegation($user, $deliverable);
    }

    /**
     * Revoke delegation on deliverable.
     */
    public function revokeDelegation(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'super_admin', 'manager', 'team_lead'])) {
            return true;
        }

        $userId = (int) $user->id;

        try {
            if (TaskDelegation::where('deliverable_id', $deliverable->id)
                ->where('delegated_by', $userId)
                ->exists()) {
                return true;
            }
        } catch (\Throwable $e) {
        }

        $chain = is_string($deliverable->delegation_chain)
            ? json_decode($deliverable->delegation_chain, true)
            : $deliverable->delegation_chain;
        if (! empty($chain) && is_iterable($chain)) {
            foreach ($chain as $entry) {
                if ((int) ($entry['delegated_by'] ?? 0) === $userId) {
                    return true;
                }
            }
        }

        return $this->isCreatorOrTaskAssigner($user, $deliverable);
    }

    /**
     * Manage files for deliverable.
     */
    public function manageFiles(User $user, Deliverable $deliverable): bool
    {
        return $this->view($user, $deliverable);
    }

    /**
     * Manage notes for deliverable.
     */
    public function manageNotes(User $user, Deliverable $deliverable): bool
    {
        return $this->view($user, $deliverable);
    }

    /**
     * Determine whether the user can mark the deliverable as completed.
     */
    public function markAsCompleted(User $user, Deliverable $deliverable): bool
    {
        if (! $this->belongsToSameTenant($user, $deliverable)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead'])) {
            return true;
        }

        if ($this->isCreatorOrTaskAssigner($user, $deliverable)) {
            return true;
        }

        if ($this->isCurrentOwnerOrReviewer($user, $deliverable)) {
            return true;
        }

        return $this->isDelegationParticipant($user, $deliverable);
    }
}
