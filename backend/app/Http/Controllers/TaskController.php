<?php

/**
 * Controller for task CRUD operations, status changes, and filtering.
 */

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Task controller for full CRUD, status updates, and filtering.
 */
class TaskController extends Controller
{
    /**
     * Get tasks assigned to the current user.
     */
    public function myTasks(Request $request)
    {
        $user = $request->user();
        $tasks = Task::where('assigned_to', $user->id)
            ->with(['project:id,title,team_id', 'assignee:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        return response()->json($tasks);
    }

    /**
     * Get tasks assigned by the current user (tasks in projects they created).
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $projectIds = Project::where('created_by', $user->id)->pluck('id');

        $tasks = Task::whereIn('project_id', $projectIds)
            ->with(['project:id,title,team_id', 'assignee:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        return response()->json($tasks);
    }

    /**
     * Show a single task with all relations.
     */
    public function show(Task $task)
    {
        $task->load([
            'project:id,title,team_id,created_by',
            'assignee:id,name,email,role',
            'project.team:id,name',
        ]);

        return response()->json([
            'task' => $task,
        ]);
    }

    /**
     * Create a new task under a given project.
     */
    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id',
            'priority' => 'nullable|string|max:32',
            'status' => 'nullable|string|max:64',
        ]);

        $task = $project->tasks()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'end_date' => $validated['end_date'] ?? null,
            'assigned_to' => !empty($validated['assigned_to']) ? (int) $validated['assigned_to'] : null,
            'priority' => $validated['priority'] ?? 'Medium',
            'status' => $validated['status'] ?? 'pending',
        ]);

        return response()->json([
            'message' => 'Task created successfully',
            'task' => $task->load('assignee:id,name,email,role'),
        ], 201);
    }

    /**
     * Update task details.
     */
    public function update(Request $request, Task $task)
    {
        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'assigned_to' => 'sometimes|nullable|exists:users,id',
            'priority' => 'sometimes|string|max:32',
            'status' => 'sometimes|string|max:64',
        ]);

        $task->update($validated);

        return response()->json([
            'message' => 'Task updated successfully',
            'task' => $task->fresh()->load('assignee:id,name,email,role'),
        ]);
    }

    /**
     * Update only the task status.
     */
    public function updateStatus(Request $request, Task $task)
    {
        $validated = $request->validate([
            'status' => 'required|string|max:64|in:pending,in_progress,review,completed,done,failed,abandoned',
        ]);

        $task->update(['status' => $validated['status']]);

        return response()->json([
            'message' => 'Task status updated',
            'task' => $task->fresh()->load('assignee:id,name,email,role'),
        ]);
    }

    /**
     * Delete the provided task.
     */
    public function destroy(Task $task)
    {
        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }
}
