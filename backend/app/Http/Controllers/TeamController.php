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
        ]);

        $team = Team::create([
            'name' => $validated['name'],
            'leader_id' => null,
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Team created successfully',
            'team' => $team->load(['leader:id,name', 'members:id,name']),
        ], 201);
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
            'user_id' => 'required|exists:users,id',
        ]);

        if ($team->members()->where('user_id', $validated['user_id'])->exists()) {
            return response()->json([
                'message' => 'This user is already a member of the team.',
            ], 409);
        }

        $team->members()->attach($validated['user_id']);

        return response()->json([
            'message' => 'Member added successfully',
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
