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
use App\Models\Activity;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class TeamController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    public function index(Request $request)
    {
        $query = Team::with(['leader:id,name,department', 'members:id,name,role,department']);

        $days = $request->query('days') ?? $request->query('time_filter');
        if ($days && is_numeric($days) && (int) $days > 0) {
            $query->where('created_at', '>=', now()->subDays((int) $days));
        }

        $startDate = $request->query('start_date');
        $endDate = $request->query('end_date');
        if ($startDate && $endDate) {
            $query->whereBetween('created_at', [
                date('Y-m-d 00:00:00', strtotime($startDate)),
                date('Y-m-d 23:59:59', strtotime($endDate))
            ]);
        }

        $teams = $query->orderBy('created_at', 'desc')->get();
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
                'leader:id,name,role,department,designation,professional_email',
                'members:id,name,role,department,designation,professional_email',
            ])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($teams);
    }

    public function show(Team $team)
    {
        $team->load(['leader:id,name,department', 'members:id,name,role,department']);
        return response()->json($team);
    }

    /**
     * Create a new team with mandatory initial members.
     *
     * Performer:  activity + confirmation email
     * Each member: activity ("You were added...") + notification + email
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'required|array|min:1',
            'member_ids.*' => 'integer|exists:users,id',
            'leader_id' => 'nullable|integer|exists:users,id',
            'team_lead_id' => 'nullable|integer|exists:users,id',
            'status' => 'nullable|string|max:50',
            'is_draft' => 'nullable|boolean',
            'working_hours' => 'nullable|array',
        ], [
            'member_ids.required' => 'At least one team member is required.',
            'member_ids.min' => 'At least one team member is required.',
        ]);

        $user = $request->user();
        $leaderId = $validated['leader_id'] ?? $validated['team_lead_id'] ?? null;

        if ($leaderId && !empty($validated['member_ids']) && !in_array((int) $leaderId, array_map('intval', $validated['member_ids']))) {
            return response()->json(['message' => 'Team leader must be one of the team members.'], 422);
        }

        $isDraft = (isset($validated['status']) && strtolower($validated['status']) === 'draft') || !empty($validated['is_draft']);

        $team = Team::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'leader_id' => $leaderId,
            'created_by' => $user->id,
            'status' => $isDraft ? 'draft' : ($validated['status'] ?? 'active'),
            'is_draft' => $isDraft,
            'working_hours' => $validated['working_hours'] ?? null,
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

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'create',
                description: "Created team {$team->name}",
                user: $user,
                entityType: 'Team',
                entityId: $team->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $this->notificationService->confirmAction($user, 'Created', 'team', $team->name, [
            'Team Lead' => $leaderName,
            'Members' => !empty($memberNames) ? implode(', ', $memberNames) : 'None',
            'Created On' => $team->created_at->format('d M Y, g:i A'),
        ]);

        // ── Each member: personalized activity + notification + email (role-based) ──
        if (!empty($validated['member_ids'])) {
            $now = now()->toDateTimeString();
            $activities = [];
            $notifications = [];
            $memberIds = array_values(array_filter(array_unique($validated['member_ids']), fn($id) => (int) $id !== (int) $user->id));
            foreach ($memberIds as $memberId) {
                $isLeader = $leaderId && (int) $memberId === (int) $leaderId;

                $activities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_created',
                    'description' => $isLeader
                        ? 'You have been appointed as Team Lead of team "' . $team->name . '" by ' . $user->name
                        : 'You were added to team "' . $team->name . '" by ' . $user->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => $isLeader ? 'leader_changed' : 'created', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $this->clearDashboardCache($memberId);

                $notifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $user->id,
                    'type' => $isLeader ? 'team_leader_changed' : 'team_created',
                    'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => $isLeader ? 'Team Leader Assigned' : 'You Have Been Added to a Team',
                    'message' => $isLeader
                        ? 'You have been appointed as the Team Lead of "' . $team->name . '" by ' . $user->name . '.'
                        : 'You have been added to the team "' . $team->name . '" by ' . $user->name . '.',
                    'link' => $teamLink,
                    'changes' => json_encode(['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $user->name]),
                ];
            }
            if (!empty($activities)) Activity::insert($activities);
            if (!empty($notifications)) $this->notificationService->createBulk($notifications);
        }

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team,
        ], 201);
    }

    /**
     * Update a team's name, description, leader, and member list.
     *
     * Detects what changed and sends personalized messages to each recipient role.
     */
    public function update(Request $request, Team $team)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'required|array|min:1',
            'member_ids.*' => 'integer|exists:users,id',
            'leader_id' => 'nullable|integer|exists:users,id',
            'team_lead_id' => 'nullable|integer|exists:users,id',
            'working_hours' => 'nullable|array',
        ], [
            'member_ids.required' => 'At least one team member is required.',
            'member_ids.min' => 'At least one team member is required.',
        ]);

        $user = $request->user();

        $oldName = $team->name;
        $oldDescription = $team->description;
        $oldMemberIds = $team->members()->pluck('users.id')->toArray();
        $oldLeaderId = $team->leader_id;

        $newLeaderId = $validated['leader_id'] ?? $validated['team_lead_id'] ?? $oldLeaderId;

        $nameChanged = $oldName !== $validated['name'];
        $descriptionChanged = ($oldDescription ?? '') !== ($validated['description'] ?? '');
        $leaderChanged = (int) $oldLeaderId !== (int) $newLeaderId;

        $teamUpdateData = [
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'leader_id' => $newLeaderId,
        ];
        if (array_key_exists('working_hours', $validated)) {
            $teamUpdateData['working_hours'] = $validated['working_hours'];
        }

        $team->update($teamUpdateData);

        $newMemberIds = [];
        $removedMemberIds = [];
        if (isset($validated['member_ids'])) {
            $uniqueIds = array_unique($validated['member_ids']);
            if ($newLeaderId && !in_array((int)$newLeaderId, array_map('intval', $uniqueIds))) {
                $uniqueIds[] = (int) $newLeaderId;
            }
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

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'update',
                description: "Updated team {$team->name}",
                user: $user,
                entityType: 'Team',
                entityId: $team->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $confirmDetails = ['Team Lead' => $leaderName];
        if ($nameChanged) $confirmDetails['Name Changed'] = '"' . $oldName . '" to "' . $team->name . '"';
        if ($descriptionChanged) $confirmDetails['Description'] = 'Updated';
        if (!empty($newMemberIds)) $confirmDetails['Members Added'] = implode(', ', $addedNames ?? []);
        if (!empty($removedMemberIds)) $confirmDetails['Members Removed'] = implode(', ', $removedNames ?? []);
        $confirmDetails['Current Members'] = !empty($memberNames) ? implode(', ', $memberNames) : 'None';
        $this->notificationService->confirmAction($user, 'Updated', 'team', $team->name, $confirmDetails);

        // ── Newly added members: personalized activity + notification + email ──
        $now = now()->toDateTimeString();
        $bulkActivities = [];
        $bulkNotifications = [];

        if (!empty($newMemberIds)) {
            foreach ($newMemberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_member_added',
                    'description' => 'You were added to team "' . $team->name . '" by ' . $user->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'member_added', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $user->id,
                    'type' => 'team_member_added', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'You Have Been Added to a Team',
                    'message' => 'You have been added to the team "' . $team->name . '" by ' . $user->name . '.',
                    'link' => $teamLink,
                    'changes' => json_encode(['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $user->name]),
                ];
            }
        }

        // ── Removed members: personalized activity + notification + email ──
        if (!empty($removedMemberIds)) {
            foreach ($removedMemberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_member_removed',
                    'description' => 'You were removed from team "' . $oldName . '" by ' . $user->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'member_removed', 'entity_name' => $oldName,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $user->id,
                    'type' => 'team_member_removed', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'Removed from Team',
                    'message' => 'You have been removed from the team "' . $oldName . '" by ' . $user->name . '.',
                    'link' => '/manage-team',
                    'changes' => json_encode(['team_name' => $oldName, 'removed_by' => $user->name]),
                ];
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
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_updated',
                    'description' => 'Team "' . $team->name . '" was updated by ' . $user->name . ' — ' . $infoMsg,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'updated', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $user->id,
                    'type' => 'team_updated', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'Team Updated',
                    'message' => 'The team "' . $team->name . '" has been updated by ' . $user->name . '. Changes: ' . $infoMsg . '.',
                    'link' => $teamLink,
                    'changes' => json_encode(['team_name' => $team->name, 'updated_by' => $user->name, 'changes' => $infoMsg]),
                ];
            }
        }

        if (!empty($bulkActivities)) Activity::insert($bulkActivities);
        if (!empty($bulkNotifications)) $this->notificationService->createBulk($bulkNotifications);

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

        // Batch activities and notifications for all recipients
        $now = now()->toDateTimeString();
        $bulkActivities = [];
        $bulkNotifications = [];

        // ── New leader: personalized activity + notification ──
        $bulkActivities[] = [
            'user_id' => $newLeader->id, 'activity_type' => 'team_leader_changed',
            'description' => 'You have been assigned as Team Lead of "' . $team->name . '" by ' . $authUser->name,
            'related_module' => 'team', 'related_id' => $team->id,
            'action' => 'leader_changed', 'entity_name' => $team->name,
            'created_at' => $now, 'updated_at' => $now,
        ];
        $bulkNotifications[] = [
            'user_id' => $newLeader->id, 'sender_user_id' => $authUser->id,
            'type' => 'team_leader_changed', 'related_module' => 'team',
            'related_id' => $team->id,
            'title' => 'Team Leader Changed',
            'message' => 'You have been assigned as the Team Lead of "' . $team->name . '" by ' . $authUser->name . '.',
            'link' => $teamLink,
            'changes' => json_encode(['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]),
        ];

        // ── Old leader (if different): personalized activity + notification ──
        if ($oldLeaderId && (int) $oldLeaderId !== (int) $newLeader->id) {
            $bulkActivities[] = [
                'user_id' => $oldLeaderId, 'activity_type' => 'team_leader_changed',
                'description' => 'You are no longer the Team Lead of "' . $team->name . '". ' . $newLeader->name . ' has been appointed.',
                'related_module' => 'team', 'related_id' => $team->id,
                'action' => 'leader_changed', 'entity_name' => $team->name,
                'created_at' => $now, 'updated_at' => $now,
            ];
            $bulkNotifications[] = [
                'user_id' => $oldLeaderId, 'sender_user_id' => $authUser->id,
                'type' => 'team_leader_changed', 'related_module' => 'team',
                'related_id' => $team->id,
                'title' => 'Team Leader Changed',
                'message' => 'You are no longer the Team Lead of "' . $team->name . '". ' . $newLeader->name . ' has been appointed by ' . $authUser->name . '.',
                'link' => $teamLink,
                'changes' => json_encode(['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]),
            ];
        }

        // ── All other members: personalized activity + notification ──
        $otherMemberIds = array_values(array_filter(
            $team->members->pluck('id')->toArray(),
            fn($id) => (int) $id !== (int) $newLeader->id
                && (int) $id !== (int) $oldLeaderId
                && (int) $id !== (int) $authUser->id
        ));

        if (!empty($otherMemberIds)) {
            foreach ($otherMemberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_leader_changed',
                    'description' => 'Team Lead of "' . $team->name . '" changed from ' . $oldLeaderName . ' to ' . $newLeader->name . ' by ' . $authUser->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'leader_changed', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $authUser->id,
                    'type' => 'team_leader_changed', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'Team Leader Changed',
                    'message' => 'The Team Lead for "' . $team->name . '" has been changed from ' . $oldLeaderName . ' to ' . $newLeader->name . ' by ' . $authUser->name . '.',
                    'link' => $teamLink,
                    'changes' => json_encode(['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'new_leader' => $newLeader->name, 'changed_by' => $authUser->name]),
                ];
            }
        }

        if (!empty($bulkActivities)) Activity::insert($bulkActivities);
        if (!empty($bulkNotifications)) $this->notificationService->createBulk($bulkNotifications);

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

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'add_member',
                description: "Added member(s) to team {$team->name}",
                user: $authUser,
                entityType: 'Team',
                entityId: $team->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $this->notificationService->confirmAction($authUser, 'Updated', 'team', $team->name, [
            'Action' => 'Added member(s)',
            'Members Added' => implode(', ', $addedNames),
            'Team Lead' => $leaderName,
            'Current Members' => implode(', ', $memberNames),
        ]);

        // ── New members: personalized activity + notification ──
        $now = now()->toDateTimeString();
        $bulkActivities = [];
        $bulkNotifications = [];

        foreach ($newIds as $memberId) {
            $bulkActivities[] = [
                'user_id' => $memberId, 'activity_type' => 'team_member_added',
                'description' => 'You were added to team "' . $team->name . '" by ' . $authUser->name,
                'related_module' => 'team', 'related_id' => $team->id,
                'action' => 'member_added', 'entity_name' => $team->name,
                'created_at' => $now, 'updated_at' => $now,
            ];
            $bulkNotifications[] = [
                'user_id' => $memberId, 'sender_user_id' => $authUser->id,
                'type' => 'team_member_added', 'related_module' => 'team',
                'related_id' => $team->id,
                'title' => 'You Have Been Added to a Team',
                'message' => 'You have been added to the team "' . $team->name . '" by ' . $authUser->name . '.',
                'link' => $teamLink,
                'changes' => json_encode(['team_name' => $team->name, 'team_lead' => $leaderName, 'members' => $memberNames, 'added_by' => $authUser->name]),
            ];
        }

        // ── Existing members: personalized activity + notification ──
        $existingMemberIds = array_values(array_filter(
            $alreadyMemberIds,
            fn($id) => (int) $id !== (int) $authUser->id
        ));

        if (!empty($existingMemberIds)) {
            $addedList = implode(', ', $addedNames);
            foreach ($existingMemberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_member_added',
                    'description' => $addedList . ' added to team "' . $team->name . '" by ' . $authUser->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'member_added', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $authUser->id,
                    'type' => 'team_member_added', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'New Members Added',
                    'message' => $addedList . ' added to team "' . $team->name . '" by ' . $authUser->name . '.',
                    'link' => $teamLink,
                    'changes' => json_encode(['team_name' => $team->name, 'added_members' => $addedNames, 'added_by' => $authUser->name, 'current_members' => $memberNames]),
                ];
            }
        }

        if (!empty($bulkActivities)) Activity::insert($bulkActivities);
        if (!empty($bulkNotifications)) $this->notificationService->createBulk($bulkNotifications);

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

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'remove_member',
                description: "Removed member {$user->name} from team {$team->name}",
                user: $authUser,
                entityType: 'Team',
                entityId: $team->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $confirmDetails = [
            'Member Removed' => $user->name,
            'Team Lead' => $wasLeader ? 'Position cleared (was ' . $user->name . ')' : $oldLeaderName,
            'Remaining Members' => !empty($remainingMemberNames) ? implode(', ', $remainingMemberNames) : 'None',
        ];
        if ($wasLeader) $confirmDetails['Note'] = $user->name . ' was the Team Lead. The position has been cleared.';
        $this->notificationService->confirmAction($authUser, 'Updated', 'team', $team->name, $confirmDetails);

        // ── Removed member + Remaining members: batch activities + notifications ──
        $now = now()->toDateTimeString();
        $bulkActivities = [];
        $bulkNotifications = [];

        $bulkActivities[] = [
            'user_id' => $user->id, 'activity_type' => 'team_member_removed',
            'description' => 'You were removed from team "' . $team->name . '" by ' . $authUser->name,
            'related_module' => 'team', 'related_id' => $team->id,
            'action' => 'member_removed', 'entity_name' => $team->name,
            'created_at' => $now, 'updated_at' => $now,
        ];
        $bulkNotifications[] = [
            'user_id' => $user->id, 'sender_user_id' => $authUser->id,
            'type' => 'team_member_removed', 'related_module' => 'team',
            'related_id' => $team->id,
            'title' => 'Removed from Team',
            'message' => 'You have been removed from the team "' . $team->name . '" by ' . $authUser->name . '.',
            'link' => '/manage-team',
            'changes' => json_encode(['team_name' => $team->name, 'previous_leader' => $oldLeaderName, 'removed_by' => $authUser->name]),
        ];

        $remainingMemberIds = array_values(array_filter(
            $remainingMemberIds,
            fn($id) => (int) $id !== (int) $authUser->id
        ));

        if (!empty($remainingMemberIds)) {
            foreach ($remainingMemberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_member_removed',
                    'description' => $user->name . ' was removed from team "' . $team->name . '" by ' . $authUser->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'member_removed', 'entity_name' => $team->name,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $authUser->id,
                    'type' => 'team_member_removed', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'Member Removed',
                    'message' => $user->name . ' has been removed from the team "' . $team->name . '" by ' . $authUser->name . '.',
                    'link' => $teamLink,
                    'changes' => json_encode([
                        'team_name' => $team->name,
                        'removed_member' => $user->name,
                        'team_lead' => $team->leader?->name ?? 'Not assigned',
                        'remaining_members' => $remainingMemberNames,
                        'team_size' => count($remainingMemberNames),
                        'removed_by' => $authUser->name,
                    ]),
                ];
            }
        }

        if (!empty($bulkActivities)) Activity::insert($bulkActivities);
        if (!empty($bulkNotifications)) $this->notificationService->createBulk($bulkNotifications);

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
        $memberIds = array_values(array_filter(
            $team->members()->pluck('users.id')->toArray(),
            fn($id) => (int) $id !== (int) $authUser->id
        ));

        // ── Performer: activity + confirmation email ──
        $this->activityService->log(
            $authUser->id, 'team_deleted',
            'You deleted team "' . $teamName . '"',
            'team', $team->id, 'deleted', $teamName
        );
        $this->notificationService->confirmAction($authUser, 'Deleted', 'team', $teamName);

        // ── All members: batch activities + notifications ──
        if (!empty($memberIds)) {
            $now = now()->toDateTimeString();
            $bulkActivities = [];
            $bulkNotifications = [];
            foreach ($memberIds as $memberId) {
                $bulkActivities[] = [
                    'user_id' => $memberId, 'activity_type' => 'team_deleted',
                    'description' => 'Team "' . $teamName . '" was deleted by ' . $authUser->name,
                    'related_module' => 'team', 'related_id' => $team->id,
                    'action' => 'deleted', 'entity_name' => $teamName,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $bulkNotifications[] = [
                    'user_id' => $memberId, 'sender_user_id' => $authUser->id,
                    'type' => 'team_deleted', 'related_module' => 'team',
                    'related_id' => $team->id,
                    'title' => 'Team Deleted',
                    'message' => 'The team "' . $teamName . '" has been deleted by ' . $authUser->name . '.',
                    'link' => '/manage-team',
                    'changes' => json_encode(['team_name' => $teamName, 'deleted_by' => $authUser->name]),
                ];
            }
            Activity::insert($bulkActivities);
            $this->notificationService->createBulk($bulkNotifications);
        }

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'delete',
                description: "Deleted team {$teamName}",
                user: $authUser,
                entityType: 'Team',
                entityId: $team->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $team->delete();
        Cache::forget('all_teams_list');

        return response()->json(['message' => 'Team deleted successfully']);
    }

    /**
     * Get working hours for a specific team.
     */
    public function getWorkingHours(Team $team)
    {
        return response()->json([
            'success' => true,
            'data' => [
                'team_id'       => $team->id,
                'team_name'     => $team->name,
                'working_hours' => $team->working_hours,
            ],
            'working_hours' => $team->working_hours,
        ]);
    }

    /**
     * Update working hours for a specific team.
     * Accessible by Admin, Manager, or the designated Team Lead of this team.
     */
    public function updateWorkingHours(Request $request, Team $team)
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);
        $isTeamLead = (int) $team->leader_id === (int) $user->id;

        if (!$isAdmin && !$isTeamLead) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only Team Lead or Admin/Manager can update team working hours.',
            ], 403);
        }

        $validated = $request->validate([
            'working_hours' => 'nullable|array',
        ]);

        $oldWorkingHours = $team->working_hours;
        $team->update([
            'working_hours' => $validated['working_hours'] ?? null,
        ]);

        try {
            $this->auditService->log(
                module: 'team_management',
                action: 'update_working_hours',
                description: "Updated working hours for team {$team->name}",
                user: $user,
                entityType: 'Team',
                entityId: $team->id,
                oldValues: ['working_hours' => $oldWorkingHours],
                newValues: ['working_hours' => $team->working_hours],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Team working hours updated successfully.',
            'data' => [
                'team_id'       => $team->id,
                'team_name'     => $team->name,
                'working_hours' => $team->working_hours,
            ],
            'team' => $team,
        ]);
    }
}

