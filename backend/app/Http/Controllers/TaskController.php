<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\Subtask;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class TaskController extends Controller
{
    /**
     * Tasks and projects assigned TO the current user.
     */
    public function myTasks(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;

        $tasks = Task::where(function ($q) use ($userId) {
                $q->whereHas('assignees', fn ($sub) => $sub->where('users.id', $userId))
                  ->orWhereHas('project', fn ($sub) => $sub->whereRaw("JSON_CONTAINS(assigned_users, ?)", [json_encode($userId)]));
            })
            ->with(['project:id,title,team_id,assigned_users', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        $projectIds = Project::whereRaw("JSON_CONTAINS(assigned_users, ?)", [json_encode($userId)])
            ->pluck('id');

        $tasks->getCollection()->transform(function ($task) {
            $task->item_type = 'task';
            return $task;
        });

        $projects = Project::whereIn('id', $projectIds)
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get()
            ->map(function ($project) {
                $project->item_type = 'project';
                $project->total_tasks = $project->tasks()->count();
                $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
                return $project;
            });

        $allItems = $tasks->getCollection()->merge($projects)->sortByDesc('created_at')->values();

        return response()->json([
            'data' => $allItems,
            'current_page' => $tasks->currentPage(),
            'last_page' => $tasks->lastPage(),
            'per_page' => $tasks->perPage(),
            'total' => $tasks->total() + $projects->count(),
        ]);
    }

    /**
     * Tasks and projects assigned BY the current user (creator).
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;

        $tasks = Task::where('assigned_by', $userId)
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        $tasks->getCollection()->transform(function ($task) {
            $task->item_type = 'task';
            return $task;
        });

        $projects = Project::where('created_by', $userId)
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get()
            ->map(function ($project) {
                $project->item_type = 'project';
                $project->total_tasks = $project->tasks()->count();
                $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
                $project->assigned_users_resolved = $project->assigned_users_resolved;
                return $project;
            });

        $allItems = $tasks->getCollection()->merge($projects)->sortByDesc('created_at')->values();

        return response()->json([
            'data' => $allItems,
            'current_page' => $tasks->currentPage(),
            'last_page' => $tasks->lastPage(),
            'per_page' => $tasks->perPage(),
            'total' => $tasks->total() + $projects->count(),
        ]);
    }

    /**
     * Show a single task — only the creator or assignees may view it.
     */
    public function show(Task $task)
    {
        $user = request()->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $task->load([
            'project:id,title,team_id,created_by,client_name,category,budget,priority,goals_checklist,sidebar_notes,sheets_documents,website_link,website_name,status,start_date,end_date',
            'project.creator:id,name,email,role',
            'project.team:id,name',
            'project.team.leader:id,name',
            'project.team.members:id,name,email,role',
            'project.milestones:id,project_id,title,due_date,status,sort_order',
            'project.activities:id,project_id,user_id,summary,created_at',
            'project.activities.user:id,name',
            'project.files:id,project_id,name,url',
            'assignees:id,name,email,role',
            'assigner:id,name,email,role',
        ]);

        $subtasks = Subtask::where('task_id', $task->id)
            ->with(['assignee:id,name,email,role', 'assigner:id,name,email,role'])
            ->orderBy('created_at')
            ->get();

        $progress = 0;
        if ($subtasks->count() > 0) {
            $done = $subtasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['completed', 'done']))->count();
            $progress = (int) round(($done / $subtasks->count()) * 100);
        }

        return response()->json([
            'task' => array_merge($task->toArray(), [
                'subtasks' => $subtasks,
                'progress_percent' => $progress,
            ]),
        ]);
    }

    /**
     * Create a single task and attach all selected assignees.
     */
    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'requirements' => 'nullable|array',
            'requirements.*' => 'required_with:requirements|string|max:500',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'assigned_to' => 'required|array|min:1',
            'assigned_to.*' => 'exists:users,id',
            'priority' => 'required|string|max:32',
        ]);

        $task = $project->tasks()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'requirements' => $validated['requirements'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'end_date' => $validated['end_date'] ?? null,
            'assigned_to' => $validated['assigned_to'][0],
            'assigned_by' => $request->user()->id,
            'priority' => $validated['priority'],
            'status' => 'pending',
        ]);

        $task->assignees()->sync($validated['assigned_to']);

        return response()->json([
            'message' => 'Task created successfully',
            'task' => $task->load('assignees:id,name,email,role'),
        ], 201);
    }

    public function update(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'priority' => 'sometimes|string|max:32',
            'status' => 'sometimes|string|max:64',
        ]);

        $task->update($validated);

        return response()->json([
            'message' => 'Task updated successfully',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
        ]);
    }

    public function updateStatus(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|string|max:64|in:pending,in_progress,review,completed,done,failed,abandoned',
        ]);

        $task->update(['status' => $validated['status']]);

        return response()->json([
            'message' => 'Task status updated',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
        ]);
    }

    public function storeSubtask(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'assigned_to' => 'required|array|min:1',
            'assigned_to.*' => 'exists:users,id',
            'priority' => 'required|string|max:32',
        ]);

        $subtasks = [];
        foreach ($validated['assigned_to'] as $userId) {
            $subtasks[] = Subtask::create([
                'task_id' => $task->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'assigned_to' => (int) $userId,
                'assigned_by' => $request->user()->id,
                'priority' => $validated['priority'],
                'status' => 'pending',
            ]);
        }

        return response()->json([
            'message' => count($subtasks) . ' subtask(s) created successfully',
            'subtasks' => $subtasks,
        ], 201);
    }

    public function destroy(Task $task)
    {
        $task->assignees()->detach();
        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }
}
