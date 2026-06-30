<?php

/**
 * Controller for team creation, member assignment, and leader management.
 */

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Team management controller.
 * Handles teams, members, leaders, and deletion.
 */
class TeamController extends Controller
{
    /**
     * Return all teams with their leaders and members.
     *
     * Results are cached for 5 minutes to reduce database load.
     *
     * @return \Illuminate\Http\JsonResponse  JSON response with all teams.
     */
    public function index()
    {
        $teams = Team::with(['leader:id,name', 'members:id,name,role'])->orderBy('created_at', 'desc')->get();
        return response()->json($teams);
    }

    /**
     * Create a new team with optional initial members.
     *
     * The team leader is set to null by default. Use setLeader endpoint to assign one.
     *
     * @param  \Illuminate\Http\Request  $request  Input: name (required), description (optional), member_ids[] (optional).
     * @return \Illuminate\Http\JsonResponse  JSON response with the created team.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'nullable|array',
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $team = Team::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'leader_id' => null,
            'created_by' => $request->user()->id,
        ]);

        if (!empty($validated['member_ids'])) {
            $uniqueIds = array_unique($validated['member_ids']);
            $team->members()->attach($uniqueIds);
        }

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name,role']),
        ], 201);
    }

    /**
     * Return a single team with its leader and members.
     *
     * @param  \App\Models\Team  $team  The team to retrieve.
     * @return \Illuminate\Http\JsonResponse  JSON response with the team.
     */
    public function show(Team $team)
    {
        $team->load(['leader:id,name', 'members:id,name,role']);
        return response()->json($team);
    }

    /**
     * Update a team's name, description, and member list.
     *
     * If the current leader is removed from the team, the leader is automatically cleared.
     *
     * @param  \Illuminate\Http\Request  $request  Input: name (required), description (optional), member_ids[] (optional).
     * @param  \App\Models\Team  $team  The team to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated team.
     */
    public function update(Request $request, Team $team)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'member_ids' => 'nullable|array',
            'member_ids.*' => 'integer|exists:users,id',
        ]);

        $team->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        if (isset($validated['member_ids'])) {
            $uniqueIds = array_unique($validated['member_ids']);
            $team->members()->sync($uniqueIds);

            if ($team->leader_id && !$team->members()->whereKey($team->leader_id)->exists()) {
                $team->leader_id = null;
                $team->save();
            }
        }

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => 'Team updated successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name,role']),
        ]);
    }

    /**
     * Set or change the team leader for a team.
     *
     * The leader must be an existing team member with the 'team_lead' role.
     *
     * @param  \Illuminate\Http\Request  $request  Input: leader_id (required, must exist in users table).
     * @param  \App\Models\Team  $team  The team to set the leader for.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated team.
     */
    public function setLeader(Request $request, Team $team)
    {
        $validated = $request->validate([
            'leader_id' => 'required|exists:users,id',
        ]);

        if (!$team->members()->whereKey($validated['leader_id'])->exists()) {
            return response()->json([
                'message' => 'Team leader must be one of the team members.',
            ], 422);
        }

        $user = User::findOrFail($validated['leader_id']);

        $userRole = $user->role === 'teamlead' ? 'team_lead' : $user->role;
        if ($userRole !== 'team_lead') {
            return response()->json([
                'message' => 'This user cannot be assigned as Team Lead. First update this user\'s role to "Team Lead" from Edit User, then you can assign them as Team Lead.',
            ], 422);
        }

        $team->leader_id = $validated['leader_id'];
        $team->save();

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => 'Team leader updated successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name,role']),
        ]);
    }

    /**
     * Add one or more members to a team.
     *
     * Skips users who are already members. Accepts either a single user_id or an array of user_ids.
     *
     * @param  \Illuminate\Http\Request  $request  Input: user_id (single) or user_ids[] (array).
     * @param  \App\Models\Team  $team  The team to add members to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated team.
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

        $alreadyMemberIds = $team->members()
            ->whereIn('user_id', $idsToAttach)
            ->pluck('user_id')
            ->toArray();

        $newIds = array_diff($idsToAttach, $alreadyMemberIds);

        if (empty($newIds)) {
            return response()->json([
                'message' => 'All selected users are already members of this team.',
            ], 409);
        }

        $team->members()->attach($newIds);

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => count($newIds) === 1
                ? 'Member added successfully'
                : count($newIds) . ' members added successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name,role']),
        ]);
    }

    /**
     * Remove a member from a team.
     *
     * If the removed member is the team leader, the leader is automatically cleared.
     *
     * @param  \App\Models\Team  $team  The team to remove the member from.
     * @param  \App\Models\User  $user  The user to remove from the team.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated team.
     */
    public function removeMember(Team $team, User $user)
    {
        if ((int) $team->leader_id === (int) $user->id) {
            $team->leader_id = null;
            $team->save();
        }

        $team->members()->detach($user->id);

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => 'Member removed successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name,role']),
        ]);
    }

    /**
     * Delete a team. This will remove the team and its member associations.
     *
     * @param  \App\Models\Team  $team  The team to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function destroy(Team $team)
    {
        $team->delete();

        Cache::forget('all_teams_list');

        return response()->json([
            'message' => 'Team deleted successfully',
        ]);
    }
}
