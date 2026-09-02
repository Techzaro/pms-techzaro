<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class TaskPolicy
{
    use HandlesAuthorization;

    /**
     * Check if user and task belong to the same organization/tenant.
     */
    protected function belongsToSameTenant(User $user, Task $task): bool
    {
        $org = request()->attributes->get('currentOrganization');
        if ($org && isset($org->id) && isset($user->organization_id)) {
            if ((int) $org->id !== (int) $user->organization_id) {
                return false;
            }
        }
        return true;
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

        // Assigner / Creator
        if ((int) $task->assigned_by === (int) $user->id) {
            return true;
        }

        // Direct Assignee
        if ((int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists()) {
            return true;
        }

        // Current Owner
        if ($task->current_owner && (int) $task->current_owner === (int) $user->id) {
            return true;
        }

        // Current Reviewer
        if ($task->current_reviewer_id && (int) $task->current_reviewer_id === (int) $user->id) {
            return true;
        }

        // Follower
        if ($task->followers()->where('users.id', $user->id)->exists()) {
            return true;
        }

        // Transferee or Transferor in Delegation Chain
        if (! empty($task->delegation_chain)) {
            foreach ($task->delegation_chain as $entry) {
                if ((int) ($entry['delegated_by'] ?? 0) === (int) $user->id || (int) ($entry['delegated_to'] ?? 0) === (int) $user->id) {
                    return true;
                }
            }
        }

        // Deliverable Assignee or Creator
        if ($task->deliverables()->where(fn ($q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id))->exists()) {
            return true;
        }

        // Project Team Leader, Member, or Creator
        if ($task->project) {
            if ((int) $task->project->created_by === (int) $user->id) {
                return true;
            }

            if ($task->project->team) {
                if ((int) $task->project->team->leader_id === (int) $user->id) {
                    return true;
                }
                if ($task->project->team->members()->where('users.id', $user->id)->exists()) {
                    return true;
                }
            }

            // Project Assigned Users
            $projectAssigned = array_map('intval', $task->project->assigned_users ?? []);
            if (in_array((int) $user->id, $projectAssigned, true)) {
                return true;
            }

            // Guest of Project
            if ($user->role === 'guest' && $task->project->isAccessibleByGuest($user)) {
                return true;
            }
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

        // Project creator
        if ((int) $project->created_by === (int) $user->id) {
            return true;
        }

        // Team leader or member
        if ($project->team) {
            if ((int) $project->team->leader_id === (int) $user->id) {
                return true;
            }
            if ($project->team->members()->where('users.id', $user->id)->exists()) {
                return true;
            }
        }

        $projectAssigned = array_map('intval', $project->assigned_users ?? []);
        if (in_array((int) $user->id, $projectAssigned, true)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can update the task.
     */
    public function update(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        if ($user->role === 'manager') {
            return true;
        }

        // Project Creator
        if ($task->project && (int) $task->project->created_by === (int) $user->id) {
            return true;
        }

        // Team Lead
        if ($task->project && $task->project->team && (int) $task->project->team->leader_id === (int) $user->id) {
            return true;
        }

        // Assigner / Creator
        if ((int) $task->assigned_by === (int) $user->id) {
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

        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        // Assigner / Creator can delete if not approved
        if ((int) $task->assigned_by === (int) $user->id) {
            return true;
        }

        // Project Creator
        if ($task->project && (int) $task->project->created_by === (int) $user->id) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can update status directly.
     */
    public function updateStatus(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }

    /**
     * Determine whether the user can acknowledge the task.
     */
    public function acknowledge(User $user, Task $task): bool
    {
        if (! $this->belongsToSameTenant($user, $task)) {
            return false;
        }

        $isAssignee = (int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists();
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        return ($isAssignee || $isCurrentOwner) && in_array(strtolower($task->status ?? ''), ['pending', 'reopened']);
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

        $isAssignee = (int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists();
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        return $isAssignee || $isCurrentOwner;
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
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        return (int) $task->assigned_by === (int) $user->id;
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

        $isAssignee = (int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists();
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        return $isAssignee || $isCurrentOwner;
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
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        // Active routing reviewer
        if ((int) ($task->current_reviewer_id ?? 0) === (int) $user->id) {
            return true;
        }

        // Assigner / Creator
        return (int) $task->assigned_by === (int) $user->id;
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

        $isAssignee = (int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists();
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
     * Request Abandon.
     */
    public function requestAbandon(User $user, Task $task): bool
    {
        $isAssignee = (int) $task->assigned_to === (int) $user->id || $task->assignees()->where('users.id', $user->id)->exists();
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
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        return (int) $task->assigned_by === (int) $user->id;
    }
}
