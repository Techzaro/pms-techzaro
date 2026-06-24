<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Subtask;
use App\Models\Task;
use App\Models\TaskFile;
use App\Models\TaskSubmission;
use App\Models\TaskWorkflowEvent;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TaskController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService
    ) {}
    public function myTasks(Request $request)
    {
        $user = $request->user();
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isApprovedFilter = $request->input('status') === 'approved';
        $isPendingFilter = $request->input('status') === 'pending';
        $isSubmittedFilter = $request->input('status') === 'submitted';
        $isReopenedFilter = $request->input('status') === 'reopened';
        $isRejectedFilter = $request->input('status') === 'rejected';
        $statusFilter = $request->input('status');
        $filters = $request->query();
        if ($isDueTodayFilter || $isPendingFilter) unset($filters['status']);

        $tasksQuery = Task::where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                  ->orWhere('assigned_to', $user->id);
            })
            ->where('assigned_by', '!=', $user->id)
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($filters);

        $tasks = $tasksQuery->paginate(15);

        // Bulk load deliverable counts for all tasks in this page
        $taskIds = $tasks->getCollection()->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $tasks->getCollection()->transform(function ($task) use ($dlvStats) {
            $task->item_type = 'task';
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->pending_deliverables_count = $pending;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;
            return $task;
        });

        $projects = Project::whereJsonContains('assigned_users', $user->id)
            ->where('created_by', '!=', $user->id)
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->where(function ($q) {
                $q->whereNotNull('assigned_users')->whereRaw('JSON_LENGTH(assigned_users) > 0');
            })
            ->when($isApprovedFilter, fn ($q) => $q->where('status', 'approved'))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isSubmittedFilter, fn ($q) => $q->where('status', 'submitted'))
            ->when($isReopenedFilter, fn ($q) => $q->where('status', 'reopened'))
            ->when($isRejectedFilter, fn ($q) => $q->where('status', 'rejected'))
            ->when($statusFilter && !$isDueTodayFilter && !in_array($statusFilter, ['approved', 'pending', 'submitted', 'reopened', 'rejected']), fn ($q) => $q->where('status', $statusFilter))
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get();

        $projects = $projects->map(function ($project) use ($user) {
            $project->item_type = 'project';
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
            $project->is_assigned = $isAssigned;
            $project->can_submit = in_array($project->status, $submittableStatuses) && $isAssigned;
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

    public function mySelfTasks(Request $request)
    {
        $user = $request->user();
        $isApprovedFilter = $request->input('status') === 'approved';
        $isPendingFilter = $request->input('status') === 'pending';
        $isSubmittedFilter = $request->input('status') === 'submitted';
        $isReopenedFilter = $request->input('status') === 'reopened';
        $isRejectedFilter = $request->input('status') === 'rejected';
        $filters = $request->query();
        if ($isPendingFilter) unset($filters['status']);

        $tasks = Task::where('assigned_by', $user->id)
            ->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                  ->orWhere('assigned_to', $user->id);
            })
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest()
            ->filter($filters)
            ->paginate(15);

        // Bulk load deliverable counts
        $taskIds = $tasks->getCollection()->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $tasks->getCollection()->transform(function ($task) use ($dlvStats) {
            $task->item_type = 'task';
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->pending_deliverables_count = $pending;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;
            return $task;
        });

        $projects = Project::where('created_by', $user->id)
            ->whereJsonContains('assigned_users', $user->id)
            ->where(function ($q) { $q->whereNotNull('assigned_users')->whereRaw('JSON_LENGTH(assigned_users) > 0'); })
            ->when($isApprovedFilter, fn ($q) => $q->where('status', 'approved'))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isSubmittedFilter, fn ($q) => $q->where('status', 'submitted'))
            ->when($isReopenedFilter, fn ($q) => $q->where('status', 'reopened'))
            ->when($isRejectedFilter, fn ($q) => $q->where('status', 'rejected'))
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get()
            ->map(function ($project) use ($user) {
                $project->item_type = 'project';
                $isAssigned = in_array($user->id, $project->assigned_users ?? []);
                $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
                $project->is_assigned = $isAssigned;
                $project->can_submit = in_array($project->status, $submittableStatuses) && $isAssigned;
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

    public function userTasks(Request $request, $userId)
    {
        try {
            return $this->handleUserTasks($request, $userId);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('userTasks error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'userId' => $userId,
            ]);
            return response()->json(['error' => $e->getMessage(), 'data' => [], 'total' => 0], 500);
        }
    }

    private function handleUserTasks(Request $request, $userId)
    {
        $targetUser = User::find($userId);
        if (!$targetUser) {
            return response()->json(['data' => [], 'total' => 0]);
        }

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isApprovedFilter = $request->input('status') === 'approved';
        $isPendingFilter = $request->input('status') === 'pending';
        $isSubmittedFilter = $request->input('status') === 'submitted';
        $isReopenedFilter = $request->input('status') === 'reopened';
        $isRejectedFilter = $request->input('status') === 'rejected';
        $statusFilter = $request->input('status');
        $search = $request->input('search');

        $tasksQuery = Task::where(function ($q) use ($userId) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $userId))
                  ->orWhere('assigned_to', $userId);
            })
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($search, fn ($q) => $q->where('title', 'like', '%' . $search . '%'))
            ->when($statusFilter && !$isDueTodayFilter && !$isPendingFilter, fn ($q) => $q->where('status', $statusFilter))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->latest();

        $tasks = $tasksQuery->get();

        $taskIds = $tasks->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $expandedTasks = collect();
        foreach ($tasks as $task) {
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;

            $clone = clone $task;
            $clone->item_type = 'task';
            $clone->total_deliverables = $total;
            $clone->completed_deliverables = $completed;
            $clone->pending_deliverables_count = $pending;
            $clone->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;
            $expandedTasks->push($clone);
        }

        $projectsQuery = Project::whereJsonContains('assigned_users', (int)$userId)
            ->where(function ($q) {
                $q->whereNotNull('assigned_users')->whereRaw('JSON_LENGTH(assigned_users) > 0');
            })
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isApprovedFilter, fn ($q) => $q->where('status', 'approved'))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isSubmittedFilter, fn ($q) => $q->where('status', 'submitted'))
            ->when($isReopenedFilter, fn ($q) => $q->where('status', 'reopened'))
            ->when($isRejectedFilter, fn ($q) => $q->where('status', 'rejected'))
            ->when($search, fn ($q) => $q->where('title', 'like', '%' . $search . '%'))
            ->when($statusFilter && !$isDueTodayFilter && !in_array($statusFilter, ['approved', 'pending', 'submitted', 'reopened', 'rejected']), fn ($q) => $q->where('status', $statusFilter))
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest();

        $projects = $projectsQuery->get();

        $expandedProjects = collect();
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
        foreach ($projects as $project) {
            $clone = clone $project;
            $clone->item_type = 'project';
            $clone->assigned_user = $targetUser;
            $clone->is_assigned = true;
            $clone->can_submit = in_array($clone->status, $submittableStatuses);
            $expandedProjects->push($clone);
        }

        $allItems = $expandedTasks->merge($expandedProjects)->sortByDesc('created_at')->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isApprovedFilter = $request->input('status') === 'approved';
        $isPendingFilter = $request->input('status') === 'pending';
        $isSubmittedFilter = $request->input('status') === 'submitted';
        $isReopenedFilter = $request->input('status') === 'reopened';
        $isRejectedFilter = $request->input('status') === 'rejected';
        $statusFilter = $request->input('status');
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if ($isAdminOrManager) {
            $adminManagerIds = Cache::remember('admin_manager_ids', 3600, fn () =>
                User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray()
            );
        }

        $tasksQuery = Task::with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role']);

        if ($isAdminOrManager) {
            $tasksQuery->whereIn('assigned_by', $adminManagerIds)
                ->where(function ($q) { $q->whereColumn('assigned_by', '!=', 'assigned_to')->orWhereNull('assigned_to'); });
        } else {
            $tasksQuery->where('assigned_by', $userId);
        }

        $tasks = $tasksQuery->latest()
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%' . $request->input('search') . '%'))
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($request->filled('status') && !$isDueTodayFilter && !$isPendingFilter, fn ($q) => $q->where('status', $request->input('status')))
            ->get();

        // Bulk load deliverable counts
        $taskIds = $tasks->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $expandedTasks = collect();
        foreach ($tasks as $task) {
            $stats = $dlvStats->get($task->id);
            $progress = $stats ? [
                'total' => (int) $stats->total,
                'completed' => (int) $stats->completed,
                'pending' => (int) $stats->pending,
                'progress' => ($stats->total ?? 0) > 0 ? (int) round((($stats->completed ?? 0) / $stats->total) * 100) : 0,
            ] : ['total' => 0, 'completed' => 0, 'pending' => 0, 'progress' => 0];

            $assignees = $task->assignees->isEmpty() ? collect([null]) : $task->assignees;
            foreach ($assignees as $assignee) {
                if ($assignee && (int)$assignee->id === (int)$task->assigned_by) continue;
                if (!$assignee && (int)$task->assigned_to === (int)$task->assigned_by) continue;

                $clone = clone $task;
                $clone->assignees = $assignee ? collect([$assignee]) : collect();
                $clone->item_type = 'task';
                $clone->total_deliverables = $progress['total'];
                $clone->completed_deliverables = $progress['completed'];
                $clone->pending_deliverables_count = $progress['pending'];
                $clone->deliverables_progress = $progress['progress'];
                $expandedTasks->push($clone);
            }
        }

        $projectsQuery = Project::where(function ($q) {
            $q->whereNotNull('assigned_users')->whereRaw('JSON_LENGTH(assigned_users) > 0');
        });

        if ($isAdminOrManager) {
            $projectsQuery->whereIn('created_by', $adminManagerIds);
        } else {
            $projectsQuery->where('created_by', $user->id);
        }

        $projects = $projectsQuery
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isApprovedFilter, fn ($q) => $q->where('status', 'approved'))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isSubmittedFilter, fn ($q) => $q->where('status', 'submitted'))
            ->when($isReopenedFilter, fn ($q) => $q->where('status', 'reopened'))
            ->when($isRejectedFilter, fn ($q) => $q->where('status', 'rejected'))
            ->when($statusFilter && !$isDueTodayFilter && !in_array($statusFilter, ['approved', 'pending', 'submitted', 'reopened', 'rejected']), fn ($q) => $q->where('status', $statusFilter))
            ->with(['creator:id,name,role', 'team:id,name'])
            ->latest()
            ->get();

        $expandedProjects = collect();
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
        foreach ($projects as $project) {
            $project->item_type = 'project';
            $assignedIds = $project->assigned_users;
            if (is_string($assignedIds)) $assignedIds = json_decode($assignedIds, true) ?? [];
            $assignedUsers = collect($assignedIds);

            if ($assignedUsers->isEmpty()) {
                $clone = clone $project;
                $clone->assigned_user = null;
                $clone->is_assigned = false;
                $clone->can_submit = false;
                $expandedProjects->push($clone);
            } else {
                $resolvedUsers = User::whereIn('id', $assignedUsers->toArray())->select('id', 'name', 'role')->get()->keyBy('id');
                foreach ($assignedUsers as $id) {
                    if ((int)$id === (int)$project->created_by) continue;
                    $clone = clone $project;
                    $clone->assigned_user = $resolvedUsers->get($id);
                    $isAssignedToUser = (int)$id === (int)$user->id;
                    $clone->is_assigned = $isAssignedToUser;
                    $clone->can_submit = in_array($clone->status, $submittableStatuses) && $isAssignedToUser;
                    $expandedProjects->push($clone);
                }
            }
        }

        $allItems = $expandedTasks->merge($expandedProjects)->sortByDesc('created_at')->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    public function show(Task $task)
    {
        $user = request()->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isProjectCreator = $task->project && $task->project->created_by === $user->id;
        $isTeamLeader = $task->project && $task->project->team && $task->project->team->leader_id === $user->id;
        $isTeamMember = $task->project && $task->project->team && $task->project->team->members()
            ->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !$isAdminOrManager && !$isProjectCreator && !$isTeamLeader && !$isTeamMember) {
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

        $subtasks = Subtask::where('task_id', $task->id)
            ->with(['assignee:id,name,email,role', 'assigner:id,name,email,role'])
            ->orderBy('created_at')
            ->get();

        $progress = 0;
        if ($subtasks->count() > 0) {
            $done = $subtasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['completed', 'done']))->count();
            $progress = (int) round(($done / $subtasks->count()) * 100);
        }

        // Single query for deliverables with stats
        $deliverables = $task->deliverables()->when(!$isCreator, function ($q) use ($user) {
            $q->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)->orWhere('created_by', $user->id);
            });
        })->with([
            'assignee:id,name,email,role', 'creator:id,name,role',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'reopenedBy:id,name',
        ])->latest()->get();

        $deliverableIds = $deliverables->pluck('id');
        $submittedIds = $deliverableIds->isNotEmpty()
            ? DeliverableSubmission::where('submitted_by', $user->id)->whereIn('deliverable_id', $deliverableIds)->pluck('deliverable_id')->toArray()
            : [];

        $deliverables->each(function ($deliverable) use ($submittedIds) {
            $deliverable->has_submitted = in_array($deliverable->id, $submittedIds);
        });

        // Bulk stats for deliverable progress
        $dlvStats = $deliverableIds->isNotEmpty()
            ? Deliverable::selectRaw('COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->where('task_id', $task->id)
                ->first()
            : (object)['total' => 0, 'completed' => 0, 'pending' => 0];

        $isApproved = strtolower((string) $task->status) === 'approved';
        $pendingStatuses = ['pending', 'reopened'];
        $pendingDeliverables = $dlvStats->pending ?? 0;
        $allDeliverablesSubmitted = (int) $pendingDeliverables === 0;

        $changes = $task->unviewedChanges->map(fn ($c) => [
            'id' => $c->id, 'field_name' => $c->field_name,
            'old_value' => $c->old_value, 'new_value' => $c->new_value,
            'modified_by' => $c->modifiedBy?->name ?? 'Unknown', 'created_at' => $c->created_at,
        ]);

        $payload = $task->toArray();
        $payload['subtasks'] = $subtasks;
        $payload['progress_percent'] = $progress;
        $payload['deliverables'] = $deliverables;
        $payload['deliverables_progress'] = (int) $dlvStats->total > 0 ? (int) round(((int) $dlvStats->completed / max((int) $dlvStats->total, 1)) * 100) : 0;
        $payload['total_deliverables'] = (int) $dlvStats->total;
        $payload['completed_deliverables'] = (int) $dlvStats->completed;
        $payload['pending_deliverables_count'] = (int) $dlvStats->pending;
        $payload['unviewed_changes'] = $changes;
        $payload['unviewed_changes_count'] = $task->unviewedChanges->count();
        $payload['is_creator'] = $isCreator;
        $payload['is_assignee'] = $isAssignee;
        $payload['can_edit'] = $isCreator && !$isApproved;
        $payload['can_submit'] = $isAssignee && in_array($task->status, $pendingStatuses) && $allDeliverablesSubmitted;

        return response()->json(['task' => $payload]);
    }

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
        $deliverablesToCreate = [];
        $notifications = [];

        foreach ($validated['assigned_to'] as $userId) {
            $task = $project->tasks()->create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'requirements' => $validated['requirements'] ?? null,
                'start_date' => $validated['start_date'] ?? now()->toDateTimeString(),
                'end_date' => $validated['end_date'] ?? null,
                'assigned_to' => $userId,
                'assigned_by' => $user->id,
                'priority' => $validated['priority'],
                'status' => 'pending',
            ]);
            $task->assignees()->sync([$userId]);

            // Create workflow event for task creation/assignment
            $assignee = User::find($userId);
            TaskWorkflowEvent::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to ' . $assignee->name : null,
            ]);

            // Create separate assignment event for the assignee's activity feed
            if ($assignee && (int) $userId !== (int) $user->id) {
                TaskWorkflowEvent::create([
                    'task_id' => $task->id,
                    'user_id' => $user->id,
                    'action' => 'assigned',
                    'comment' => 'Assigned to ' . $assignee->name,
                ]);
            }

            if (!empty($validated['deliverables'])) {
                foreach ($validated['deliverables'] as $del) {
                    $deliverablesToCreate[] = [
                        'project_id' => $project->id,
                        'task_id' => $task->id,
                        'title' => $del['title'],
                        'description' => $del['description'] ?? null,
                        'status' => 'pending',
                        'priority' => $validated['priority'],
                        'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                        'assigned_to' => $userId,
                        'created_by' => $user->id,
                    ];
                }
            }

            $createdTasks[] = $task;
        }

        if (!empty($deliverablesToCreate)) {
            foreach ($deliverablesToCreate as $delData) {
                $newDeliverable = Deliverable::create($delData);
                if ($newDeliverable->assigned_to && (int) $newDeliverable->assigned_to !== (int) $user->id) {
                    $this->notificationService->notify(
                        $newDeliverable->assigned_to,
                        $user->id,
                        'deliverable_assigned',
                        'deliverable',
                        $newDeliverable->id,
                        'Deliverable Assigned',
                        'A new deliverable "' . $newDeliverable->title . '" has been assigned to you by ' . $user->name . '.',
                        '/deliveries?selectedDeliverable=' . $newDeliverable->id
                    );
                }
            }
        }

        // Bulk notifications
        $sent = [];
        $notifications = [];
        foreach ($createdTasks as $task) {
            foreach ($validated['assigned_to'] as $assigneeId) {
                if ((int) $assigneeId === (int) $user->id || in_array($assigneeId, $sent)) continue;
                $sent[] = $assigneeId;
                $notifications[] = [
                    'user_id' => $assigneeId, 'sender_user_id' => $user->id,
                    'type' => 'task_assigned', 'related_module' => 'task',
                    'related_id' => $task->id, 'title' => 'Task Assigned',
                    'message' => 'A new task "' . $task->title . '" has been assigned to you by ' . $user->name . '.',
                    'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
                ];
            }
        }
        $this->notificationService->createBulk($notifications);

        // Log activity
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->activityService->log($user->id, 'task_created', 'You created ' . $taskCount . ' task(s) and assigned them to ' . $assigneeNames, 'task', $createdTasks[0]->id);

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');

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
        $notifications = [];

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

            // Create workflow event for task creation/assignment
            $assignee = User::find($userId);
            TaskWorkflowEvent::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to ' . $assignee->name : null,
            ]);

            // Create separate assignment event for the assignee's activity feed
            if ($assignee && (int) $userId !== (int) $user->id) {
                TaskWorkflowEvent::create([
                    'task_id' => $task->id,
                    'user_id' => $user->id,
                    'action' => 'assigned',
                    'comment' => 'Assigned to ' . $assignee->name,
                ]);
            }

            if (!empty($validated['deliverables'])) {
                $createdDeliverables = $task->deliverables()->createMany(
                    collect($validated['deliverables'])->map(fn ($del) => [
                        'title' => $del['title'], 'description' => $del['description'] ?? null,
                        'status' => 'pending', 'priority' => $validated['priority'],
                        'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                        'assigned_to' => $userId, 'created_by' => $user->id,
                    ])->toArray()
                );
                foreach ($createdDeliverables as $deliverable) {
                    if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
                        $this->notificationService->notify(
                            $deliverable->assigned_to,
                            $user->id,
                            'deliverable_assigned',
                            'deliverable',
                            $deliverable->id,
                            'Deliverable Assigned',
                            'A new deliverable "' . $deliverable->title . '" has been assigned to you by ' . $user->name . '.',
                            '/deliveries?selectedDeliverable=' . $deliverable->id
                        );
                    }
                }
            }

            $createdTasks[] = $task;
        }

        $sent = [];
        $notifications = [];
        foreach ($createdTasks as $task) {
            foreach ($validated['assigned_to'] as $assigneeId) {
                if ((int) $assigneeId === (int) $user->id || in_array($assigneeId, $sent)) continue;
                $sent[] = $assigneeId;
                $notifications[] = [
                    'user_id' => $assigneeId, 'sender_user_id' => $user->id,
                    'type' => 'task_assigned', 'related_module' => 'task',
                    'related_id' => $task->id, 'title' => 'Task Assigned',
                    'message' => 'A new task "' . $task->title . '" has been assigned to you by ' . $user->name . '.',
                    'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
                ];
            }
        }
        $this->notificationService->createBulk($notifications);

        // Log activity
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->activityService->log($user->id, 'task_created', 'You created ' . $taskCount . ' task(s) and assigned them to ' . $assigneeNames, 'task', $createdTasks[0]->id);

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');

        return response()->json([
            'message' => count($createdTasks) . ' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    public function update(Request $request, Task $task)
    {
        $user = $request->user();
        if ((int) $task->assigned_by !== (int) $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized — only the task creator can edit'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['message' => 'Approved tasks cannot be edited.'], 403);
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

        $oldValues = [];
        foreach (['title', 'description', 'start_date', 'end_date', 'priority', 'status'] as $f) {
            if (array_key_exists($f, $validated)) $oldValues[$f] = $task->{$f};
        }

        $oldAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $task->update($validated);

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $task->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = ['field_name' => $f, 'label' => ucfirst(str_replace('_', ' ', $f)), 'old_value' => $oldStr, 'new_value' => $newStr];
            }
        }

        if (!empty($assigneeIds) && $oldAssigneeIds !== $assigneeIds) {
            $oldNames = User::whereIn('id', $oldAssigneeIds)->pluck('name')->implode(', ');
            $newNames = User::whereIn('id', $assigneeIds)->pluck('name')->implode(', ');
            $changes[] = ['field_name' => 'assigned_to', 'label' => 'Assignee', 'old_value' => $oldNames ?: 'None', 'new_value' => $newNames ?: 'None'];
            $task->assignees()->sync($assigneeIds);
            $task->update(['assigned_to' => $assigneeIds[0]]);
        }

        $addedDeliverables = [];
        if (!empty($validated['deliverables'])) {
            foreach ($validated['deliverables'] as $del) {
                $task->deliverables()->create([
                    'title' => $del['title'], 'description' => $del['description'] ?? null,
                    'due_date' => $del['due_date'] ?? null, 'assigned_to' => $task->assigned_to,
                    'created_by' => $user->id,
                ]);
                $addedDeliverables[] = $del['title'];
            }
            $changes[] = ['field_name' => 'deliverables', 'label' => 'Deliverable Added', 'old_value' => '', 'new_value' => implode(', ', $addedDeliverables)];
        }

        // Bulk create changes and workflow events
        if (!empty($changes)) {
            $task->changes()->createMany(
                array_map(fn ($c) => [
                    'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
                    'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
                ], $changes)
            );
            TaskWorkflowEvent::insert(
                array_map(fn ($c) => [
                    'task_id' => $task->id, 'user_id' => $user->id, 'action' => 'field_changed',
                    'comment' => $c['label'] . ': ' . $c['old_value'] . ' → ' . $c['new_value'],
                ], $changes)
            );
        }

        $this->sendTaskUpdateNotification($task, $user, count($changes));

        return response()->json([
            'message' => count($changes) > 0 ? 'Task updated — ' . count($changes) . ' change(s) made' : 'Task updated successfully',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
            'changes_count' => count($changes),
        ]);
    }

    public function updateStatus(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['message' => 'Approved tasks cannot be modified.'], 403);

        $validated = $request->validate(['status' => 'required|string|max:64|in:pending,in_progress,review,completed,done,failed,abandoned']);
        $oldStatus = $task->status;
        $task->update(['status' => $validated['status']]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id,
            'action' => 'status_updated',
            'comment' => $oldStatus . ' → ' . $validated['status'],
        ]);

        return response()->json(['message' => 'Task status updated', 'task' => $task->fresh()->load('assignees:id,name,email,role')]);
    }

    public function completeTask(Request $request, Task $task)
    {
        try {
            $user = $request->user();
            $isCreator = intval($task->assigned_by) === intval($user->id);
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

            if (!$isCreator && !$isAssignee) return response()->json(['message' => 'Unauthorized'], 403);

            $task->update(['status' => 'completed']);

            TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'completed']);

            $deliverable = Deliverable::create([
                'project_id' => $task->project_id, 'task_id' => $task->id,
                'title' => $task->title, 'description' => $task->description,
                'status' => 'pending', 'priority' => $task->priority,
                'due_date' => $task->end_date, 'assigned_to' => $user->id,
                'created_by' => $task->assigned_by,
            ]);

            if ($task->assigned_by && $task->assigned_by !== $user->id) {
                $this->notificationService->notify(
                    $task->assigned_by,
                    $user->id,
                    'task_completed',
                    'task',
                    $task->id,
                    'Task Completed',
                    $user->name . ' has completed the task "' . $task->title . '" and submitted it for review.',
                    '/tasks/task-details/' . $task->id . '?from=taskby'
                );
            }

            // Log activity
            $this->activityService->log($user->id, 'task_completed', 'You completed task "' . $task->title . '"', 'task', $task->id);

            return response()->json([
                'message' => 'Task moved to deliverables',
                'task' => $task->fresh()->load('assignees:id,name,email,role'),
                'deliverable' => $deliverable,
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to complete task: ' . $e->getMessage()], 500);
        }
    }

    public function storeSubtask(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['message' => 'Approved tasks cannot be modified.'], 403);

        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'start_date' => 'nullable|date', 'end_date' => 'nullable|date',
            'assigned_to' => 'required|array|min:1', 'assigned_to.*' => 'exists:users,id',
            'priority' => 'required|string|max:32',
        ]);

        $subtasks = [];
        foreach ($validated['assigned_to'] as $userId) {
            $subtasks[] = Subtask::create([
                'task_id' => $task->id, 'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'start_date' => $validated['start_date'] ?? now()->toDateTimeString(),
                'end_date' => $validated['end_date'] ?? null,
                'assigned_to' => (int) $userId, 'assigned_by' => $user->id,
                'priority' => $validated['priority'], 'status' => 'pending',
            ]);
        }

        return response()->json(['message' => count($subtasks) . ' subtask(s) created successfully', 'subtasks' => $subtasks], 201);
    }

    public function submit(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isAssignee) return response()->json(['message' => 'Only the assignee can submit this task'], 403);
        if (!in_array($task->status, ['pending', 'reopened'])) return response()->json(['message' => 'This task cannot be submitted in its current status'], 422);

        $pendingDeliverables = $task->deliverables()->where('status', 'pending')->count();
        if ($pendingDeliverables > 0) return response()->json(['message' => 'All deliverables must be submitted before submitting this task'], 422);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,ppt,pptx,txt|max:51200',
            'files' => 'nullable|array', 'files.*' => 'file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,ppt,pptx,txt|max:51200',
            'links' => 'nullable|array', 'links.*' => 'string|max:2048',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('task-submissions/' . $task->id, 'public');
        }

        $submission = TaskSubmission::create([
            'task_id' => $task->id, 'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        if ($request->hasFile('files')) {
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(fn ($file) => [
                    'submission_type' => 'task',
                    'file_name' => basename($path = $file->store('task-submissions/' . $task->id, 'public')),
                    'original_name' => $file->getClientOriginalName(), 'file_path' => $path,
                    'file_type' => $file->getMimeType(), 'file_size' => $file->getSize(),
                    'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                    'url' => '/storage/' . $path,
                ])->toArray()
            );
        }

        if (!empty($validated['links'])) {
            $submission->attachments()->createMany(
                collect($validated['links'])->map(fn ($url) => [
                    'submission_type' => 'task', 'file_name' => $url, 'original_name' => $url,
                    'attachment_type' => 'link', 'url' => $url,
                ])->toArray()
            );
        }

        $isResubmit = $task->status === 'reopened';

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id,
            'action' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $updateData = ['status' => 'submitted', 'submitted_at' => now()];

        if ($task->status === 'reopened') {
            foreach (['rejected_at','rejected_by','rejection_comment','reopened_at','reopened_by','reopen_comment','reopen_instructions','reopen_new_deadline','reopen_file_path','reopen_file_name'] as $f) {
                $updateData[$f] = null;
            }
        }

        $task->update($updateData);

        if ($task->assigned_by && $task->assigned_by !== $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_submitted',
                'task',
                $task->id,
                'Task Submitted',
                $user->name . ' has completed the task "' . $task->title . '" and submitted it for review.',
                '/tasks/task-details/' . $task->id . '?from=taskby'
            );
        }

        // Log activity
        $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
        $this->activityService->log($user->id, 'task_' . $isResubmitLabel, 'You ' . $isResubmitLabel . ' task "' . $task->title . '" for review', 'task', $task->id);

        return response()->json([
            'message' => 'Task submitted successfully',
            'task' => $task->fresh()->load([
                'assignees:id,name,email,role', 'assigner:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
            ]),
        ]);
    }

    public function approve(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['message' => 'Can only approve submitted tasks'], 422);

        $task->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id]);

        TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'approved']);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn($id) => (int) $id !== (int) $user->id),
            $user->id,
            'task_approved',
            'task',
            $task->id,
            'Task Approved',
            'Your task "' . $task->title . '" has been approved.',
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );

        // Log activity
        $this->activityService->log($user->id, 'task_approved', 'You approved task "' . $task->title . '"', 'task', $task->id);

        return response()->json([
            'message' => 'Task approved successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    public function reject(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['message' => 'Can only reject submitted tasks'], 422);

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $task->update(['status' => 'rejected', 'rejected_at' => now(), 'rejected_by' => $user->id, 'rejection_comment' => $validated['comment'] ?? null]);

        TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'rejected', 'comment' => $validated['comment'] ?? null]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $rejectMsg = 'Your task "' . $task->title . '" has been rejected. Please make the required changes.';
        if (!empty($validated['comment'])) $rejectMsg .= ' Reason: ' . $validated['comment'];

        $this->notificationService->notifyMultiple(
            $assigneeIds,
            $user->id,
            'task_rejected',
            'task',
            $task->id,
            'Task Rejected',
            $rejectMsg,
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );

        // Log activity
        $this->activityService->log($user->id, 'task_rejected', 'You rejected task "' . $task->title . '"', 'task', $task->id);

        return response()->json([
            'message' => 'Task rejected',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    public function reopen(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['message' => 'Can only reopen submitted tasks'], 422);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000', 'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date', 'file' => 'nullable|file|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('task-reopen/' . $task->id, 'public');
        }

        $updateData = [
            'status' => 'reopened', 'reopened_at' => now(), 'reopened_by' => $user->id,
            'reopen_comment' => $validated['comment'] ?? null,
            'reopen_instructions' => $validated['instructions'] ?? null,
        ];
        if (!empty($validated['new_deadline'])) { $updateData['reopen_new_deadline'] = $validated['new_deadline']; $updateData['end_date'] = $validated['new_deadline']; }
        if (!empty($filePath)) { $updateData['reopen_file_path'] = $filePath; $updateData['reopen_file_name'] = $fileName; }

        $task->update($updateData);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id, 'action' => 'reopened',
            'comment' => $validated['comment'] ?? null, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $reopenMsg = 'Your task "' . $task->title . '" has been reopened for revision.';
        if (!empty($validated['comment'])) $reopenMsg .= ' Comment: ' . $validated['comment'];
        if (!empty($validated['instructions'])) $reopenMsg .= ' Instructions: ' . $validated['instructions'];

        $this->notificationService->notifyMultiple(
            $assigneeIds,
            $user->id,
            'task_reopened',
            'task',
            $task->id,
            'Task Reopened',
            $reopenMsg,
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );

        // Log activity
        $this->activityService->log($user->id, 'task_reopened', 'You reopened task "' . $task->title . '" for revision', 'task', $task->id);

        return response()->json([
            'message' => 'Task reopened successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    public function latestSubmission(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized'], 403);

        $submission = TaskSubmission::where('task_id', $task->id)->with('submittedBy:id,name,email')->latest()->first();
        return response()->json(['submission' => $submission]);
    }

    public function downloadSubmissionFile(TaskSubmission $submission)
    {
        $user = request()->user();
        $task = $submission->task;
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized'], 403);
        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) return response()->json(['message' => 'File not found'], 404);

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    public function markChangesRead(Task $task)
    {
        $task->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['message' => 'Changes marked as read']);
    }

    public function destroy(Task $task)
    {
        $user = request()->user();
        if ((int) $task->assigned_by !== (int) $user->id && !in_array($user->role, ['admin', 'manager'])) return response()->json(['message' => 'Unauthorized — only the task creator can delete'], 403);

        $task->assignees()->detach();
        $task->deliverables()->delete();
        $task->files()->delete();
        $task->delete();

        return response()->json(['message' => 'Task deleted successfully']);
    }

    public function uploadFile(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['message' => 'Approved tasks cannot be modified.'], 403);

        $request->validate(['file' => 'required|file|max:10240']);
        $file = $request->file('file');
        $path = $file->store('task-files/' . $task->id, 'public');

        return response()->json(['message' => 'File uploaded successfully', 'file' => $task->files()->create(['name' => $file->getClientOriginalName(), 'url' => '/storage/' . $path])], 201);
    }

    public function addLink(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['message' => 'Approved tasks cannot be modified.'], 403);

        $validated = $request->validate(['url' => 'required|url|max:2048', 'name' => 'nullable|string|max:255']);

        return response()->json(['message' => 'Link added successfully', 'file' => $task->files()->create(['name' => $validated['name'] ?? $validated['url'], 'url' => $validated['url']])], 201);
    }

    public function deleteFile(Task $task, TaskFile $file)
    {
        $user = request()->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['message' => 'Approved tasks cannot be modified.'], 403);

        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            $fullPath = storage_path('app/public/' . $relativePath);
            if (file_exists($fullPath)) unlink($fullPath);
        }
        $file->delete();

        return response()->json(['message' => 'File deleted successfully']);
    }

    public function reorderTasks(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:tasks,id', 'items.*.sort_order' => 'required|integer|min:0']);
        foreach ($request->items as $item) { Task::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]); }
        return response()->json(['message' => 'Tasks reordered successfully']);
    }

    public function reorderSubtasks(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:subtasks,id', 'items.*.sort_order' => 'required|integer|min:0']);
        foreach ($request->items as $item) { Subtask::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]); }
        return response()->json(['message' => 'Subtasks reordered successfully']);
    }

    private function sendTaskUpdateNotification(Task $task, User $updater, int $changeCount = 0): void
    {
        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();

        $msg = 'The task "' . $task->title . '" has been updated by ' . $updater->name . '.';
        if ($changeCount > 0) $msg .= ' ' . $changeCount . ' change(s) were made.';
        $msg .= ' Click to review changes.';

        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn($id) => (int) $id !== (int) $updater->id),
            $updater->id,
            'task_updated',
            'task',
            $task->id,
            'Task Updated',
            $msg,
            '/tasks/task-details/' . $task->id . '?from=tasks'
        );
    }

    private function pendingTaskStatuses(): array { return ['pending', 'in_progress', 'In Progress', 'Planned', 'submitted', 'reopened', 'rejected']; }
    private function incompleteDueTodayStatuses(): array { return ['approved', 'completed', 'done']; }
    private function applyDueTodayFilter($query) { return $query->whereDate('end_date', today())->whereNotIn('status', $this->incompleteDueTodayStatuses()); }
}
