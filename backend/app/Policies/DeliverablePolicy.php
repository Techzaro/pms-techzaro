<?php

namespace App\Policies;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class DeliverablePolicy
{
    use HandlesAuthorization;

    /**
     * Check if user and deliverable belong to the same organization/tenant.
     */
    protected function belongsToSameTenant(User $user, Deliverable $deliverable): bool
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

        // Deliverable Creator
        if ((int) $deliverable->created_by === (int) $user->id) {
            return true;
        }

        // Deliverable Assignee
        if ((int) $deliverable->assigned_to === (int) $user->id) {
            return true;
        }

        // Current Owner
        if ($deliverable->current_owner && (int) $deliverable->current_owner === (int) $user->id) {
            return true;
        }

        // Delegation Chain
        if (! empty($deliverable->delegation_chain)) {
            foreach ($deliverable->delegation_chain as $entry) {
                if ((int) ($entry['delegated_by'] ?? 0) === (int) $user->id || (int) ($entry['delegated_to'] ?? 0) === (int) $user->id) {
                    return true;
                }
            }
        }

        // Task Assigner / Creator
        if ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id) {
            return true;
        }

        // Task Assignee
        if ($deliverable->task && ((int) $deliverable->task->assigned_to === (int) $user->id || $deliverable->task->assignees()->where('users.id', $user->id)->exists())) {
            return true;
        }

        // Project Team or Creator
        $project = $deliverable->project ?? ($deliverable->task ? $deliverable->task->project : null);
        if ($project) {
            if ((int) $project->created_by === (int) $user->id) {
                return true;
            }
            if ($project->team) {
                if ((int) $project->team->leader_id === (int) $user->id) {
                    return true;
                }
                if ($project->team->members()->where('users.id', $user->id)->exists()) {
                    return true;
                }
            }
            if (!empty($project->team_ids)) {
                $teamIds = array_map('intval', $project->team_ids);
                $isTeamMember = $user->teams()->whereIn('teams.id', $teamIds)->exists()
                    || $user->ledTeams()->whereIn('teams.id', $teamIds)->exists();
                if ($isTeamMember) {
                    return true;
                }
            }
            $projectAssigned = array_map('intval', $project->assigned_users ?? []);
            if (in_array((int) $user->id, $projectAssigned, true)) {
                return true;
            }
            if ($project->manuallyVisibleTo()->where('user_id', $user->id)->exists()) {
                return true;
            }
            if ($user->role === 'guest' && $project->isAccessibleByGuest($user)) {
                return true;
            }
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
            if ($task->assignees()->where('users.id', $user->id)->exists()) {
                return true;
            }
        }

        if ($project) {
            if ((int) $project->created_by === (int) $user->id) {
                return true;
            }
            if ($project->team && ((int) $project->team->leader_id === (int) $user->id || $project->team->members()->where('users.id', $user->id)->exists())) {
                return true;
            }
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

        if ((int) $deliverable->created_by === (int) $user->id) {
            return true;
        }

        if ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id) {
            return true;
        }

        $project = $deliverable->project ?? ($deliverable->task ? $deliverable->task->project : null);
        if ($project && (int) $project->created_by === (int) $user->id) {
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

        if ((int) $deliverable->created_by === (int) $user->id) {
            return true;
        }

        if ($deliverable->task && ((int) $deliverable->task->assigned_by === (int) $user->id || (int) ($deliverable->task->creator_id ?? 0) === (int) $user->id)) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can acknowledge the deliverable.
     */
    public function acknowledge(User $user, Deliverable $deliverable): bool
    {
        return (int) $deliverable->assigned_to === (int) $user->id || (int) ($deliverable->current_owner ?? 0) === (int) $user->id;
    }

    /**
     * Determine whether the user can start timer.
     */
    public function startTimer(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return true;
        }

        $isAssignee = (int) $deliverable->assigned_to === (int) $user->id || (int) ($deliverable->current_owner ?? 0) === (int) $user->id;
        $isCreator = (int) $deliverable->created_by === (int) $user->id || ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id);

        return $isAssignee || $isCreator;
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
     * Assigner pause deliverable.
     */
    public function assignerPause(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        return (int) $deliverable->created_by === (int) $user->id || ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id);
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
        return (int) $deliverable->assigned_to === (int) $user->id || (int) ($deliverable->current_owner ?? 0) === (int) $user->id;
    }

    /**
     * Approve deliverable.
     */
    public function approve(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        if ((int) $deliverable->created_by === (int) $user->id) {
            return true;
        }

        if ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id) {
            return true;
        }

        return false;
    }

    /**
     * Reject deliverable.
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
     * Delegate deliverable.
     */
    public function delegate(User $user, Deliverable $deliverable): bool
    {
        $isOwner = (int) $deliverable->assigned_to === (int) $user->id || (int) ($deliverable->current_owner ?? 0) === (int) $user->id;
        return $isOwner && $deliverable->allow_transfer !== false;
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

        if (in_array($user->role, ['admin', 'super_admin'])) {
            return true;
        }

        return (int) $deliverable->created_by === (int) $user->id || ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id);
    }
}
