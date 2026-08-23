<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskFollowerController extends Controller
{
    /**
     * List all followers for a task.
     */
    public function index(Request $request, Task $task): JsonResponse
    {
        $followers = $task->followers()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar', 'users.role')
            ->get();

        return response()->json([
            'success' => true,
            'followers' => $followers,
        ]);
    }

    /**
     * Add a follower to the task.
     */
    public function addFollower(Request $request, Task $task): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        $userId = ! empty($validated['user_id']) ? (int) $validated['user_id'] : (int) $request->user()->id;

        $task->followers()->syncWithoutDetaching([$userId]);

        $followers = $task->followers()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar', 'users.role')
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Follower added successfully.',
            'followers' => $followers,
        ]);
    }

    /**
     * Remove a follower from the task.
     */
    public function removeFollower(Request $request, Task $task, ?User $user = null): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        $userId = $user?->id
            ?? (! empty($validated['user_id']) ? (int) $validated['user_id'] : null)
            ?? (int) $request->user()->id;

        $task->followers()->detach($userId);

        $followers = $task->followers()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar', 'users.role')
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Follower removed successfully.',
            'followers' => $followers,
        ]);
    }
}
