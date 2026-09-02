<?php

namespace App\Policies;

use App\Models\KnowledgeBase;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class KnowledgeBasePolicy
{
    use HandlesAuthorization;

    /**
     * Determine whether the user can view any knowledge base articles.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can view the knowledge base article.
     */
    public function view(User $user, KnowledgeBase $knowledgeBase): bool
    {
        // Admins and Managers have full view access
        if (in_array($user->role, ['admin', 'manager'])) {
            return true;
        }

        // Creator always has access
        if ($knowledgeBase->created_by === $user->id) {
            return true;
        }

        // Non-creators can only see published articles (unless admin/manager)
        if ($knowledgeBase->status && !in_array($knowledgeBase->status, ['published', 'draft']) && $knowledgeBase->status === 'archived') {
            return false;
        }

        // Private articles are strictly for creator and admin
        if ($knowledgeBase->visibility_level === 'private') {
            return false;
        }

        $userDept = $user->department ?: 'General';
        $userOrg = $user->company_name ?: 'Techzaro';

        // Organization-wide visibility
        if ($knowledgeBase->visibility_level === 'organization') {
            return empty($knowledgeBase->organization) || strcasecmp($knowledgeBase->organization, $userOrg) === 0;
        }

        // Department-level visibility
        if ($knowledgeBase->visibility_level === 'department_team') {
            return strcasecmp($knowledgeBase->department ?: 'General', $userDept) === 0;
        }

        // Project Team visibility
        if ($knowledgeBase->visibility_level === 'project_team' && $knowledgeBase->project_id) {
            $hasAccess = Project::where('id', $knowledgeBase->project_id)
                ->where(function ($q) use ($user) {
                    $q->whereHas('team', fn ($tq) => $tq->whereHas('members', fn ($mq) => $mq->where('users.id', $user->id)))
                        ->orWhereJsonContains('guest_ids', $user->id)
                        ->orWhereHas('tasks', fn ($tq) => $tq->where('assigned_to', $user->id)->orWhere('assigned_by', $user->id));
                })->exists();

            if ($hasAccess) {
                return true;
            }
        }

        // Team-level visibility
        if ($knowledgeBase->visibility_level === 'team') {
            $userTeamIds = Team::whereHas('members', fn ($q) => $q->where('users.id', $user->id))
                ->orWhere('leader_id', $user->id)
                ->pluck('id')->toArray();

            return $knowledgeBase->visibilities()
                ->whereIn('team_id', $userTeamIds)
                ->where('is_visible', true)
                ->exists();
        }

        // Custom / Granular visibility
        if ($knowledgeBase->visibility_level === 'custom') {
            $userTeamIds = Team::whereHas('members', fn ($q) => $q->where('users.id', $user->id))
                ->orWhere('leader_id', $user->id)
                ->pluck('id')->toArray();

            return $knowledgeBase->visibilities()
                ->where(function ($vq) use ($user, $userTeamIds, $userDept) {
                    $vq->where('user_id', $user->id)
                        ->orWhereIn('team_id', $userTeamIds)
                        ->orWhere('department', $userDept)
                        ->orWhere('role', $user->role);
                })
                ->where('is_visible', true)
                ->exists();
        }

        return false;
    }

    /**
     * Determine whether the user can create knowledge base articles.
     */
    public function create(User $user): bool
    {
        return $user->role !== 'guest';
    }

    /**
     * Determine whether the user can update the knowledge base article.
     */
    public function update(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return in_array($user->role, ['admin', 'manager']) || $knowledgeBase->created_by === $user->id;
    }

    /**
     * Alias for update method.
     */
    public function edit(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->update($user, $knowledgeBase);
    }

    /**
     * Determine whether the user can delete the knowledge base article.
     */
    public function delete(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return in_array($user->role, ['admin', 'manager']) || $knowledgeBase->created_by === $user->id;
    }

    /**
     * Determine whether the user can duplicate the knowledge base article.
     */
    public function duplicate(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->view($user, $knowledgeBase) && $this->create($user);
    }

    /**
     * Determine whether the user can archive the knowledge base article.
     */
    public function archive(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return in_array($user->role, ['admin', 'manager']) || $knowledgeBase->created_by === $user->id;
    }

    /**
     * Determine whether the user can restore the knowledge base article from archive.
     */
    public function restore(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return in_array($user->role, ['admin', 'manager']) || $knowledgeBase->created_by === $user->id;
    }

    /**
     * Determine whether the user can download attachments from the article.
     */
    public function download_attachments(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->view($user, $knowledgeBase) && !empty($knowledgeBase->file_path);
    }

    /**
     * CamelCase alias for download_attachments.
     */
    public function downloadAttachments(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->download_attachments($user, $knowledgeBase);
    }

    /**
     * Determine whether the user can share the article internally.
     */
    public function share_internally(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->view($user, $knowledgeBase);
    }

    /**
     * CamelCase alias for share_internally.
     */
    public function shareInternally(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->share_internally($user, $knowledgeBase);
    }

    /**
     * Determine whether the user can add/remove the article from favorites.
     */
    public function add_to_favorites(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->view($user, $knowledgeBase);
    }

    /**
     * CamelCase alias for add_to_favorites.
     */
    public function addToFavorites(User $user, KnowledgeBase $knowledgeBase): bool
    {
        return $this->add_to_favorites($user, $knowledgeBase);
    }
}
