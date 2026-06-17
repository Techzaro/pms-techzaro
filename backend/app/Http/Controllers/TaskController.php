<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\Subtask;
use App\Models\User;
use App\Models\Deliverable;
use App\Models\TaskFile;
use App\Models\TaskSubmission;
use App\Models\TaskWorkflowEvent;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

class TaskController extends Controller
{
    /**
     * Tasks and projects assigned TO the current user.
     * Admin and Manager see all projects.
     * Others see only projects they're associated with.
     */
    public function myTasks(Request $request)
    {
        $user = $request->user();

        $tasks = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->where('assigned_by', '!=', $user->id)
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        $tasks->getCollection()->transform(function ($task) {
            $task->item_type = 'task';
            $this->applyDeliverableProgress($task);
            return $task;
        });

        // Tasks Assigned To You: Show ONLY projects assigned TO user by OTHERS
        // Exclude projects where user created them (self-assigned go to Self Tasks)
        $projects = Project::whereJsonContains('assigned_users', $user->id)
        ->where('created_by', '!=', $user->id)
        ->where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        })
        ->with(['creator:id,name,role', 'team:id,name'])
        ->latest()
        ->get();

        $projects = $projects->map(function ($project) {
            $project->item_type = 'project';
            $this->applyProjectTaskProgress($project);
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
     * Self tasks: tasks and projects where the user is both creator AND assignee.
     */
    public function mySelfTasks(Request $request)
    {
        $user = $request->user();

        $tasks = Task::where('assigned_by', $user->id)
            ->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        $tasks->getCollection()->transform(function ($task) {
            $task->item_type = 'task';
            $this->applyDeliverableProgress($task);
            return $task;
        });

        // Self tasks: only include projects where user is BOTH creator AND assigned
        $projects = Project::where('created_by', $user->id)
        ->whereJsonContains('assigned_users', $user->id)
        ->where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        })
        ->with(['creator:id,name,role', 'team:id,name'])
        ->latest()
        ->get()
        ->map(function ($project) {
            $project->item_type = 'project';
            $this->applyProjectTaskProgress($project);
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
     * Admin and Manager see all projects.
     * Others see only projects they're associated with.
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;

        // Admin and Manager share visibility of assignments made to other users
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if ($isAdminOrManager) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();
        }

        // ── Tasks ──
        $tasksQuery = Task::with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role']);

        if ($isAdminOrManager) {
            $tasksQuery->whereIn('assigned_by', $adminManagerIds);
        } else {
            $tasksQuery->where('assigned_by', $userId);
        }

        $tasks = $tasksQuery->latest()
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%' . $request->input('search') . '%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->get();

        $expandedTasks = collect();
        foreach ($tasks as $task) {
            $deliverableProgress = $this->getDeliverableProgress($task);
            $assignees = $task->assignees->isEmpty() ? collect([null]) : $task->assignees;
            foreach ($assignees as $assignee) {
                // Skip self-assigned entries — creator assigned to themselves
                // Always check against the creator, not the viewing user
                if ($assignee) {
                    if ((int)$assignee->id === (int)$task->assigned_by) {
                        continue;
                    }
                } elseif ((int)$task->assigned_to === (int)$task->assigned_by) {
                    continue;
                }
                $clone = clone $task;
                $clone->assignees = $assignee ? collect([$assignee]) : collect();
                $clone->item_type = 'task';
                $this->applyDeliverableProgress($clone, $deliverableProgress);
                $expandedTasks->push($clone);
            }
        }

        // ── Projects ──
        $projectsQuery = Project::where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        });

        if ($isAdminOrManager) {
            $projectsQuery->whereIn('created_by', $adminManagerIds);
        } else {
            $projectsQuery->where('created_by', $user->id);
        }

        $projects = $projectsQuery
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get();

        $expandedProjects = collect();
        foreach ($projects as $project) {
            $project->item_type = 'project';
            $this->applyProjectTaskProgress($project);
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
                    // Skip self-assigned entries — creator assigned to themselves
                    if ((int)$id === (int)$project->created_by) {
                        continue;
                    }
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
            'files:id,task_id,name,url',
            'assignees:id,name,email,role',
            'assigner:id,name,email,role',
            'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
            'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ]);

        $unviewedChangesCount = $task->unviewedChanges->count();

        $subtasks = Subtask::where('task_id', $task->id)
            ->with(['assignee:id,name,email,role', 'assigner:id,name,email,role'])
            ->orderBy('created_at')
            ->get();

        $progress = 0;
        if ($subtasks->count() > 0) {
            $done = $subtasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['completed', 'done']))->count();
            $progress = (int) round(($done / $subtasks->count()) * 100);
        }

        $deliverables = $task->deliverables()->when(!$isCreator, function ($q) use ($user) {
            $q->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)
                   ->orWhere('created_by', $user->id);
            });
        })->with([
            'assignee:id,name,email,role',
            'creator:id,name,role',
            'latestSubmission',
            'latestSubmission.submittedBy:id,name,email',
            'reopenedBy:id,name',
        ])->latest()->get();

        // Add has_submitted flag per user
        $deliverableIds = $deliverables->pluck('id')->toArray();
        $submittedIds = \App\Models\DeliverableSubmission::where('submitted_by', $user->id)
            ->whereIn('deliverable_id', $deliverableIds)
            ->pluck('deliverable_id')
            ->toArray();

        $deliverables->each(function ($deliverable) use ($submittedIds) {
            $deliverable->has_submitted = in_array($deliverable->id, $submittedIds);
        });

        $deliverableProgress = $this->getDeliverableProgress($task);

        $isApproved = strtolower((string) $task->status) === 'approved';
        $pendingStatuses = ['pending', 'reopened'];

        // All task-level deliverables must be submitted before task can be submitted
        $pendingDeliverables = $task->deliverables()->where('status', 'pending')->count();
        $allDeliverablesSubmitted = $pendingDeliverables === 0;

        $changes = $task->unviewedChanges->map(fn ($c) => [
            'id' => $c->id,
            'field_name' => $c->field_name,
            'old_value' => $c->old_value,
            'new_value' => $c->new_value,
            'modified_by' => $c->modifiedBy?->name ?? 'Unknown',
            'created_at' => $c->created_at,
        ]);

        return response()->json([
            'task' => array_merge($task->toArray(), [
                'subtasks' => $subtasks,
                'progress_percent' => $progress,
                'deliverables' => $deliverables,
                'deliverables_progress' => $deliverableProgress['progress'],
                'total_deliverables' => $deliverableProgress['total'],
                'completed_deliverables' => $deliverableProgress['completed'],
                'pending_deliverables_count' => $deliverableProgress['pending'],
                'unviewed_changes' => $changes,
                'unviewed_changes_count' => $unviewedChangesCount,
                // Permission flags
                'is_creator' => $isCreator,
                'is_assignee' => $isAssignee,
                'can_edit' => $isCreator && !$isApproved,
                'can_submit' => $isAssignee && in_array($task->status, $pendingStatuses) && $allDeliverablesSubmitted,
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
                    $deliverable = $project->deliverables()->create([
                        'task_id' => $task->id,
                        'title' => $del['title'],
                        'description' => $del['description'] ?? null,
                        'status' => 'pending',
                        'priority' => $validated['priority'],
                        'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                        'assigned_to' => $userId,
                        'created_by' => $user->id,
                    ]);
                    $this->sendDeliverableAssignmentNotification($deliverable, $user);
                }
            }

            $createdTasks[] = $task;
        }

        // Send assignment notifications
        $this->sendTaskAssignmentNotifications($createdTasks, $request->user());

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');
        $firstTask->loadCount('deliverables');

        return response()->json([
            'message' => count($createdTasks) . ' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    public function storeStandalone(Request $request)
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
            $task = Task::create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'requirements' => $validated['requirements'] ?? null,
                'start_date' => $validated['start_date'] ?? now()->toDateTimeString(),
                'end_date' => $validated['end_date'] ?? null,
                'assigned_to' => $userId,
                'assigned_by' => $user->id,
                'priority' => $validated['priority'],
                'status' => 'pending',
                'project_id' => null,
            ]);
            $task->assignees()->sync([$userId]);

            if (!empty($validated['deliverables'])) {
                foreach ($validated['deliverables'] as $del) {
                    $deliverable = $task->deliverables()->create([
                        'title' => $del['title'],
                        'description' => $del['description'] ?? null,
                        'status' => 'pending',
                        'priority' => $validated['priority'],
                        'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                        'assigned_to' => $userId,
                        'created_by' => $user->id,
                    ]);
                    $this->sendDeliverableAssignmentNotification($deliverable, $user);
                }
            }

            $createdTasks[] = $task;
        }

        // Send assignment notifications
        $this->sendTaskAssignmentNotifications($createdTasks, $request->user());

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

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be edited.'
            ], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'priority' => 'sometimes|string|max:32',
            'status' => 'sometimes|string|max:64',
            'assigned_to' => 'nullable|array',
            'assigned_to.*' => 'integer|exists:users,id',
            'deliverables' => 'nullable|array',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.due_date' => 'nullable|date',
        ]);

        $assigneeIds = $validated['assigned_to'] ?? null;
        unset($validated['assigned_to']);

        // Snapshot old values before update
        $oldValues = [];
        $fieldLabels = [
            'title' => 'Title',
            'description' => 'Description',
            'start_date' => 'Start Date',
            'end_date' => 'Due Date',
            'priority' => 'Priority',
            'status' => 'Status',
        ];
        foreach (['title', 'description', 'start_date', 'end_date', 'priority', 'status'] as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $task->{$f};
            }
        }

        $oldAssigneeIds = $task->assignees()->pluck('users.id')->toArray();

        $task->update($validated);

        // Track field changes
        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $task->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = [
                    'field_name' => $f,
                    'label' => $fieldLabels[$f],
                    'old_value' => $oldStr,
                    'new_value' => $newStr,
                ];
            }
        }

        // Track assignee changes
        if (!empty($assigneeIds) && $oldAssigneeIds !== $assigneeIds) {
            $oldNames = User::whereIn('id', $oldAssigneeIds)->pluck('name')->implode(', ');
            $newNames = User::whereIn('id', $assigneeIds)->pluck('name')->implode(', ');
            $changes[] = [
                'field_name' => 'assigned_to',
                'label' => 'Assignee',
                'old_value' => $oldNames ?: 'None',
                'new_value' => $newNames ?: 'None',
            ];
            $task->assignees()->sync($assigneeIds);
            $task->update(['assigned_to' => $assigneeIds[0]]);
        }

        // Track new deliverables
        $addedDeliverables = [];
        if (!empty($validated['deliverables'])) {
            foreach ($validated['deliverables'] as $del) {
                $deliverable = $task->deliverables()->create([
                    'title' => $del['title'],
                    'description' => $del['description'] ?? null,
                    'due_date' => $del['due_date'] ?? null,
                    'assigned_to' => $task->assigned_to,
                    'created_by' => $user->id,
                ]);
                $this->sendDeliverableAssignmentNotification($deliverable, $user);
                $addedDeliverables[] = $del['title'];
            }
            $changes[] = [
                'field_name' => 'deliverables',
                'label' => 'Deliverable Added',
                'old_value' => '',
                'new_value' => implode(', ', $addedDeliverables),
            ];
        }

        // Create TaskChange records
        foreach ($changes as $c) {
            $task->changes()->create([
                'field_name' => $c['field_name'],
                'old_value' => $c['old_value'],
                'new_value' => $c['new_value'],
                'modified_by' => $user->id,
                'is_viewed' => false,
            ]);
            TaskWorkflowEvent::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'field_changed',
                'comment' => $c['label'] . ': ' . $c['old_value'] . ' → ' . $c['new_value'],
            ]);
        }

        $changeCount = count($changes);

        // Notify assignees about the update
        $this->sendTaskUpdateNotification($task, $user, $changeCount);

        return response()->json([
            'message' => $changeCount > 0
                ? 'Task updated — ' . $changeCount . ' change(s) made'
                : 'Task updated successfully',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
            'changes_count' => $changeCount,
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

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be modified.'
            ], 403);
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
                'status' => 'pending',
                'priority' => $task->priority,
                'due_date' => $task->end_date,
                'assigned_to' => $user->id,
                'created_by' => $task->assigned_by,
            ]);

            // Notify assigner that task was completed
            if ($task->assigned_by && $task->assigned_by !== $user->id) {
                Notification::create([
                    'user_id' => $task->assigned_by,
                    'sender_user_id' => $user->id,
                    'type' => 'task_completed',
                    'related_module' => 'task',
                    'related_id' => $task->id,
                    'title' => 'Task Completed',
                    'message' => $user->name . ' has marked the task "' . $task->title . '" as completed.',
'link' => '/tasks/task-details/' . $task->id . '?from=taskby',
            ]);
        }

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

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be modified.'
            ], 403);
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

    /**
     * Submit a task (Assignee action).
     */
    public function submit(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isAssignee) {
            return response()->json(['message' => 'Only the assignee can submit this task'], 403);
        }

        if (!in_array($task->status, ['pending', 'reopened'])) {
            return response()->json(['message' => 'This task cannot be submitted in its current status'], 422);
        }

        // All task deliverables must be submitted before task can be submitted
        $pendingDeliverables = $task->deliverables()->where('status', 'pending')->count();
        if ($pendingDeliverables > 0) {
            return response()->json(['message' => 'All deliverables must be submitted before submitting this task'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,ppt,pptx,txt|max:51200',
            'files' => 'nullable|array',
            'files.*' => 'file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,ppt,pptx,txt|max:51200',
            'links' => 'nullable|array',
            'links.*' => 'string|max:2048',
        ]);

        $filePath = null;
        $fileName = null;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('task-submissions/' . $task->id, 'public');
        }

        $submission = TaskSubmission::create([
            'task_id' => $task->id,
            'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        // Handle multiple files
        if ($request->hasFile('files')) {
            foreach ($request->file('files') as $file) {
                $originalName = $file->getClientOriginalName();
                $mimeType = $file->getMimeType();
                $path = $file->store('task-submissions/' . $task->id, 'public');
                $isImage = str_starts_with($mimeType, 'image/');

                $submission->attachments()->create([
                    'submission_type' => 'task',
                    'file_name' => basename($path),
                    'original_name' => $originalName,
                    'file_path' => $path,
                    'file_type' => $mimeType,
                    'file_size' => $file->getSize(),
                    'attachment_type' => $isImage ? 'image' : 'file',
                    'url' => '/storage/' . $path,
                ]);
            }
        }

        // Handle links
        if (!empty($validated['links'])) {
            foreach ($validated['links'] as $linkUrl) {
                $submission->attachments()->create([
                    'submission_type' => 'task',
                    'file_name' => $linkUrl,
                    'original_name' => $linkUrl,
                    'attachment_type' => 'link',
                    'url' => $linkUrl,
                ]);
            }
        }

        $isResubmit = $task->status === 'reopened';

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        $updateData = [
            'status' => 'submitted',
            'submitted_at' => now(),
        ];

        if ($task->status === 'reopened') {
            $updateData['rejected_at'] = null;
            $updateData['rejected_by'] = null;
            $updateData['rejection_comment'] = null;
            $updateData['reopened_at'] = null;
            $updateData['reopened_by'] = null;
            $updateData['reopen_comment'] = null;
            $updateData['reopen_instructions'] = null;
            $updateData['reopen_new_deadline'] = null;
            $updateData['reopen_file_path'] = null;
            $updateData['reopen_file_name'] = null;
        }

        $task->update($updateData);

        $assignerId = $task->assigned_by;
        if ($assignerId && $assignerId !== $user->id) {
            Notification::create([
                'user_id' => $assignerId,
                'sender_user_id' => $user->id,
                'type' => 'task_submitted',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Submitted',
                'message' => $user->name . ' has completed the task "' . $task->title . '" and submitted it for review.',
                'link' => '/tasks/task-details/' . $task->id . '?from=taskby',
            ]);
        }

        return response()->json([
            'message' => 'Task submitted successfully',
            'task' => $task->fresh()->load([
                'assignees:id,name,email,role',
                'assigner:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name',
                'rejectedBy:id,name',
                'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Approve a submitted task (Assigner action).
     */
    public function approve(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($task->status !== 'submitted') {
            return response()->json(['message' => 'Can only approve submitted tasks'], 422);
        }

        $task->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'approved',
        ]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        foreach ($assigneeIds as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                Notification::create([
                    'user_id' => $assigneeId,
                    'sender_user_id' => $user->id,
                    'type' => 'task_approved',
                    'related_module' => 'task',
                    'related_id' => $task->id,
                    'title' => 'Task Approved',
                    'message' => 'Your task "' . $task->title . '" has been approved.',
                    'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
                ]);
            }
        }

        return response()->json([
            'message' => 'Task approved successfully',
            'task' => $task->fresh()->load([
                'assignees:id,name,email,role',
                'assigner:id,name',
                'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Reject a submitted task permanently (Assigner action).
     */
    public function reject(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($task->status !== 'submitted') {
            return response()->json(['message' => 'Can only reject submitted tasks'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
        ]);

        $task->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'rejected',
            'comment' => $validated['comment'] ?? null,
        ]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        foreach ($assigneeIds as $assigneeId) {
            $msg = 'Your task "' . $task->title . '" has been rejected. Please make the required changes.';
            if (!empty($validated['comment'])) {
                $msg .= ' Reason: ' . $validated['comment'];
            }
            Notification::create([
                'user_id' => $assigneeId,
                'sender_user_id' => $user->id,
                'type' => 'task_rejected',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Rejected',
                'message' => $msg,
                'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
            ]);
        }

        return response()->json([
            'message' => 'Task rejected',
            'task' => $task->fresh()->load([
                'assignees:id,name,email,role',
                'assigner:id,name',
                'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Reject & reopen a submitted task for revision (Assigner action).
     */
    public function reopen(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($task->status !== 'submitted') {
            return response()->json(['message' => 'Can only reopen submitted tasks'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date',
            'file' => 'nullable|file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif|max:51200',
        ]);

        $filePath = null;
        $fileName = null;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('task-reopen/' . $task->id, 'public');
        }

        $updateData = [
            'status' => 'reopened',
            'reopened_at' => now(),
            'reopened_by' => $user->id,
            'reopen_comment' => $validated['comment'] ?? null,
            'reopen_instructions' => $validated['instructions'] ?? null,
        ];

        if (!empty($validated['new_deadline'])) {
            $updateData['reopen_new_deadline'] = $validated['new_deadline'];
            $updateData['end_date'] = $validated['new_deadline'];
        }

        if (!empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $task->update($updateData);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'reopened',
            'comment' => $validated['comment'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        foreach ($assigneeIds as $assigneeId) {
            $msg = 'Your task "' . $task->title . '" has been reopened for revision.';
            if (!empty($validated['comment'])) {
                $msg .= ' Comment: ' . $validated['comment'];
            }
            if (!empty($validated['instructions'])) {
                $msg .= ' Instructions: ' . $validated['instructions'];
            }
            Notification::create([
                'user_id' => $assigneeId,
                'sender_user_id' => $user->id,
                'type' => 'task_reopened',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Reopened',
                'message' => $msg,
                'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
            ]);
        }

        return response()->json([
            'message' => 'Task reopened successfully',
            'task' => $task->fresh()->load([
                'assignees:id,name,email,role',
                'assigner:id,name',
                'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Get the latest submission for a task.
     */
    public function latestSubmission(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $submission = TaskSubmission::where('task_id', $task->id)
            ->with('submittedBy:id,name,email')
            ->latest()
            ->first();

        return response()->json(['submission' => $submission]);
    }

    /**
     * Download a task submission file.
     */
    public function downloadSubmissionFile(TaskSubmission $submission)
    {
        $user = request()->user();
        $task = $submission->task;

        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    public function markChangesRead(Task $task)
    {
        $user = request()->user();
        $task->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['message' => 'Changes marked as read']);
    }

    private function sendTaskAssignmentNotifications(array $tasks, \App\Models\User $sender): void
    {
        $sent = [];
        foreach ($tasks as $task) {
            $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
            foreach ($assigneeIds as $assigneeId) {
                if ((int) $assigneeId === (int) $sender->id) {
                    continue;
                }
                if (in_array($assigneeId, $sent)) {
                    continue;
                }
                $sent[] = $assigneeId;
                Notification::create([
                    'user_id' => $assigneeId,
                    'sender_user_id' => $sender->id,
                    'type' => 'task_assigned',
                    'related_module' => 'task',
                    'related_id' => $task->id,
                    'title' => 'Task Assigned',
                    'message' => 'A new task "' . $task->title . '" has been assigned to you by ' . $sender->name . '.',
                    'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
                ]);
            }
        }
    }

    private function sendTaskUpdateNotification(\App\Models\Task $task, \App\Models\User $updater, int $changeCount = 0): void
    {
        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        foreach ($assigneeIds as $assigneeId) {
            if ((int) $assigneeId === (int) $updater->id) {
                continue;
            }
            $msg = 'The task "' . $task->title . '" has been updated by ' . $updater->name . '.';
            if ($changeCount > 0) {
                $msg .= ' ' . $changeCount . ' change(s) were made.';
            }
            $msg .= ' Click to review changes.';
            Notification::create([
                'user_id' => $assigneeId,
                'sender_user_id' => $updater->id,
                'type' => 'task_updated',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Updated',
                'message' => $msg,
                'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
            ]);
        }
    }

    private function getDeliverableProgress(Task $task): array
    {
        $total = $task->deliverables()->count();
        $completed = $task->deliverables()->where('status', 'approved')->count();
        $pending = $task->deliverables()->where('status', 'pending')->count();

        return [
            'total' => $total,
            'completed' => $completed,
            'pending' => $pending,
            'progress' => $total > 0 ? (int) round(($completed / $total) * 100) : 0,
        ];
    }

    private function applyDeliverableProgress(Task $task, ?array $progress = null): Task
    {
        $progress ??= $this->getDeliverableProgress($task);

        $task->total_deliverables = $progress['total'];
        $task->completed_deliverables = $progress['completed'];
        $task->approved_deliverables = $progress['completed'];
        $task->pending_deliverables_count = $progress['pending'];
        $task->deliverables_progress = $progress['progress'];

        return $task;
    }

    private function completedProjectTaskStatuses(): array
    {
        return ['approved', 'completed', 'done'];
    }

    private function applyProjectTaskProgress(Project $project): Project
    {
        $total = $project->tasks()->count();
        $completed = $project->tasks()->whereIn('status', $this->completedProjectTaskStatuses())->count();
        $pendingDeliverables = $project->deliverables()->whereNull('task_id')->where('status', 'pending')->count();
        $incomplete = max(0, $total - $completed);
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        $project->total_tasks = $total;
        $project->completed_tasks = $completed;
        $project->pending_tasks_count = $incomplete;
        $project->pending_deliverables_count = $pendingDeliverables;
        $project->can_submit = in_array($project->status, $submittableStatuses, true)
            && $incomplete === 0
            && $pendingDeliverables === 0;

        return $project;
    }

    private function sendDeliverableAssignmentNotification(\App\Models\Deliverable $deliverable, \App\Models\User $sender): void
    {
        if (!$deliverable->assigned_to || (int) $deliverable->assigned_to === (int) $sender->id) {
            return;
        }

        $taskTitle = '';
        if ($deliverable->task_id) {
            $deliverable->loadMissing('task:id,title');
            $taskTitle = $deliverable->task->title ?? '';
        }

        $dueDate = '';
        if ($deliverable->due_date) {
            $dueDate = $deliverable->due_date->format('d-M-Y');
        }

        $message = 'You have been assigned a new deliverable: "' . $deliverable->title . '"';
        if ($taskTitle) {
            $message .= "\n\nTask: " . $taskTitle;
        }
        if ($dueDate) {
            $message .= "\n\nDue Date: " . $dueDate;
        }

        Notification::create([
            'user_id' => $deliverable->assigned_to,
            'sender_user_id' => $sender->id,
            'type' => 'deliverable_assigned',
            'related_module' => 'deliverable',
            'related_id' => $deliverable->id,
            'title' => 'Deliverable Assigned',
            'message' => $message,
            'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
        ]);
    }

    public function destroy(Task $task)
    {
        $user = request()->user();

        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['message' => 'Unauthorized — only the task creator can delete'], 403);
        }

        $task->assignees()->detach();
        $task->deliverables()->delete();
        $task->files()->delete();
        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }

    /**
     * Upload a file attachment to a task.
     */
    public function uploadFile(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be modified.'
            ], 403);
        }

        $validated = $request->validate([
            'file' => 'required|file|max:10240',
        ]);

        $file = $request->file('file');
        $path = $file->store('task-files/' . $task->id, 'public');

        $attachment = $task->files()->create([
            'name' => $file->getClientOriginalName(),
            'url' => '/storage/' . $path,
        ]);

        return response()->json([
            'message' => 'File uploaded successfully',
            'file' => $attachment,
        ], 201);
    }

    /**
     * Add a link attachment to a task.
     */
    public function addLink(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be modified.'
            ], 403);
        }

        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'name' => 'nullable|string|max:255',
        ]);

        $attachment = $task->files()->create([
            'name' => $validated['name'] ?? $validated['url'],
            'url' => $validated['url'],
        ]);

        return response()->json([
            'message' => 'Link added successfully',
            'file' => $attachment,
        ], 201);
    }

    /**
     * Delete a file attachment from a task.
     */
    public function deleteFile(Task $task, TaskFile $file)
    {
        $user = request()->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (strtolower((string) $task->status) === 'approved') {
            return response()->json([
                'message' => 'Approved tasks cannot be modified.'
            ], 403);
        }

        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            $fullPath = storage_path('app/public/' . $relativePath);
            if (file_exists($fullPath)) {
                unlink($fullPath);
            }
        }

        $file->delete();

        return response()->json([
            'message' => 'File deleted successfully',
        ]);
        
    }
    
}
