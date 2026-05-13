<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;

class TaskController extends Controller
{
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

    public function destroy(Task $task)
    {
        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }
}
