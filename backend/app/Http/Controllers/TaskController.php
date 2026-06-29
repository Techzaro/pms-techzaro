<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\Notification;
use App\Models\Project;
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

/**
 * Controller for managing tasks within projects.
 * Handles CRUD operations, status workflows (submit, approve, reject, reopen),
 * file/link management, deliverable progress tracking, and task reordering.
 * Supports both project-scoped and standalone tasks.
 */
class TaskController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService
    ) {}

    /**
     * Get tasks assigned to the authenticated user (excluding self-assigned tasks).
     * Also includes projects where the user is assigned but not the creator.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: status (due_today, approved, pending, submitted, reopened, rejected, or custom), filter params.
     * @return \Illuminate\Http\JsonResponse  JSON response with merged task and project list.
     */
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
            ->orderBy('sort_order', 'asc')
            ->filter($filters);

        $tasks = $tasksQuery->get();

        // Bulk load deliverable counts for all tasks
        $taskIds = $tasks->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $tasks->transform(function ($task) use ($dlvStats) {
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
            $project->sort_order = null;
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
            $project->is_assigned = $isAssigned;
            $project->can_submit = in_array($project->status, $submittableStatuses) && $isAssigned;
            return $project;
        });

        $allItems = $tasks->merge($projects)->sortBy(function ($item) {
            return $item->sort_order ?? PHP_INT_MAX;
        })->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    /**
     * Get tasks that are both created by and assigned to the authenticated user (self-created tasks).
     * Also includes projects where the user is both creator and assignee.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: status filter, other filter params.
     * @return \Illuminate\Http\JsonResponse  JSON response with merged self-created task and project list.
     */
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
            ->orderBy('sort_order', 'asc')
            ->filter($filters)
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

        $tasks->transform(function ($task) use ($dlvStats) {
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
                $project->sort_order = null;
                $isAssigned = in_array($user->id, $project->assigned_users ?? []);
                $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];
                $project->is_assigned = $isAssigned;
                $project->can_submit = in_array($project->status, $submittableStatuses) && $isAssigned;
                return $project;
            });

        $allItems = $tasks->merge($projects)->sortBy(function ($item) {
            return $item->sort_order ?? PHP_INT_MAX;
        })->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    /**
     * Get tasks and projects for a specific user (for admin/manager/team_lead viewing member workloads).
     *
     * Team leads viewing other users only see tasks they assigned and projects they created.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: status, search, filter params.
     * @param  int  $userId  The ID of the target user.
     * @return \Illuminate\Http\JsonResponse  JSON response with merged task and project list.
     */
    public function userTasks(Request $request, $userId)
    {
        try {
            return $this->handleUserTasks($request, $userId);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('userTasks error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'userId' => $userId,
            ]);
            return response()->json(['success' => false, 'error' => $e->getMessage(), 'data' => [], 'total' => 0], 500);
        }
    }

    private function handleUserTasks(Request $request, $userId)
    {
        $targetUser = User::find($userId);
        if (!$targetUser) {
            return response()->json(['success' => true, 'data' => [], 'total' => 0]);
        }

        $requestingUser = $request->user();
        $isTeamLeadViewingMember = ($requestingUser->role === 'team_lead' || $requestingUser->role === 'teamlead') 
            && $requestingUser->id != $userId;

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
            // If team lead is viewing member, only show tasks assigned BY the team lead
            ->when($isTeamLeadViewingMember, fn ($q) => $q->where('tasks.assigned_by', $requestingUser->id))
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($search, fn ($q) => $q->where('title', 'like', '%' . $search . '%'))
            ->when($statusFilter && !$isDueTodayFilter && !$isPendingFilter, fn ($q) => $q->where('status', $statusFilter))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->orderBy('sort_order', 'asc');

        $tasks = $tasksQuery->limit(200)->get();

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
            // If team lead is viewing member, only show projects created BY the team lead
            ->when($isTeamLeadViewingMember, fn ($q) => $q->where('projects.created_by', $requestingUser->id))
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
            $clone->sort_order = null;
            $clone->assigned_user = $targetUser;
            $clone->is_assigned = true;
            $clone->can_submit = in_array($clone->status, $submittableStatuses);
            $expandedProjects->push($clone);
        }

        $allItems = $expandedTasks->merge($expandedProjects)->sortBy(function ($item) {
            return $item->sort_order ?? PHP_INT_MAX;
        })->values();

        return response()->json(['success' => true, 'data' => $allItems, 'total' => $allItems->count()]);
    }

    /**
     * Get tasks created by the authenticated user, expanded per assignee.
     * Admin/manager users see tasks created by any admin/manager.
     * Also includes projects created by the user with their assigned members expanded.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: status, search, filter params.
     * @return \Illuminate\Http\JsonResponse  JSON response with expanded task and project list.
     */
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

        $tasks = $tasksQuery->orderBy('sort_order', 'asc')
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%' . $request->input('search') . '%'))
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($request->filled('status') && !$isDueTodayFilter && !$isPendingFilter, fn ($q) => $q->where('status', $request->input('status')))
            ->limit(100)->get();

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
            ->limit(100)->get();

        $expandedProjects = collect();
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        // Bulk-load all assigned user IDs across projects
        $allUserIds = $projects->flatMap(fn ($p) => is_string($p->assigned_users) ? json_decode($p->assigned_users, true) ?? [] : ($p->assigned_users ?? []))
            ->unique()->values()->toArray();
        $allResolvedUsers = !empty($allUserIds)
            ? User::whereIn('id', $allUserIds)->select('id', 'name', 'role')->get()->keyBy('id')
            : collect();

        foreach ($projects as $project) {
            $project->item_type = 'project';
            $project->sort_order = null;
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
                foreach ($assignedUsers as $id) {
                    if ((int)$id === (int)$project->created_by) continue;
                    $clone = clone $project;
                    $clone->assigned_user = $allResolvedUsers->get($id);
                    $isAssignedToUser = (int)$id === (int)$user->id;
                    $clone->is_assigned = $isAssignedToUser;
                    $clone->can_submit = in_array($clone->status, $submittableStatuses) && $isAssignedToUser;
                    $expandedProjects->push($clone);
                }
            }
        }

        $allItems = $expandedTasks->merge($expandedProjects)->sortBy(function ($item) {
            return $item->sort_order ?? PHP_INT_MAX;
        })->values();

        return response()->json(['success' => true, 'data' => $allItems, 'total' => $allItems->count()]);
    }

    /**
     * Retrieve a single task with all related data (project, assignees, submissions, workflow events, deliverables).
     *
     * Enforces authorization based on creator, assignee, project creator, team leader, or admin/manager role.
     * Returns deliverable progress stats and unviewed changes.
     *
     * @param  \App\Models\Task  $task  The task to retrieve.
     * @return \Illuminate\Http\JsonResponse  JSON response with full task details or 403.
     */
    public function show(Task $task)
    {
        $user = request()->user();
        $task->load('project:id,created_by,team_id', 'project.team:id,leader_id', 'assignees:id');
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees->contains('id', $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isProjectCreator = $task->project && $task->project->created_by === $user->id;
        $isTeamLeader = $task->project && $task->project->team && $task->project->team->leader_id === $user->id;
        $isTeamMember = $task->project && $task->project->team && $task->project->team->members && $task->project->team->members->contains('id', $user->id);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager && !$isProjectCreator && !$isTeamLeader && !$isTeamMember) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
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

        // Single query for deliverables with stats
        $deliverables = $task->deliverables()->when(!$isCreator, function ($q) use ($user) {
            $q->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)->orWhere('created_by', $user->id);
            });
        })->with([
            'assignee:id,name,email,role', 'creator:id,name,role',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'reopenedBy:id,name',
        ])->orderBy('sort_order', 'asc')->get();

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

        return response()->json(['success' => true, 'task' => $payload]);
    }

    /**
     * Create tasks within a project, assigning one task per user in the assigned_to array.
     *
     * Creates workflow events for each task, handles deliverable creation and notifications,
     * and sends bulk assignment notifications.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input: title, description, requirements, start_date, end_date, assigned_to[], priority, deliverables[].
     * @param  \App\Models\Project  $project  The parent project.
     * @return \Illuminate\Http\JsonResponse  JSON response with created tasks.
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
        $deliverablesToCreate = [];
        $deliverableNotifications = [];
        $workflowRecords = [];
        $assignees = User::whereIn('id', $validated['assigned_to'])->get()->keyBy('id');

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

            $assignee = $assignees->get($userId);

            $workflowRecords[] = [
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to ' . $assignee->name : null,
                'created_at' => now(),
                'updated_at' => now(),
            ];

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

        if (!empty($workflowRecords)) {
            DB::table('task_workflow_events')->insert($workflowRecords);
        }

        if (!empty($deliverablesToCreate)) {
            Deliverable::insert($deliverablesToCreate);
            // Collect notification data using the inserted data (IDs not needed for link)
            foreach ($deliverablesToCreate as $d) {
                if ((int) $d['assigned_to'] !== (int) $user->id) {
                    $deliverableNotifications[] = [
                        'user_id' => $d['assigned_to'], 'sender_user_id' => $user->id,
                        'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                        'title' => 'Deliverable Assigned',
                        'message' => 'A new deliverable "' . $d['title'] . '" has been assigned to you by ' . $user->name . '.',
                        'link' => '/deliveries',
                    ];
                }
            }
        }
        if (!empty($deliverableNotifications)) {
            $now = now()->toDateTimeString();
            Notification::insert(array_map(fn ($n) => $n + ['created_at' => $now, 'updated_at' => $now], $deliverableNotifications));
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
            'success' => true,
            'message' => count($createdTasks) . ' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    /**
     * Create standalone tasks (not associated with any project).
     *
     * Creates one task per user in the assigned_to array, with optional deliverables.
     * Sends assignment notifications and logs activity.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input: title, description, requirements, start_date, end_date, assigned_to[], priority, deliverables[].
     * @return \Illuminate\Http\JsonResponse  JSON response with created tasks.
     */
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
        $deliverableNotifications = [];
        $workflowRecords = [];
        $assignees = User::whereIn('id', $validated['assigned_to'])->get()->keyBy('id');

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

            $assignee = $assignees->get($userId);

            $workflowRecords[] = [
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to ' . $assignee->name : null,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (!empty($validated['deliverables'])) {
                $deliverableData = collect($validated['deliverables'])->map(fn ($del) => [
                    'title' => $del['title'], 'description' => $del['description'] ?? null,
                    'status' => 'pending', 'priority' => $validated['priority'],
                    'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                    'assigned_to' => $userId, 'created_by' => $user->id,
                    'created_at' => now(), 'updated_at' => now(),
                ])->toArray();
                $task->deliverables()->createMany($deliverableData);
                foreach ($deliverableData as $d) {
                    if ((int) $d['assigned_to'] !== (int) $user->id) {
                        $deliverableNotifications[] = [
                            'user_id' => $d['assigned_to'], 'sender_user_id' => $user->id,
                            'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                            'title' => 'Deliverable Assigned',
                            'message' => 'A new deliverable "' . $d['title'] . '" has been assigned to you by ' . $user->name . '.',
                            'link' => '/deliveries',
                        ];
                    }
                }
            }

            $createdTasks[] = $task;
        }

        if (!empty($workflowRecords)) {
            DB::table('task_workflow_events')->insert($workflowRecords);
        }
        if (!empty($deliverableNotifications)) {
            $now = now()->toDateTimeString();
            Notification::insert(array_map(fn ($n) => $n + ['created_at' => $now, 'updated_at' => $now], $deliverableNotifications));
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
            'success' => true,
            'message' => count($createdTasks) . ' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    /**
     * Update a task's properties and track field changes.
     *
     * Only the task creator or admin/manager can edit. Approved tasks cannot be edited.
     * Handles assignee changes with notifications, deliverable creation, and change tracking.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input for updatable fields.
     * @param  \App\Models\Task  $task  The task to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated task and change count.
     */
    public function update(Request $request, Task $task)
    {
        $user = $request->user();
        if ((int) $task->assigned_by !== (int) $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the task creator can edit'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be edited.'], 403);
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

            $newlyAssignedIds = array_values(array_diff($assigneeIds, $oldAssigneeIds));
            if (!empty($newlyAssignedIds)) {
                $newAssignNotifications = [];
                foreach ($newlyAssignedIds as $newId) {
                    if ((int) $newId === (int) $user->id) continue;
                    $newAssignNotifications[] = [
                        'user_id' => $newId, 'sender_user_id' => $user->id,
                        'type' => 'task_assigned', 'related_module' => 'task',
                        'related_id' => $task->id, 'title' => 'Task Assigned',
                        'message' => 'A new task "' . $task->title . '" has been assigned to you by ' . $user->name . '.',
                        'link' => '/tasks/task-details/' . $task->id . '?from=tasks',
                    ];
                }
                if (!empty($newAssignNotifications)) {
                    $this->notificationService->createBulk($newAssignNotifications);
                }
            }
        }

        $addedDeliverables = [];
        if (!empty($validated['deliverables'])) {
            $delData = collect($validated['deliverables'])->map(fn ($del) => [
                'title' => $del['title'], 'description' => $del['description'] ?? null,
                'due_date' => $del['due_date'] ?? null, 'assigned_to' => $task->assigned_to,
                'created_by' => $user->id,
            ])->toArray();
            $task->deliverables()->createMany($delData);
            $addedDeliverables = array_column($delData, 'title');
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
            'success' => true,
            'message' => count($changes) > 0 ? 'Task updated — ' . count($changes) . ' change(s) made' : 'Task updated successfully',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
            'changes_count' => count($changes),
        ]);
    }

    /**
     * Update only the status of a task.
     *
     * @param  \Illuminate\Http\Request  $request  Input: status (required).
     * @param  \App\Models\Task  $task  The task to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated task.
     */
    public function updateStatus(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);

        $validated = $request->validate(['status' => 'required|string|max:64|in:pending,in_progress,review,completed,done,failed,abandoned']);
        $oldStatus = $task->status;
        $task->update(['status' => $validated['status']]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id,
            'action' => 'status_updated',
            'comment' => $oldStatus . ' → ' . $validated['status'],
        ]);

        return response()->json(['success' => true, 'message' => 'Task status updated', 'task' => $task->fresh()->load('assignees:id,name,email,role')]);
    }

    /**
     * Mark a task as completed and create a deliverable from it.
     *
     * Notifies the task creator that the task is ready for review.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Task  $task  The task to complete.
     * @return \Illuminate\Http\JsonResponse  JSON response with the completed task and created deliverable.
     */
    public function completeTask(Request $request, Task $task)
    {
        try {
            $user = $request->user();
            $isCreator = intval($task->assigned_by) === intval($user->id);
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

            if (!$isCreator && !$isAssignee) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);

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
                'success' => true,
                'message' => 'Task moved to deliverables',
                'task' => $task->fresh()->load('assignees:id,name,email,role'),
                'deliverable' => $deliverable,
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to complete task: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Submit a task for review by its creator.
     *
     * Only the assignee can submit. All deliverables must be submitted first.
     * Handles file uploads, link attachments, and determines first submission vs resubmission.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, file, files[], links[].
     * @param  \App\Models\Task  $task  The task to submit.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated task.
     */
    public function submit(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isAssignee) return response()->json(['success' => false, 'message' => 'Only the assignee can submit this task'], 403);
        if (!in_array($task->status, ['pending', 'reopened'])) return response()->json(['success' => false, 'message' => 'This task cannot be submitted in its current status'], 422);

        $pendingDeliverables = $task->deliverables()->where('status', 'pending')->count();
        if ($pendingDeliverables > 0) return response()->json(['success' => false, 'message' => 'All deliverables must be submitted before submitting this task'], 422);

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
            'success' => true,
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

    /**
     * Approve a submitted task. Only the task creator or admin/manager can approve.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Task  $task  The task to approve (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the approved task.
     */
    public function approve(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only approve submitted tasks'], 422);

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
            'success' => true,
            'message' => 'Task approved successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Reject a submitted task with an optional comment.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment (optional).
     * @param  \App\Models\Task  $task  The task to reject (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the rejected task.
     */
    public function reject(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only reject submitted tasks'], 422);

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
            'success' => true,
            'message' => 'Task rejected',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Reopen a submitted task for revision with instructions and optional new deadline.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  \App\Models\Task  $task  The task to reopen.
     * @return \Illuminate\Http\JsonResponse  JSON response with the reopened task.
     */
    public function reopen(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($task->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only reopen submitted tasks'], 422);

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
            'success' => true,
            'message' => 'Task reopened successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ]),
        ]);
    }

    /**
     * Get the most recent submission for a task.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Task  $task  The task to get the latest submission for.
     * @return \Illuminate\Http\JsonResponse  JSON response with the latest submission.
     */
    public function latestSubmission(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);

        $submission = TaskSubmission::where('task_id', $task->id)->with('submittedBy:id,name,email')->latest()->first();
        return response()->json(['success' => true, 'submission' => $submission]);
    }

    /**
     * Download the file attached to a task submission.
     *
     * @param  \App\Models\TaskSubmission  $submission  The submission containing the file.
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\JsonResponse  File download or error.
     */
    public function downloadSubmissionFile(TaskSubmission $submission)
    {
        $user = request()->user();
        $task = $submission->task;
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) return response()->json(['success' => false, 'message' => 'File not found'], 404);

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    /**
     * Mark all unviewed changes on a task as read.
     *
     * @param  \App\Models\Task  $task  The task whose changes to mark.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming changes marked.
     */
    public function markChangesRead(Task $task)
    {
        $task->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    /**
     * Delete a task and all its associated data (assignees, deliverables, files).
     * Only the task creator or admin/manager can delete.
     *
     * @param  \App\Models\Task  $task  The task to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function destroy(Task $task)
    {
        $user = request()->user();
        if ((int) $task->assigned_by !== (int) $user->id && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized — only the task creator can delete'], 403);

        $task->assignees()->detach();
        $task->deliverables()->delete();
        $task->files()->delete();
        $task->delete();

        return response()->json(['success' => true, 'message' => 'Task deleted successfully']);
    }

    /**
     * Upload a file to a task. Only the creator, assignee, or admin/manager can upload.
     *
     * @param  \Illuminate\Http\Request  $request  Input: file (required, max 10MB).
     * @param  \App\Models\Task  $task  The task to upload the file to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created file record.
     */
    public function uploadFile(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);

        $request->validate(['file' => 'required|file|max:10240']);
        $file = $request->file('file');
        $path = $file->store('task-files/' . $task->id, 'public');

        return response()->json(['success' => true, 'message' => 'File uploaded successfully', 'file' => $task->files()->create(['name' => $file->getClientOriginalName(), 'url' => '/storage/' . $path])], 201);
    }

    /**
     * Add a URL link to a task. Only the creator, assignee, or admin/manager can add links.
     *
     * @param  \Illuminate\Http\Request  $request  Input: url (required), name (optional).
     * @param  \App\Models\Task  $task  The task to add the link to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created file record.
     */
    public function addLink(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);

        $validated = $request->validate(['url' => 'required|url|max:2048', 'name' => 'nullable|string|max:255']);

        return response()->json(['success' => true, 'message' => 'Link added successfully', 'file' => $task->files()->create(['name' => $validated['name'] ?? $validated['url'], 'url' => $validated['url']])], 201);
    }

    /**
     * Delete a file or link from a task. Also removes the physical file if it exists on disk.
     *
     * @param  \App\Models\Task  $task  The task the file belongs to.
     * @param  \App\Models\TaskFile  $file  The file to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function deleteFile(Task $task, TaskFile $file)
    {
        $user = request()->user();
        $isCreator = $task->assigned_by === $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (!$isCreator && !$isAssignee && !$isAdminOrManager) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (strtolower((string) $task->status) === 'approved') return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);

        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            $fullPath = storage_path('app/public/' . $relativePath);
            if (file_exists($fullPath)) unlink($fullPath);
        }
        $file->delete();

        return response()->json(['success' => true, 'message' => 'File deleted successfully']);
    }

    /**
     * Reorder tasks by updating their sort_order values in bulk.
     *
     * @param  \Illuminate\Http\Request  $request  Input: items[] with id and sort_order.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming reorder.
     */
    public function reorderTasks(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:tasks,id', 'items.*.sort_order' => 'required|integer|min:0']);
        $ids = []; $bindings = [];
        foreach ($request->items as $item) { $ids[] = (int) $item['id']; $bindings[] = (int) $item['id']; $bindings[] = (int) $item['sort_order']; }
        if (!empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            DB::statement("UPDATE tasks SET sort_order = CASE id " . implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?')) . " END WHERE id IN ($ph)", [...$bindings, ...$ids]);
        }
        return response()->json(['success' => true, 'message' => 'Tasks reordered successfully']);
    }

    /**
     * Send update notifications to all task assignees (excluding the updater).
     *
     * @param  \App\Models\Task  $task  The updated task.
     * @param  \App\Models\User  $updater  The user who made the update.
     * @param  int  $changeCount  Number of changes made.
     * @return void
     */
    private function sendTaskUpdateNotification(Task $task, User $updater, int $changeCount = 0): void
    {
        if (!$task->relationLoaded('assignees')) $task->load('assignees:id');
        $assigneeIds = $task->assignees->pluck('id')->toArray();

        $msg = 'The task "' . $task->title . '" has been updated by ' . $updater->name . '.';
        if ($changeCount > 0) $msg .= ' ' . $changeCount . ' change(s) were made.';
        $msg .= ' Click to review changes.';

        foreach (array_filter($assigneeIds, fn($id) => (int) $id !== (int) $updater->id) as $assigneeId) {
            $this->notificationService->notify(
                $assigneeId,
                $updater->id,
                'task_updated',
                'task',
                $task->id,
                'Task Updated',
                $msg,
                '/tasks/task-details/' . $task->id . '?from=tasks'
            );
        }
    }

    /**
     * Get the list of statuses considered as pending/in-progress for filtering.
     *
     * @return array  Array of status strings.
     */
    private function pendingTaskStatuses(): array { return ['pending', 'in_progress', 'In Progress', 'Planned', 'submitted', 'reopened', 'rejected']; }

    /**
     * Get the list of statuses that indicate a task is completed (for due-today exclusion).
     *
     * @return array  Array of completed status strings.
     */
    private function incompleteDueTodayStatuses(): array { return ['approved', 'completed', 'done']; }

    /**
     * Apply a due-today filter to a query (tasks due today that are not yet completed).
     *
     * @param  \Illuminate\Database\Eloquent\Builder  $query  The query to filter.
     * @return \Illuminate\Database\Eloquent\Builder  The filtered query.
     */
    private function applyDueTodayFilter($query) { return $query->whereDate('end_date', today())->whereNotIn('status', $this->incompleteDueTodayStatuses()); }
}
