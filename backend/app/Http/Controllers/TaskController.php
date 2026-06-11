<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\Subtask;
use App\Models\User;
use App\Models\Deliverable;
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

        $tasks = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        $tasks->getCollection()->transform(function ($task) {
            $task->item_type = 'task';
            $total = $task->deliverables()->count();
            $completed = $task->deliverables()->whereIn('status', ['approved'])->count();
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;
            return $task;
        });

        $projects = Project::where(function ($q) use ($user) {
                $q->where('created_by', $user->id)
                  ->orWhereRaw("JSON_CONTAINS(assigned_users, ?)", [json_encode($user->id)]);
            })
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
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%' . $request->input('search') . '%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->get();

        $expandedTasks = collect();
        foreach ($tasks as $task) {
            $total = $task->deliverables()->count();
            $completed = $task->deliverables()->whereIn('status', ['approved'])->count();
            $assignees = $task->assignees->isEmpty() ? collect([null]) : $task->assignees;
            foreach ($assignees as $assignee) {
                $clone = clone $task;
                $clone->assignees = $assignee ? collect([$assignee]) : collect();
                $clone->item_type = 'task';
                $clone->total_deliverables = $total;
                $clone->completed_deliverables = $completed;
                $clone->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;
                $expandedTasks->push($clone);
            }
        }

        $projects = Project::where('created_by', $userId)
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get();

        $expandedProjects = collect();
        foreach ($projects as $project) {
            $project->item_type = 'project';
            $project->total_tasks = $project->tasks()->count();
            $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
            $assignedIds = $project->assigned_users;
            if (is_string($assignedIds)) {
                $assignedIds = json_decode($assignedIds, true) ?? [];
            }
            $assignedUsers = collect($assignedIds);
            if ($assignedUsers->isEmpty()) {
                $clone = clone $project;
                $clone->assigned_user = null;
                $expandedProjects->push($clone);
            } else {
                $resolvedUsers = User::whereIn('id', $assignedUsers->toArray())->select('id', 'name', 'role')->get()->keyBy('id');
                foreach ($assignedUsers as $id) {
                    $clone = clone $project;
                    $clone->assigned_user = $resolvedUsers->get($id);
                    $expandedProjects->push($clone);
                }
            }
        }

        $allItems = $expandedTasks->merge($expandedProjects)->sortByDesc('created_at')->values();

        return response()->json([
            'data' => $allItems,
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

        $deliverables = $task->deliverables()->with(['assignee:id,name,email,role', 'latestSubmission'])->latest()->get();
        $delTotal = $deliverables->count();
        $delCompleted = $deliverables->filter(fn ($d) => $d->status === 'approved')->count();
        $delProgress = $delTotal > 0 ? (int) round(($delCompleted / $delTotal) * 100) : 0;

        return response()->json([
            'task' => array_merge($task->toArray(), [
                'subtasks' => $subtasks,
                'progress_percent' => $progress,
                'deliverables' => $deliverables,
                'deliverables_progress' => $delProgress,
                'total_deliverables' => $delTotal,
                'completed_deliverables' => $delCompleted,
            ]),
        ]);
    }

    /**
     * Create a single task and attach all selected assignees.
     * Optionally create deliverables linked to the task.
     */
    public function store(Request $request, Project $project)
    {
        $user = $request->user();

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
            'deliverables' => 'nullable|array',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.due_date' => 'nullable|date',
        ]);

        $createdTasks = [];
        foreach ($validated['assigned_to'] as $userId) {
            $task = $project->tasks()->create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'requirements' => $validated['requirements'] ?? null,
                'start_date' => $validated['start_date'] ?? now()->toDateTimeString(),
                'end_date' => $validated['end_date'] ?? null,
                'assigned_to' => $userId,
                'assigned_by' => $request->user()->id,
                'priority' => $validated['priority'],
                'status' => 'pending',
            ]);
            $task->assignees()->sync([$userId]);

            // Create deliverables for this task if provided
            if (!empty($validated['deliverables'])) {
                foreach ($validated['deliverables'] as $del) {
                    $project->deliverables()->create([
                        'task_id' => $task->id,
                        'title' => $del['title'],
                        'description' => $del['description'] ?? null,
                        'status' => 'pending',
                        'priority' => $validated['priority'],
                        'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                        'assigned_to' => $userId,
                        'created_by' => $user->id,
                    ]);
                }
            }

            $createdTasks[] = $task;
        }

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');
        $firstTask->loadCount('deliverables');

        return response()->json([
            'message' => count($createdTasks) . ' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    public function update(Request $request, Task $task)
    {
        $user = $request->user();

        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['message' => 'Unauthorized — only the task creator can edit'], 403);
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

    /**
     * Complete a task and move it to deliverables.
     */
    public function completeTask(Request $request, Task $task)
    {
        try {
            $user = $request->user();
            $isCreator = intval($task->assigned_by) === intval($user->id);
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

            if (!$isCreator && !$isAssignee) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $task->update(['status' => 'completed']);

            $deliverable = Deliverable::create([
                'project_id' => $task->project_id,
                'task_id' => $task->id,
                'title' => $task->title,
                'description' => $task->description,
                'status' => 'deliverable',
                'priority' => $task->priority,
                'due_date' => $task->end_date,
                'assigned_to' => $user->id,
                'created_by' => $task->assigned_by,
            ]);

            return response()->json([
                'message' => 'Task moved to deliverables',
                'task' => $task->fresh()->load('assignees:id,name,email,role'),
                'deliverable' => $deliverable,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to complete task: ' . $e->getMessage(),
            ], 500);
        }
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
                'start_date' => $validated['start_date'] ?? now()->toDateTimeString(),
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
        $user = request()->user();

        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['message' => 'Unauthorized — only the task creator can delete'], 403);
        }

        $task->assignees()->detach();
        $task->deliverables()->delete();
        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }
}
