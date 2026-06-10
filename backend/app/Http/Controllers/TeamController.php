<?php

/**
 * Controller for team creation, member assignment, and leader management.
 */

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Team management controller.
 * Handles teams, members, leaders, and deletion.
 */
class TeamController extends Controller
{
    /**
     * Return all teams with leaders and members.
     */
    public function index()
    {
        $teams = Team::with(['leader:id,name', 'members:id,name'])->orderBy('created_at', 'desc')->get();
        return response()->json($teams);
    }

    /**
     * Validate request data and create a new resource.
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

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ], 201);
    }

    /**
     * Return a single team with leader and members.
     */
    public function show(Team $team)
    {
        $team->load(['leader:id,name', 'members:id,name']);
        return response()->json($team);
    }

    /**
     * Update the specified team's name, description, and members.
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

        return response()->json([
            'message' => 'Team updated successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ]);
    }

    /**
     * Set the team leader for a team.
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

        $team->leader_id = $validated['leader_id'];
        $team->save();

        return response()->json([
            'message' => 'Team leader updated successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ]);
    }

    /**
     * Attach a member to the specified team.
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

        return response()->json([
            'message' => count($newIds) === 1
                ? 'Member added successfully'
                : count($newIds) . ' members added successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ]);
    }

    /**
     * Remove a member from the specified team.
     */

    public function removeMember(Team $team, User $user)
    {
        if ((int) $team->leader_id === (int) $user->id) {
            $team->leader_id = null;
            $team->save();
        }

        $team->members()->detach($user->id);

        return response()->json([
            'message' => 'Member removed successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ]);
    }

    /**
     * Delete the specified resource.
     */

    public function destroy(Team $team)
    {
        $team->delete();

        return response()->json([
            'message' => 'Team deleted successfully',
        ]);
    }
}
