<?php

/**
 * Controller for team creation, member assignment, and leader management.
 * Integrates personalized notifications, activities, and emails for all team actions.
 *
 * Every action generates:
 *   - Dashboard Activity for the performer AND all affected team members
 *   - Confirmation email for the performer (Admin/Manager)
 *   - PMS Notification + Outlook Email for each affected member
 *
 * Messages are personalized per recipient role (added, removed, leader changed, etc.)
 */

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class TeamController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService
    ) {}

    public function index()
    {
        $teams = Team::with(['leader:id,name', 'members:id,name,role'])->orderBy('created_at', 'desc')->get();
        return response()->json($teams);
    }

    /**
     * Get the authenticated user's team(s).
     * Read-only endpoint for Members, Team Leads, and all roles.
     */
    public function myTeam(Request $request)
    {
        $user = $request->user();

        $teams = Team::whereHas('members', function ($q) use ($user) {
            $q->where('users.id', $user->id);
        })
            ->with([
                'leader:id,name,role,department,designation,email',
                'members:id,name,role,department,designation,email',
            ])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($teams);
    }

    public function show(Team $team)
    {
        $team->load(['leader:id,name', 'members:id,name,role']);
        return response()->json($team);
    }

    /**
     * Create a new team with optional initial members.
     *
     * Performer:  activity + confirmation email
     * Each member: activity ("You were added...") + notification + email
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'nullable|array',
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $user = $request->user();

        $team = Team::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'leader_id' => null,
            'created_by' => $user->id,
        ]);

        if (!empty($validated['member_ids'])) {
            $team->members()->attach(array_unique($validated['member_ids']));
        }

        $team->load(['leader:id,name', 'members:id,name,role']);
        Cache::forget('all_teams_list');

        $memberNames = $team->members->pluck('name')->toArray();
        $leaderName = $team->leader?->name ?? 'Not assigned';
        $memberCount = $team->members->count();
        $teamLink = '/manage-team?selectedTeam=' . $team->id;

        // ── Performer: activity + confirmation email ──
        $activityDesc = 'You created a new team "' . $team->name . '"';
        if ($memberCount > 0) {
            $activityDesc .= ' with ' . $memberCount . ' member(s)';
        }
        $this->activityService->log($user->id, 'team_created', $activityDesc, 'team', $team->id, 'created', $team->name);
        $this->clearDashboardCache($user->id);

        $this->notificationService->confirmAction($user, 'Created', 'team', $team->name, [
            'Team Lead' => $leaderName,
            'Members' => !empty($memberNames) ? implode(', ', $memberNames) : 'None',
            'Created On' => $team->created_at->format('d M Y, g:i A'),
        ]);

        // ── Each member: personalized activity + notification + email ──
        if (!empty($validated['member_ids'])) {
            foreach (array_values(array_unique($validated['member_ids'])) as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_created',
                    'You were added to team "' . $team->name . '" by ' . $user->name,
                    'team', $team->id, 'created', $team->name
                );
                $this->clearDashboardCache($memberId);

                $this->notificationService->notify(
                    $memberId, $user->id, 'team_created', 'team', $team->id,
                    'You Have Been Added to a Team',
                    'You have been added to the team "' . $team->name . '" by ' . $user->name . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $user->name]
                );
            }
        }

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team,
        ], 201);
    }

    /**
     * Update a team's name, description, and member list.
     *
     * Detects what changed and sends personalized messages to each recipient role.
     */
    public function update(Request $request, Team $team)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'nullable|array',
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $user = $request->user();

        $oldName = $team->name;
        $oldDescription = $team->description;
        $oldMemberIds = $team->members()->pluck('users.id')->toArray();

        $nameChanged = $oldName !== $validated['name'];
        $descriptionChanged = ($oldDescription ?? '') !== ($validated['description'] ?? '');

        $team->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        $newMemberIds = [];
        $removedMemberIds = [];
        if (isset($validated['member_ids'])) {
            $uniqueIds = array_unique($validated['member_ids']);
            $team->members()->sync($uniqueIds);

            $newMemberIds = array_values(array_diff($uniqueIds, $oldMemberIds));
            $removedMemberIds = array_values(array_diff($oldMemberIds, $uniqueIds));

            if ($team->leader_id && !$team->members()->whereKey($team->leader_id)->exists()) {
                $team->leader_id = null;
                $team->save();
            }
        }

        $team->load(['leader:id,name', 'members:id,name,role']);
        Cache::forget('all_teams_list');

        $leaderName = $team->leader?->name ?? 'Not assigned';
        $memberNames = $team->members->pluck('name')->toArray();
        $teamLink = '/manage-team?selectedTeam=' . $team->id;

        // Build change summary for performer
        $changes = [];
        if ($nameChanged) $changes[] = 'Name: "' . $oldName . '" to "' . $team->name . '"';
        if ($descriptionChanged) $changes[] = 'Description updated';
        if (!empty($newMemberIds)) {
            $addedNames = User::whereIn('id', $newMemberIds)->pluck('name')->toArray();
            $changes[] = 'Added: ' . implode(', ', $addedNames);
        }
        if (!empty($removedMemberIds)) {
            $removedNames = User::whereIn('id', $removedMemberIds)->pluck('name')->toArray();
            $changes[] = 'Removed: ' . implode(', ', $removedNames);
        }

        // ── Performer: activity + confirmation email ──
        $activityDesc = 'You updated team "' . $team->name . '"';
        if (!empty($changes)) $activityDesc .= ' — ' . implode('; ', $changes);
        $this->activityService->log($user->id, 'team_updated', $activityDesc, 'team', $team->id, 'updated', $team->name);

        $confirmDetails = ['Team Lead' => $leaderName];
        if ($nameChanged) $confirmDetails['Name Changed'] = '"' . $oldName . '" to "' . $team->name . '"';
        if ($descriptionChanged) $confirmDetails['Description'] = 'Updated';
        if (!empty($newMemberIds)) $confirmDetails['Members Added'] = implode(', ', $addedNames ?? []);
        if (!empty($removedMemberIds)) $confirmDetails['Members Removed'] = implode(', ', $removedNames ?? []);
        $confirmDetails['Current Members'] = !empty($memberNames) ? implode(', ', $memberNames) : 'None';
        $this->notificationService->confirmAction($user, 'Updated', 'team', $team->name, $confirmDetails);

        // ── Newly added members: personalized activity + notification + email ──
        if (!empty($newMemberIds)) {
            foreach ($newMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_member_added',
                    'You were added to team "' . $team->name . '" by ' . $user->name,
                    'team', $team->id, 'member_added', $team->name
                );
                $this->notificationService->notify(
                    $memberId, $user->id, 'team_member_added', 'team', $team->id,
                    'You Have Been Added to a Team',
                    'You have been added to the team "' . $team->name . '" by ' . $user->name . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $user->name]
                );
            }
        }

        // ── Removed members: personalized activity + notification + email ──
        if (!empty($removedMemberIds)) {
            foreach ($removedMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_member_removed',
                    'You were removed from team "' . $oldName . '" by ' . $user->name,
                    'team', $team->id, 'member_removed', $oldName
                );
                $this->notificationService->notify(
                    $memberId, $user->id, 'team_member_removed', 'team', $team->id,
                    'Removed from Team',
                    'You have been removed from the team "' . $oldName . '" by ' . $user->name . '.',
                    '/manage-team',
                    ['team_name' => $oldName, 'removed_by' => $user->name]
                );
            }
        }

        // ── Existing members: activity + notification if team info changed ──
        $existingMemberIds = array_values(array_filter(
            array_intersect($oldMemberIds, $validated['member_ids'] ?? $oldMemberIds),
            fn($id) => (int) $id !== (int) $user->id
        ));

        if (!empty($existingMemberIds) && ($nameChanged || $descriptionChanged)) {
            $infoChanges = [];
            if ($nameChanged) $infoChanges[] = 'Name: "' . $oldName . '" to "' . $team->name . '"';
            if ($descriptionChanged) $infoChanges[] = 'Description updated';
            $infoMsg = implode(', ', $infoChanges);

            foreach ($existingMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_updated',
                    'Team "' . $team->name . '" was updated by ' . $user->name . ' — ' . $infoMsg,
                    'team', $team->id, 'updated', $team->name
                );
                $this->notificationService->notify(
                    $memberId, $user->id, 'team_updated', 'team', $team->id,
                    'Team Updated',
                    'The team "' . $team->name . '" has been updated by ' . $user->name . '. Changes: ' . $infoMsg . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'updated_by' => $user->name, 'changes' => $infoMsg]
                );
            }
        }

        return response()->json([
            'message' => 'Team updated successfully',
            'team' => $team,
        ]);
    }

    /**
     * Set or change the team leader.
     *
     * New leader:    "You have been assigned as Team Lead..."
     * Old leader:    "You are no longer the Team Lead..."
     * Other members: "Team Lead changed from X to Y..."
     * Performer:     confirmation email
     */
    public function setLeader(Request $request, Team $team)
    {
        $validated = $request->validate([
            'leader_id' => 'required|exists:users,id',
        ]);

        if (!$team->members()->whereKey($validated['leader_id'])->exists()) {
            return response()->json(['message' => 'Team leader must be one of the team members.'], 422);
        }

        $newLeader = User::findOrFail($validated['leader_id']);
        $userRole = $newLeader->role === 'teamlead' ? 'team_lead' : $newLeader->role;
        if ($userRole !== 'team_lead') {
            return response()->json([
                'message' => 'This user cannot be assigned as Team Lead. First update this user\'s role to "Team Lead" from Edit User, then you can assign them as Team Lead.',
            ], 422);
        }

        $authUser = $request->user();
        $oldLeaderId = $team->leader_id;
        $oldLeaderName = $team->leader?->name ?? 'Not assigned';

        $team->leader_id = $validated['leader_id'];
        $team->save();
        $team->load(['leader:id,name', 'members:id,name,role']);
        Cache::forget('all_teams_list');

        $teamLink = '/manage-team?selectedTeam=' . $team->id;

        // ── Performer: activity + confirmation email ──
        $this->activityService->log(
            $authUser->id, 'team_leader_changed',
            'You set ' . $newLeader->name . ' as Team Lead of "' . $team->name . '"',
            'team', $team->id, 'leader_changed', $team->name
        );

        $this->notificationService->confirmAction($authUser, 'Updated', 'team', $team->name, [
            'Previous Team Lead' => $oldLeaderName,
            'New Team Lead' => $newLeader->name,
            'Team Members' => implode(', ', $team->members->pluck('name')->toArray()),
        ]);

        // ── New leader: personalized activity + notification + email ──
        $this->activityService->log(
            $newLeader->id, 'team_leader_changed',
            'You have been assigned as Team Lead of "' . $team->name . '" by ' . $authUser->name,
            'team', $team->id, 'leader_changed', $team->name
        );
        $this->notificationService->notify(
            $newLeader->id, $authUser->id, 'team_leader_changed', 'team', $team->id,
            'Team Leader Changed',
            'You have been assigned as the Team Lead of "' . $team->name . '" by ' . $authUser->name . '.',
            $teamLink,
            ['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]
        );

        // ── Old leader (if different): personalized activity + notification + email ──
        if ($oldLeaderId && (int) $oldLeaderId !== (int) $newLeader->id) {
            $oldLeader = User::find($oldLeaderId);
            if ($oldLeader) {
                $this->activityService->log(
                    $oldLeaderId, 'team_leader_changed',
                    'You are no longer the Team Lead of "' . $team->name . '". ' . $newLeader->name . ' has been appointed.',
                    'team', $team->id, 'leader_changed', $team->name
                );
                $this->notificationService->notify(
                    $oldLeaderId, $authUser->id, 'team_leader_changed', 'team', $team->id,
                    'Team Leader Changed',
                    'You are no longer the Team Lead of "' . $team->name . '". ' . $newLeader->name . ' has been appointed by ' . $authUser->name . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]
                );
            }
        }

        // ── All other members: personalized activity + notification + email ──
        $otherMemberIds = array_values(array_filter(
            $team->members->pluck('id')->toArray(),
            fn($id) => (int) $id !== (int) $newLeader->id
                && (int) $id !== (int) $oldLeaderId
                && (int) $id !== (int) $authUser->id
        ));

        if (!empty($otherMemberIds)) {
            foreach ($otherMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_leader_changed',
                    'Team Lead of "' . $team->name . '" changed from ' . $oldLeaderName . ' to ' . $newLeader->name . ' by ' . $authUser->name,
                    'team', $team->id, 'leader_changed', $team->name
                );
                $this->notificationService->notify(
                    $memberId, $authUser->id, 'team_leader_changed', 'team', $team->id,
                    'Team Leader Changed',
                    'The Team Lead for "' . $team->name . '" has been changed from ' . $oldLeaderName . ' to ' . $newLeader->name . ' by ' . $authUser->name . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]
                );
            }
        }

        return response()->json([
            'message' => 'Team leader updated successfully',
            'team' => $team,
        ]);
    }

    /**
     * Add one or more members to a team.
     *
     * New members:      "You were added..."
     * Existing members: "[Name] was added..."
     * Performer:        confirmation email
     */
    public function addMember(Request $request, Team $team)
    {
        $validated = $request->validate([
            'user_id' => 'required_without:user_ids|integer|exists:users,id',
            'user_ids' => 'required_without:user_id|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $idsToAttach = [];
        if (!empty($validated['user_ids'])) {
            $idsToAttach = array_unique($validated['user_ids']);
        } elseif (!empty($validated['user_id'])) {
            $idsToAttach = [$validated['user_id']];
        }

        $alreadyMemberIds = $team->members()->whereIn('user_id', $idsToAttach)->pluck('user_id')->toArray();
        $newIds = array_values(array_diff($idsToAttach, $alreadyMemberIds));

        if (empty($newIds)) {
            return response()->json(['message' => 'All selected users are already members of this team.'], 409);
        }

        $authUser = $request->user();
        $team->members()->attach($newIds);
        $team->load(['leader:id,name', 'members:id,name,role']);
        Cache::forget('all_teams_list');

        $leaderName = $team->leader?->name ?? 'Not assigned';
        $memberNames = $team->members->pluck('name')->toArray();
        $teamLink = '/manage-team?selectedTeam=' . $team->id;
        $addedUsers = User::whereIn('id', $newIds)->get();
        $addedNames = $addedUsers->pluck('name')->toArray();

        // ── Performer: activity + confirmation email ──
        $this->activityService->log(
            $authUser->id, 'team_member_added',
            'You added ' . implode(', ', $addedNames) . ' to team "' . $team->name . '"',
            'team', $team->id, 'member_added', $team->name
        );

        $this->notificationService->confirmAction($authUser, 'Updated', 'team', $team->name, [
            'Action' => 'Added member(s)',
            'Members Added' => implode(', ', $addedNames),
            'Team Lead' => $leaderName,
            'Current Members' => implode(', ', $memberNames),
        ]);

        // ── New members: personalized activity + notification + email ──
        foreach ($newIds as $memberId) {
            $this->activityService->log(
                $memberId, 'team_member_added',
                'You were added to team "' . $team->name . '" by ' . $authUser->name,
                'team', $team->id, 'member_added', $team->name
            );
            $this->notificationService->notify(
                $memberId, $authUser->id, 'team_member_added', 'team', $team->id,
                'You Have Been Added to a Team',
                'You have been added to the team "' . $team->name . '" by ' . $authUser->name . '.',
                $teamLink,
                ['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $authUser->name]
            );
        }

        // ── Existing members: personalized activity + notification + email ──
        $existingMemberIds = array_values(array_filter(
            $alreadyMemberIds,
            fn($id) => (int) $id !== (int) $authUser->id
        ));

        if (!empty($existingMemberIds)) {
            $addedList = implode(', ', $addedNames);
            foreach ($existingMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_member_added',
                    $addedList . ' added to team "' . $team->name . '" by ' . $authUser->name,
                    'team', $team->id, 'member_added', $team->name
                );
                $this->notificationService->notify(
                    $memberId, $authUser->id, 'team_member_added', 'team', $team->id,
                    'New Members Added',
                    $addedList . ' added to team "' . $team->name . '" by ' . $authUser->name . '.',
                    $teamLink,
                    ['team_name' => $team->name, 'added_members' => $addedNames, 'added_by' => $authUser->name, 'current_members' => $memberNames]
                );
            }
        }

        return response()->json([
            'message' => count($newIds) === 1 ? 'Member added successfully' : count($newIds) . ' members added successfully',
            'team' => $team,
        ]);
    }

    /**
     * Remove a member from a team.
     *
     * Removed member:  "You were removed..."
     * Remaining members: "[Name] was removed..."
     * Performer:       confirmation email
     */
    public function removeMember(Team $team, User $user)
    {
        $authUser = request()->user();
        $wasLeader = (int) $team->leader_id === (int) $user->id;
        $oldLeaderName = $team->leader?->name ?? 'Not assigned';

        if ($wasLeader) {
            $team->leader_id = null;
            $team->save();
        }

        $remainingMemberIds = $team->members()->where('users.id', '!=', $user->id)->pluck('users.id')->toArray();
        $team->members()->detach($user->id);
        $team->load(['leader:id,name', 'members:id,name,role']);
        Cache::forget('all_teams_list');

        $teamLink = '/manage-team?selectedTeam=' . $team->id;
        $remainingMemberNames = $team->members->pluck('name')->toArray();

        // ── Performer: activity + confirmation email ──
        $this->activityService->log(
            $authUser->id, 'team_member_removed',
            'You removed ' . $user->name . ' from team "' . $team->name . '"',
            'team', $team->id, 'member_removed', $team->name
        );

        $confirmDetails = [
            'Member Removed' => $user->name,
            'Team Lead' => $wasLeader ? 'Position cleared (was ' . $user->name . ')' : $oldLeaderName,
            'Remaining Members' => !empty($remainingMemberNames) ? implode(', ', $remainingMemberNames) : 'None',
        ];
        if ($wasLeader) $confirmDetails['Note'] = $user->name . ' was the Team Lead. The position has been cleared.';
        $this->notificationService->confirmAction($authUser, 'Updated', 'team', $team->name, $confirmDetails);

        // ── Removed member: personalized activity + notification + email ──
        $this->activityService->log(
            $user->id, 'team_member_removed',
            'You were removed from team "' . $team->name . '" by ' . $authUser->name,
            'team', $team->id, 'member_removed', $team->name
        );
        $this->notificationService->notify(
            $user->id, $authUser->id, 'team_member_removed', 'team', $team->id,
            'Removed from Team',
            'You have been removed from the team "' . $team->name . '" by ' . $authUser->name . '.',
            '/manage-team',
            ['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'removed_by' => $authUser->name]
        );

        // ── Remaining members: personalized activity + notification + email ──
        $remainingMemberIds = array_values(array_filter(
            $remainingMemberIds,
            fn($id) => (int) $id !== (int) $authUser->id
        ));

        if (!empty($remainingMemberIds)) {
            foreach ($remainingMemberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_member_removed',
                    $user->name . ' was removed from team "' . $team->name . '" by ' . $authUser->name,
                    'team', $team->id, 'member_removed', $team->name
                );
                $this->notificationService->notify(
                    $memberId, $authUser->id, 'team_member_removed', 'team', $team->id,
                    'Member Removed',
                    $user->name . ' has been removed from the team "' . $team->name . '" by ' . $authUser->name . '.',
                    $teamLink,
                    [
                        'team_name' => $team->name,
                        'removed_member' => $user->name,
                        'team_lead' => $team->leader?->name ?? 'Not assigned',
                        'remaining_members' => $remainingMemberNames,
                        'team_size' => count($remainingMemberNames),
                        'removed_by' => $authUser->name,
                    ]
                );
            }
        }

        return response()->json([
            'message' => 'Member removed successfully',
            'team' => $team,
        ]);
    }

    /**
     * Delete a team.
     *
     * All members: activity + notification + email
     * Performer:   confirmation email
     */
    public function destroy(Team $team)
    {
        $authUser = request()->user();
        $teamName = $team->name;
        $memberIds = $team->members()->pluck('users.id')->toArray();

        // ── Performer: activity + confirmation email ──
        $this->activityService->log(
            $authUser->id, 'team_deleted',
            'You deleted team "' . $teamName . '"',
            'team', $team->id, 'deleted', $teamName
        );
        $this->notificationService->confirmAction($authUser, 'Deleted', 'team', $teamName);

        // ── All members: personalized activity + notification + email ──
        if (!empty($memberIds)) {
            foreach ($memberIds as $memberId) {
                $this->activityService->log(
                    $memberId, 'team_deleted',
                    'Team "' . $teamName . '" was deleted by ' . $authUser->name,
                    'team', $team->id, 'deleted', $teamName
                );
                $this->notificationService->notify(
                    $memberId, $authUser->id, 'team_deleted', 'team', $team->id,
                    'Team Deleted',
                    'The team "' . $teamName . '" has been deleted by ' . $authUser->name . '.',
                    '/manage-team',
                    ['team_name' => $teamName, 'deleted_by' => $authUser->name]
                );
            }
        }

        $team->delete();
        Cache::forget('all_teams_list');

        return response()->json(['message' => 'Team deleted successfully']);
    }
}
