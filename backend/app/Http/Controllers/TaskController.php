<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\DeliverableTemplate;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskChange;
use App\Models\TaskFile;
use App\Models\TaskSubmission;
use App\Models\TaskWorkflowEvent;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\RecurringService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /**
     * Get tasks assigned to the authenticated user (excluding self-assigned tasks).
     * Also includes projects where the user is assigned but not the creator.
     *
     * @param  Request  $request  Query parameters: status (due_today, approved, pending, submitted, reopened, rejected, or custom), filter params.
     * @return JsonResponse JSON response with merged task and project list.
     */
    public function myTasks(Request $request)
    {
        $user = $request->user();

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $statusFilter = $request->input('status');
        $filters = $request->query();
        if ($isDueTodayFilter || $isPendingFilter) {
            unset($filters['status']);
        }

        $tasksQuery = Task::where(function ($q) use ($user) {
            $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                ->orWhere('assigned_to', $user->id);
        })
            ->where('assigned_by', '!=', $user->id)
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $user->id))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role'])
            ->orderBy('sort_order')->latest('updated_at')
            ->filter($filters);

        $tasks = $tasksQuery->limit(200)->get();

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

        $allItems = $tasks->sortBy('sort_order')->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    /**
     * Get tasks that are both created by and assigned to the authenticated user (self-created tasks).
     * Also includes projects where the user is both creator and assignee.
     *
     * @param  Request  $request  Query parameters: status filter, other filter params.
     * @return JsonResponse JSON response with merged self-created task and project list.
     */
    public function mySelfTasks(Request $request)
    {
        $user = $request->user();

        // Guests only see tasks inside project details
        if ($user->role === 'guest') {
            return response()->json(['data' => collect(), 'total' => 0]);
        }

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $filters = $request->query();
        if ($isPendingFilter || $isDueTodayFilter) {
            unset($filters['status']);
        }

        $tasks = Task::where('assigned_by', $user->id)
            ->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                    ->orWhere('assigned_to', $user->id);
            })
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $user->id))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role'])
            ->orderBy('sort_order')->latest('updated_at')
            ->filter($filters)
            ->limit(200)
            ->get();

        if ($user->role === 'guest') {
            $tasks = Task::whereHas('project', fn ($q) => $q->where('client_name', $user->name))
                ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $user->id))
                ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
                ->with(['project:id,title,team_id', 'assigners:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role'])
                ->orderBy('sort_order')->latest('updated_at')
                ->filter($filters)
                ->limit(200)
                ->get();
        }

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

        $allItems = $tasks->sortBy('sort_order')->values();

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
     * @param  Request  $request  Query parameters: status, search, filter params.
     * @param  int  $userId  The ID of the target user.
     * @return JsonResponse JSON response with merged task and project list.
     */
    public function userTasks(Request $request, $userId)
    {
        try {
            return $this->handleUserTasks($request, $userId);
        } catch (\Throwable $e) {
            Log::error('userTasks error: '.$e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'userId' => $userId,
            ]);

            return response()->json(['success' => false, 'error' => $e->getMessage(), 'data' => [], 'total' => 0], 500);
        }
    }

    private function handleUserTasks(Request $request, $userId)
    {
        $targetUser = User::find($userId);
        if (! $targetUser) {
            return response()->json(['success' => true, 'data' => [], 'total' => 0]);
        }

        $requestingUser = $request->user();
        $isTeamLeadViewingMember = ($requestingUser->role === 'team_lead' || $requestingUser->role === 'teamlead')
            && $requestingUser->id != $userId;

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $statusFilter = $request->input('status');
        $search = $request->input('search');

        $tasksQuery = Task::where(function ($q) use ($userId) {
            $q->whereHas('assignees', fn ($q) => $q->where('users.id', $userId))
                ->orWhere('assigned_to', $userId);
        })
            // If team lead is viewing member, only show tasks assigned BY the team lead
            ->when($isTeamLeadViewingMember, fn ($q) => $q->where('tasks.assigned_by', $requestingUser->id))
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $userId))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($search, fn ($q) => $q->where('title', 'like', '%'.$search.'%'))
            ->when($statusFilter && ! $isDueTodayFilter && ! $isPendingFilter, fn ($q) => $q->where('status', $statusFilter))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role'])
            ->orderBy('sort_order')->latest('updated_at');

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

        $allItems = $expandedTasks->sortBy('sort_order')->values();

        return response()->json(['success' => true, 'data' => $allItems, 'total' => $allItems->count()]);
    }

    /**
     * Get tasks created by the authenticated user, expanded per assignee.
     * Admin/manager users see tasks created by any admin/manager.
     * Also includes projects created by the user with their assigned members expanded.
     *
     * @param  Request  $request  Query parameters: status, search, filter params.
     * @return JsonResponse JSON response with expanded task and project list.
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();

        // Guests only see tasks inside project details
        if ($user->role === 'guest') {
            return response()->json(['data' => collect(), 'total' => 0]);
        }

        $userId = $user->id;
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if ($isAdminOrManager) {
            $adminManagerIds = Cache::remember('admin_manager_ids', 300, fn () => User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray()
            );
        }

        $tasksQuery = Task::with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role']);

        if ($user->role === 'guest') {
            $tasksQuery->whereHas('project', fn ($q) => $q->where('client_name', $user->name));
        } elseif ($isAdminOrManager) {
            $tasksQuery->whereIn('assigned_by', $adminManagerIds)
                ->where(function ($q) {
                    $q->whereColumn('assigned_by', '!=', 'assigned_to')->orWhereNull('assigned_to');
                });
        } else {
            $tasksQuery->where('assigned_by', $userId);
        }

        $tasks = $tasksQuery->orderBy('sort_order')->latest('updated_at')
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%'.$request->input('search').'%'))
            ->when($isDueTodayFilter, fn ($q) => $q->where(function ($sub) {
                $sub->whereDate('tasks.end_date', today())
                    ->orWhereHas('assignees', fn ($aq) => $aq->whereDate('task_user.due_date', today()));
            })->whereNotIn('tasks.status', $this->incompleteDueTodayStatuses()))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($request->filled('status') && ! $isDueTodayFilter && ! $isPendingFilter, fn ($q) => $q->where('status', $request->input('status')))
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
                if ($assignee && (int) $assignee->id === (int) $task->assigned_by) {
                    continue;
                }
                if (! $assignee && (int) $task->assigned_to === (int) $task->assigned_by) {
                    continue;
                }
                if ($isDueTodayFilter && $assignee) {
                    $effectiveDueDate = ($assignee->pivot->due_date ?? null) ?: $task->end_date;
                    if (! $effectiveDueDate || \Carbon\Carbon::parse($effectiveDueDate)->toDateString() !== today()->toDateString()) {
                        continue;
                    }
                }

                $clone = clone $task;
                $clone->setRelation('assignees', $assignee ? collect([$assignee]) : collect());
                $clone->item_type = 'task';
                $clone->total_deliverables = $progress['total'];
                $clone->completed_deliverables = $progress['completed'];
                $clone->pending_deliverables_count = $progress['pending'];
                $clone->deliverables_progress = $progress['progress'];
                $expandedTasks->push($clone);
            }
        }

        $allItems = $expandedTasks->sortBy('sort_order')->values();

        return response()->json(['success' => true, 'data' => $allItems, 'total' => $allItems->count()]);
    }

    /**
     * Retrieve a single task with all related data (project, assignees, submissions, workflow events, deliverables).
     *
     * Enforces authorization based on creator, assignee, project creator, team leader, or admin/manager role.
     * Returns deliverable progress stats and unviewed changes.
     *
     * @param  Task  $task  The task to retrieve.
     * @return JsonResponse JSON response with full task details or 403.
     */
    public function show(Task $task)
    {
        $user = request()->user();
        $task->load([
            'project:id,title,team_id,created_by,client_name,category,budget,priority,sidebar_notes,sheets_documents,website_link,website_name,status,start_date,end_date',
            'project.creator:id,name,email,role',
            'project.team:id,name,leader_id',
            'project.team.leader:id,name',
            'project.team.members:id,name,email,role',
            'project.milestones:id,project_id,title,due_date,status,sort_order',
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
            'acknowledgedBy:id,name',
            'pausedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'changes' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'deliverableTemplates',
        ]);

        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees->contains('id', $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isProjectCreator = $task->project && (int) $task->project->created_by === (int) $user->id;
        $isTeamLeader = $task->project && $task->project->team && (int) $task->project->team->leader_id === (int) $user->id;
        $isTeamMember = $task->project && $task->project->team && $task->project->team->members && $task->project->team->members->contains('id', $user->id);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager && ! $isProjectCreator && ! $isTeamLeader && ! $isTeamMember) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Single query for deliverables with stats
        $deliverables = $task->deliverables()->when(! $isCreator, function ($q) use ($user) {
            $q->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)->orWhere('created_by', $user->id);
            });
        })->with([
            'assignee:id,name,email,role', 'creator:id,name,role',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'reopenedBy:id,name',
        ])->orderBy('sort_order')->latest('updated_at')->get();

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
            : (object) ['total' => 0, 'completed' => 0, 'pending' => 0];

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
        $payload['can_edit'] = $isCreator && ! $isApproved;
        $userPivot = $isAssignee ? $task->assignees()->where('users.id', $user->id)->first()?->pivot : null;
        $payload['my_status'] = $userPivot?->status ?? 'pending';
        $payload['my_submitted_at'] = $userPivot?->submitted_at;
        $payload['can_submit'] = $isAssignee && in_array($task->status, $pendingStatuses) && $allDeliverablesSubmitted
            && ($userPivot?->status !== 'submitted');

        $taskChangeMax = (int) TaskChange::where('task_id', $task->id)->max('id');
        $taskEventMax = (int) TaskWorkflowEvent::where('task_id', $task->id)->max('id');
        $payload['activity_max_id'] = max($taskChangeMax, $taskEventMax);

        return response()->json(['success' => true, 'task' => $payload]);
    }

    /**
     * Create tasks within a project, assigning one task per user in the assigned_to array.
     *
     * Creates workflow events for each task, handles deliverable creation and notifications,
     * and sends bulk assignment notifications.
     *
     * @param  Request  $request  Validated input: title, description, requirements, start_date, end_date, assigned_to[], priority, deliverables[].
     * @param  Project  $project  The parent project.
     * @return JsonResponse JSON response with created tasks.
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
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
            'task_type' => 'nullable|in:standard,recurring',
            'recurrence_settings' => 'nullable|array|required_if:task_type,recurring',
            'recurrence_settings.repeat' => 'required_with:recurrence_settings|in:daily,weekly,monthly,custom',
            'recurrence_settings.skip_weekends' => 'nullable|boolean',
            'deliverable_templates' => 'nullable|array|required_if:task_type,recurring|min:1',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
        ]);

        // Validate task end_date does not exceed project end_date
        if (! empty($validated['end_date']) && $project->end_date) {
            $taskEnd = \Carbon\Carbon::parse($validated['end_date']);
            $projectEnd = \Carbon\Carbon::parse($project->end_date);
            if ($taskEnd->gt($projectEnd)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'end_date' => 'Task deadline cannot exceed the project deadline ('.$projectEnd->format('d M Y h:i A').').',
                ]);
            }
        }

        // Validate deliverable due_date does not exceed task end_date
        if (! empty($validated['end_date']) && ! empty($validated['deliverables'])) {
            $endDateTime = \Carbon\Carbon::parse($validated['end_date']);
            foreach ($validated['deliverables'] as $index => $del) {
                if (! empty($del['due_date'])) {
                    $deliverableDateTime = \Carbon\Carbon::parse($del['due_date']);
                    if ($deliverableDateTime->gt($endDateTime)) {
                        throw \Illuminate\Validation\ValidationException::withMessages([
                            "deliverables.{$index}.due_date" => 'Deliverable due date cannot exceed the task end date.',
                        ]);
                    }
                }
            }
        }

        $createdTasks = [];
        $deliverablesToCreate = [];
        $deliverableNotifications = [];
        $workflowRecords = [];
        $dueDates = $validated['due_dates'] ?? [];
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
                'updated_by' => $user->id,
                'priority' => $validated['priority'],
                'status' => 'pending',
                'task_type' => $validated['task_type'] ?? 'standard',
                'recurrence_settings' => $validated['recurrence_settings'] ?? null,
            ]);
            $task->assignees()->sync([$userId => ['due_date' => $dueDates[$userId] ?? null]]);

            $assignee = $assignees->get($userId);

            $workflowRecords[] = [
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to '.$assignee->name : null,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (! empty($validated['deliverables'])) {
                foreach ($validated['deliverables'] as $del) {
                    // Skip if deliverable is assigned to a different user
                    if (! empty($del['assigned_to']) && (int) $del['assigned_to'] !== (int) $userId) {
                        continue;
                    }
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

            // Save deliverable templates for recurring tasks
            if (! empty($validated['deliverable_templates'])) {
                $templateData = [];
                foreach ($validated['deliverable_templates'] as $order => $tmpl) {
                    $templateData[] = [
                        'task_id' => $task->id,
                        'title' => $tmpl['title'],
                        'description' => $tmpl['description'] ?? null,
                        'quantity' => $tmpl['quantity'] ?? 1,
                        'combined' => $tmpl['combined'] ?? false,
                        'sort_order' => $order,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
                DB::table('deliverable_templates')->insert($templateData);

                // Generate ALL deliverables immediately for recurring tasks
                if (($validated['task_type'] ?? 'standard') === 'recurring') {
                    $recurringSvc = app(RecurringService::class);
                    $settings = $validated['recurrence_settings'];
                    $taskStartDate = $validated['start_date'] ?? now()->toDateTimeString();
                    $taskEndDate = $validated['end_date'] ?? now()->addDays(30)->toDateTimeString();
                    $totalPeriods = $recurringSvc->calculateTotalPeriods($settings, $taskStartDate, $taskEndDate);
                    $allDlvs = collect();
                    for ($p = 1; $p <= $totalPeriods; $p++) {
                        $date = $recurringSvc->getPeriodDate(
                            $taskStartDate,
                            $settings['repeat'] ?? 'daily',
                            $p,
                            (bool) ($settings['skip_weekends'] ?? false)
                        );
                        $created = $recurringSvc->generateOccurrenceDeliverables($task, $p, $date->format('Y-m-d'));
                        $allDlvs = $allDlvs->concat($created);
                    }
                    $task->update([
                        'deliverables_generated' => $totalPeriods,
                        'recurrence_status' => 'completed',
                    ]);
                    foreach ($allDlvs as $dlv) {
                        if ((int) $dlv->assigned_to !== (int) $user->id) {
                            $deliverableNotifications[] = [
                                'user_id' => $dlv->assigned_to, 'sender_user_id' => $user->id,
                                'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                                'related_id' => $dlv->id,
                                'title' => 'Deliverable Assigned',
                                'message' => 'A new recurring deliverable "'.$dlv->title.'" has been created.',
                                'link' => '/deliveries?selectedDeliverable='.$dlv->id,
                            ];
                        }
                    }
                }
            }

            $createdTasks[] = $task;
        }

        if (! empty($workflowRecords)) {
            DB::table('task_workflow_events')->insert($workflowRecords);
        }

        if (! empty($deliverablesToCreate)) {
            Deliverable::insert($deliverablesToCreate);
            $insertedDeliverables = Deliverable::where('created_by', $user->id)
                ->where('created_at', '>=', now()->subSeconds(5))
                ->get(['id', 'title', 'assigned_to', 'task_id']);
            foreach ($insertedDeliverables as $dlv) {
                if ((int) $dlv->assigned_to !== (int) $user->id) {
                    $deliverableNotifications[] = [
                        'user_id' => $dlv->assigned_to, 'sender_user_id' => $user->id,
                        'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                        'related_id' => $dlv->id,
                        'title' => 'Deliverable Assigned',
                        'message' => 'A new deliverable "'.$dlv->title.'" has been assigned to you by '.$user->name.'.',
                        'link' => '/deliveries?selectedDeliverable='.$dlv->id,
                    ];
                }
            }
        }
        if (! empty($deliverableNotifications)) {
            $this->notificationService->createBulk($deliverableNotifications);
        }

        // Notify project assignees about new deliverables added under tasks
        if (! empty($insertedDeliverables)) {
            $projectAssignees = $project->assigned_users ?? [];
            if (! empty($projectAssignees)) {
                foreach ($insertedDeliverables as $dlv) {
                    $this->notificationService->notifyDeliverableAdded($dlv, $user, $projectAssignees, 'project');
                }
            }
        }

        // Bulk notifications
        $sent = [];
        $notifications = [];
        foreach ($createdTasks as $task) {
            foreach ($validated['assigned_to'] as $assigneeId) {
                if ((int) $assigneeId === (int) $user->id || in_array($assigneeId, $sent)) {
                    continue;
                }
                $sent[] = $assigneeId;
                $notifications[] = [
                    'user_id' => $assigneeId, 'sender_user_id' => $user->id,
                    'type' => 'task_assigned', 'related_module' => 'task',
                    'related_id' => $task->id, 'title' => 'Task Assigned',
                    'message' => 'A new task "'.$task->title.'" has been assigned to you by '.$user->name.'.',
                    'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                ];
            }
        }
        $this->notificationService->createBulk($notifications);

        // Send confirmation email to performer
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->notificationService->confirmAction($user, 'Assigned', 'task', $createdTasks[0]->title, [
            'Project' => $project->title,
            'Assigned To' => $assigneeNames,
            'Tasks Created' => (string) $taskCount,
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_created', 'You created '.$taskCount.' task(s) and assigned them to '.$assigneeNames, 'task', $createdTasks[0]->id);
        $this->clearDashboardCache($user->id);

        // Clear cache for all assignees
        foreach ($validated['assigned_to'] as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'create',
                description: "Created {$taskCount} task(s) in project {$project->title}",
                user: $user,
                entityType: 'Task',
                entityId: $createdTasks[0]->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');

        return response()->json([
            'success' => true,
            'message' => count($createdTasks).' task(s) created successfully',
            'task' => $firstTask,
            'tasks' => array_map(fn ($t) => ['id' => $t->id, 'assigned_to' => $t->assigned_to], $createdTasks),
        ], 201);
    }

    /**
     * Preview recurring deliverable generation without saving.
     * Used by the frontend to show a live preview before task creation.
     *
     * @param  Request  $request  Templates and recurrence settings.
     * @return JsonResponse Preview data.
     */
    public function recurringPreview(Request $request, RecurringService $recurringService): JsonResponse
    {
        $validated = $request->validate([
            'templates' => 'required|array|min:1',
            'templates.*.title' => 'required|string|max:255',
            'templates.*.description' => 'nullable|string|max:2000',
            'templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'settings' => 'required|array',
            'settings.repeat' => 'required|in:daily,weekly,monthly,custom',
            'settings.skip_weekends' => 'nullable|boolean',
            'task_start_date' => 'required|date',
            'task_end_date' => 'required|date',
        ]);

        $preview = $recurringService->generatePreview(
            $validated['templates'],
            $validated['settings'],
            $validated['task_start_date'],
            $validated['task_end_date']
        );

        return response()->json([
            'success' => true,
            'preview' => $preview,
        ]);
    }

    /**
     * Store a standalone task (not assigned to any project).
     *
     * Creates one task per user in the assigned_to array, with optional deliverables.
     * Sends assignment notifications and logs activity.
     *
     * @param  Request  $request  Validated input: title, description, requirements, start_date, end_date, assigned_to[], priority, deliverables[].
     * @return JsonResponse JSON response with created tasks.
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
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
            'task_type' => 'nullable|in:standard,recurring',
            'recurrence_settings' => 'nullable|array|required_if:task_type,recurring',
            'recurrence_settings.repeat' => 'required_with:recurrence_settings|in:daily,weekly,monthly,custom',
            'recurrence_settings.skip_weekends' => 'nullable|boolean',
            'deliverable_templates' => 'nullable|array|required_if:task_type,recurring|min:1',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
        ]);

        // Validate deliverable due_date does not exceed task end_date
        if (! empty($validated['end_date']) && ! empty($validated['deliverables'])) {
            $endDateTime = \Carbon\Carbon::parse($validated['end_date']);
            foreach ($validated['deliverables'] as $index => $del) {
                if (! empty($del['due_date'])) {
                    $deliverableDateTime = \Carbon\Carbon::parse($del['due_date']);
                    if ($deliverableDateTime->gt($endDateTime)) {
                        throw \Illuminate\Validation\ValidationException::withMessages([
                            "deliverables.{$index}.due_date" => 'Deliverable due date cannot exceed the task end date.',
                        ]);
                    }
                }
            }
        }

        $createdTasks = [];
        $deliverableNotifications = [];
        $workflowRecords = [];
        $dueDates = $validated['due_dates'] ?? [];
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
                'task_type' => $validated['task_type'] ?? 'standard',
                'recurrence_settings' => $validated['recurrence_settings'] ?? null,
            ]);
            $task->assignees()->sync([$userId => ['due_date' => $dueDates[$userId] ?? null]]);

            $assignee = $assignees->get($userId);

            $workflowRecords[] = [
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'created',
                'comment' => $assignee ? 'Assigned to '.$assignee->name : null,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (! empty($validated['deliverables'])) {
                $deliverableData = collect($validated['deliverables'])
                    ->filter(fn ($del) => empty($del['assigned_to']) || (int) $del['assigned_to'] === (int) $userId)
                    ->map(fn ($del) => [
                    'title' => $del['title'], 'description' => $del['description'] ?? null,
                    'status' => 'pending', 'priority' => $validated['priority'],
                    'due_date' => $del['due_date'] ?? $validated['end_date'] ?? null,
                    'assigned_to' => $userId, 'created_by' => $user->id,
                    'created_at' => now(), 'updated_at' => now(),
                ])->toArray();
                $createdDeliverables = $task->deliverables()->createMany($deliverableData);
                foreach ($createdDeliverables as $dlv) {
                    if ((int) $dlv->assigned_to !== (int) $user->id) {
                        $deliverableNotifications[] = [
                            'user_id' => $dlv->assigned_to, 'sender_user_id' => $user->id,
                            'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                            'related_id' => $dlv->id,
                            'title' => 'Deliverable Assigned',
                            'message' => 'A new deliverable "'.$dlv->title.'" has been assigned to you by '.$user->name.'.',
                            'link' => '/deliveries?selectedDeliverable='.$dlv->id,
                        ];
                    }
                }
            }

            // Save deliverable templates for recurring standalone tasks
            if (! empty($validated['deliverable_templates'])) {
                $templateData = [];
                foreach ($validated['deliverable_templates'] as $order => $tmpl) {
                    $templateData[] = [
                        'task_id' => $task->id,
                        'title' => $tmpl['title'],
                        'description' => $tmpl['description'] ?? null,
                        'quantity' => $tmpl['quantity'] ?? 1,
                        'combined' => $tmpl['combined'] ?? false,
                        'sort_order' => $order,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
                DB::table('deliverable_templates')->insert($templateData);

                // Generate ALL deliverables immediately for recurring standalone tasks
                if (($validated['task_type'] ?? 'standard') === 'recurring') {
                    $recurringSvc = app(RecurringService::class);
                    $settings = $validated['recurrence_settings'];
                    $taskStartDate = $validated['start_date'] ?? now()->toDateTimeString();
                    $taskEndDate = $validated['end_date'] ?? now()->addDays(30)->toDateTimeString();
                    $totalPeriods = $recurringSvc->calculateTotalPeriods($settings, $taskStartDate, $taskEndDate);
                    $allDlvs = collect();
                    for ($p = 1; $p <= $totalPeriods; $p++) {
                        $date = $recurringSvc->getPeriodDate(
                            $taskStartDate,
                            $settings['repeat'] ?? 'daily',
                            $p,
                            (bool) ($settings['skip_weekends'] ?? false)
                        );
                        $created = $recurringSvc->generateOccurrenceDeliverables($task, $p, $date->format('Y-m-d'));
                        $allDlvs = $allDlvs->concat($created);
                    }
                    $task->update([
                        'deliverables_generated' => $totalPeriods,
                        'recurrence_status' => 'completed',
                    ]);
                    foreach ($allDlvs as $dlv) {
                        if ((int) $dlv->assigned_to !== (int) $user->id) {
                            $deliverableNotifications[] = [
                                'user_id' => $dlv->assigned_to, 'sender_user_id' => $user->id,
                                'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                                'related_id' => $dlv->id,
                                'title' => 'Deliverable Assigned',
                                'message' => 'A new recurring deliverable "'.$dlv->title.'" has been created.',
                                'link' => '/deliveries?selectedDeliverable='.$dlv->id,
                            ];
                        }
                    }
                }
            }

            $createdTasks[] = $task;
        }

        if (! empty($workflowRecords)) {
            DB::table('task_workflow_events')->insert($workflowRecords);
        }
        if (! empty($deliverableNotifications)) {
            $this->notificationService->createBulk($deliverableNotifications);
        }

        $sent = [];
        $notifications = [];
        foreach ($createdTasks as $task) {
            foreach ($validated['assigned_to'] as $assigneeId) {
                if ((int) $assigneeId === (int) $user->id || in_array($assigneeId, $sent)) {
                    continue;
                }
                $sent[] = $assigneeId;
                $notifications[] = [
                    'user_id' => $assigneeId, 'sender_user_id' => $user->id,
                    'type' => 'task_assigned', 'related_module' => 'task',
                    'related_id' => $task->id, 'title' => 'Task Assigned',
                    'message' => 'A new task "'.$task->title.'" has been assigned to you by '.$user->name.'.',
                    'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                ];
            }
        }
        $this->notificationService->createBulk($notifications);

        // Send confirmation email to performer
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->notificationService->confirmAction($user, 'Assigned', 'task', $createdTasks[0]->title, [
            'Assigned To' => $assigneeNames,
            'Tasks Created' => (string) $taskCount,
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_created', 'You created '.$taskCount.' task(s) and assigned them to '.$assigneeNames, 'task', $createdTasks[0]->id);
        $this->clearDashboardCache($user->id);

        // Clear cache for all assignees
        foreach ($validated['assigned_to'] as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'create',
                description: "Created {$taskCount} standalone task(s)",
                user: $user,
                entityType: 'Task',
                entityId: $createdTasks[0]->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $firstTask = $createdTasks[0]->load('assignees:id,name,email,role');

        return response()->json([
            'success' => true,
            'message' => count($createdTasks).' task(s) created successfully',
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
     * @param  Request  $request  Validated input for updatable fields.
     * @param  Task  $task  The task to update.
     * @return JsonResponse JSON response with the updated task and change count.
     */
    public function update(Request $request, Task $task)
    {
        $user = $request->user();
        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the task creator can edit'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be edited.'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'requirements' => 'sometimes|nullable|array',
            'requirements.*' => 'required_with:requirements|string|max:500',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'priority' => 'sometimes|string|max:32',
            'status' => 'sometimes|string|max:64',
            'assigned_to' => 'nullable|array',
            'assigned_to.*' => 'integer|exists:users,id',
            'deliverables' => 'nullable|array',
            'deliverables.*.id' => 'nullable|integer|exists:deliverables,id',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.due_date' => 'nullable|date',
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'existing_file_names' => 'nullable|array',
            'existing_file_names.*.id' => 'required_with:existing_file_names|exists:task_files,id',
            'existing_file_names.*.name' => 'nullable|string|max:255',
            'existing_file_names.*.url' => 'nullable|string|max:2048',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
        ]);

        $assigneeIds = $validated['assigned_to'] ?? null;
        unset($validated['assigned_to']);
        $dueDates = $validated['due_dates'] ?? null;
        unset($validated['due_dates']);
        $existingFileNames = $validated['existing_file_names'] ?? null;
        unset($validated['existing_file_names']);

        // Validate task end_date does not exceed project end_date
        if (! empty($validated['end_date']) && $task->project && $task->project->end_date) {
            $taskEnd = \Carbon\Carbon::parse($validated['end_date']);
            $projectEnd = \Carbon\Carbon::parse($task->project->end_date);
            if ($taskEnd->gt($projectEnd)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'end_date' => 'Task deadline cannot exceed the project deadline ('.$projectEnd->format('d M Y h:i A').').',
                ]);
            }
        }

        $oldValues = [];
        foreach (['title', 'description', 'requirements', 'start_date', 'end_date', 'priority', 'status'] as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $task->{$f};
            }
        }

        $oldAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $validated['updated_by'] = $user->id;
        $task->update($validated);

        // Rename existing files/links if provided
        if ($existingFileNames) {
            foreach ($existingFileNames as $item) {
                $updateData = [];
                if (isset($item['name'])) $updateData['name'] = $item['name'];
                if (isset($item['url'])) $updateData['url'] = $item['url'];
                if (!empty($updateData)) {
                    \App\Models\TaskFile::where('id', $item['id'])
                        ->where('task_id', $task->id)
                        ->update($updateData);
                }
            }
        }

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $task->{$f};
            if (is_array($oldVal) || is_array($newVal)) {
                $oldJson = json_encode($oldVal ?? []);
                $newJson = json_encode($newVal ?? []);
                if ($oldJson !== $newJson) {
                    $changes[] = ['field_name' => $f, 'label' => ucfirst(str_replace('_', ' ', $f)), 'old_value' => $oldJson, 'new_value' => $newJson];
                }
            } else {
                $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
                $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
                if ($oldStr !== $newStr) {
                    $changes[] = ['field_name' => $f, 'label' => ucfirst(str_replace('_', ' ', $f)), 'old_value' => $oldStr, 'new_value' => $newStr];
                }
            }
        }

        if (! empty($assigneeIds) && $oldAssigneeIds !== $assigneeIds) {
            $allIds = array_unique(array_merge($oldAssigneeIds, $assigneeIds));
            $userNames = User::whereIn('id', $allIds)->pluck('name', 'id');
            $oldNames = collect($oldAssigneeIds)->map(fn ($id) => $userNames->get($id))->implode(', ');
            $newNames = collect($assigneeIds)->map(fn ($id) => $userNames->get($id))->implode(', ');
            $changes[] = ['field_name' => 'assigned_to', 'label' => 'Assignee', 'old_value' => $oldNames ?: 'None', 'new_value' => $newNames ?: 'None'];
            $syncData = [];
            foreach ($assigneeIds as $id) {
                $syncData[$id] = ['due_date' => $dueDates[$id] ?? null];
            }
            $task->assignees()->sync($syncData);
            $task->update(['assigned_to' => $assigneeIds[0]]);

            $newlyAssignedIds = array_values(array_diff($assigneeIds, $oldAssigneeIds));
            if (! empty($newlyAssignedIds)) {
                $newAssignNotifications = [];
                foreach ($newlyAssignedIds as $newId) {
                    if ((int) $newId === (int) $user->id) {
                        continue;
                    }
                    $newAssignNotifications[] = [
                        'user_id' => $newId, 'sender_user_id' => $user->id,
                        'type' => 'task_assigned', 'related_module' => 'task',
                        'related_id' => $task->id, 'title' => 'Task Assigned',
                        'message' => 'A new task "'.$task->title.'" has been assigned to you by '.$user->name.'.',
                        'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                    ];
                }
                if (! empty($newAssignNotifications)) {
                    $this->notificationService->createBulk($newAssignNotifications);
                }
            }
        } elseif (!empty($dueDates) && !empty($assigneeIds)) {
            $syncData = [];
            foreach ($assigneeIds as $id) {
                $syncData[$id] = ['due_date' => $dueDates[$id] ?? null];
            }
            $task->assignees()->sync($syncData);
        }

        $addedDeliverables = [];
        if (! empty($validated['deliverables'])) {
            $existingDeliverableIds = $task->deliverables()->pluck('id')->toArray();
            $submittedIds = collect($validated['deliverables'])->pluck('id')->filter()->values()->toArray();

            // Update existing deliverables
            foreach ($validated['deliverables'] as $del) {
                if (! empty($del['id'])) {
                    $task->deliverables()->where('id', $del['id'])->update([
                        'title' => $del['title'],
                        'due_date' => $del['due_date'] ?? null,
                        'assigned_to' => $del['assigned_to'] ?? $task->assigned_to,
                    ]);
                }
            }

            // Create only new deliverables (ones without id)
            $newDeliverables = collect($validated['deliverables'])->filter(fn ($del) => empty($del['id']));
            if ($newDeliverables->isNotEmpty()) {
                $delData = $newDeliverables->map(fn ($del) => [
                    'title' => $del['title'], 'description' => $del['description'] ?? null,
                    'due_date' => $del['due_date'] ?? null, 'assigned_to' => $del['assigned_to'] ?? $task->assigned_to,
                    'created_by' => $user->id,
                ])->toArray();
                $createdDeliverables = $task->deliverables()->createMany($delData);
                $addedDeliverables = array_column($delData, 'title');
                $changes[] = ['field_name' => 'deliverables', 'label' => 'Deliverable Added', 'old_value' => '', 'new_value' => implode(', ', $addedDeliverables)];
            }
        }

        // Bulk create changes and workflow events
        if (! empty($changes)) {
            $task->changes()->createMany(
                array_map(fn ($c) => [
                    'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
                    'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
                ], $changes)
            );
            $now = now()->toDateTimeString();
            TaskWorkflowEvent::insert(
                array_map(fn ($c) => [
                    'task_id' => $task->id, 'user_id' => $user->id, 'action' => 'field_changed',
                    'comment' => $c['label'].': '.$c['old_value'].' → '.$c['new_value'],
                    'created_at' => $now, 'updated_at' => $now,
                ], $changes)
            );
        }

        $this->sendTaskUpdateNotification($task, $user, $changes);

        // Send confirmation email to performer
        if (count($changes) > 0) {
            $fieldNames = array_column($changes, 'label');
            $this->notificationService->confirmAction($user, 'Updated', 'task', $task->title, [
                'Project' => $task->project?->title ?? 'N/A',
                'Changes Made' => implode(', ', array_slice($fieldNames, 0, 5)).(count($fieldNames) > 5 ? ' and more' : ''),
            ]);
        }

        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'update',
                description: "Updated task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                oldValues: $oldValues,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => count($changes) > 0 ? 'Task updated — '.count($changes).' change(s) made' : 'Task updated successfully',
            'task' => $task->fresh()->load('assignees:id,name,email,role'),
            'changes_count' => count($changes),
        ]);
    }

    /**
     * Update a recurring task's templates, settings, and optionally regenerate future deliverables.
     *
     * Completed deliverables are never modified. Only future deliverables may be regenerated.
     * Regeneration requires explicit confirmation via regenerate=true.
     *
     * @param  Request  $request  Recurrence settings, templates, and regenerate flag.
     * @param  Task  $task  The recurring task.
     * @return JsonResponse
     */
    public function updateRecurring(Request $request, Task $task, RecurringService $recurringService): JsonResponse
    {
        $user = $request->user();
        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'recurrence_settings' => 'nullable|array',
            'recurrence_settings.repeat' => 'sometimes|in:daily,weekly,monthly,custom',
            'recurrence_settings.skip_weekends' => 'nullable|boolean',
            'deliverable_templates' => 'nullable|array|min:1',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
            'regenerate' => 'required|boolean',
        ]);

        // Ensure task is marked as recurring
        if ($task->task_type !== 'recurring') {
            $task->update(['task_type' => 'recurring']);
        }

        // Update recurrence settings
        if (!empty($validated['recurrence_settings'])) {
            $task->update(['recurrence_settings' => $validated['recurrence_settings']]);
        }

        // Update templates
        if (!empty($validated['deliverable_templates'])) {
            DB::table('deliverable_templates')->where('task_id', $task->id)->delete();
            $templateData = [];
            foreach ($validated['deliverable_templates'] as $order => $tmpl) {
                $templateData[] = [
                    'task_id' => $task->id,
                    'title' => $tmpl['title'],
                    'description' => $tmpl['description'] ?? null,
                    'quantity' => $tmpl['quantity'] ?? 1,
                    'combined' => $tmpl['combined'] ?? false,
                    'sort_order' => $order,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            DB::table('deliverable_templates')->insert($templateData);
        }

        // Regenerate future deliverables if requested
        $regeneratedCount = 0;
        if ($validated['regenerate']) {
            $today = now()->startOfDay();
            $generated = (int) $task->deliverables_generated;

            // Find non-completed deliverables with due_date >= today
            $futureDeliverables = $task->deliverables()
                ->where('status', '!=', 'approved')
                ->whereDate('due_date', '>=', $today)
                ->get();

            // Delete future non-completed deliverables
            $futureDeliverables->each(function ($dlv) {
                $dlv->submissions()->delete();
                $dlv->workflowEvents()->delete();
                $dlv->changes()->delete();
                $dlv->delete();
            });

            // Recalculate delivered count
            $remainingDeliverables = $task->deliverables()->count();
            $totalPerPeriod = array_sum(
                array_map(fn($t) => (int) ($t['quantity'] ?? 1), $validated['deliverable_templates'] ?? $task->deliverableTemplates()->get()->toArray())
            );
            $completedPeriods = $totalPerPeriod > 0 ? (int) floor($remainingDeliverables / $totalPerPeriod) : 0;

            // Reset deliverables_generated to remaining completed periods
            $task->update(['deliverables_generated' => $completedPeriods]);
            $regeneratedCount = $futureDeliverables->count();
        }

        $task->fresh()->load('deliverableTemplates');

        return response()->json([
            'success' => true,
            'message' => $regeneratedCount > 0
                ? "Task updated and {$regeneratedCount} future deliverable(s) regenerated"
                : 'Task updated successfully',
            'task' => $task,
            'regenerated_count' => $regeneratedCount,
        ]);
    }

    /**
     * Update only the status of a task.
     *
     * @param  Request  $request  Input: status (required).
     * @param  Task  $task  The task to update.
     * @return JsonResponse JSON response with the updated task.
     */
    public function updateStatus(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);
        }

        $validated = $request->validate(['status' => 'required|string|max:64|in:pending,in_progress,review,completed,done,failed,abandoned']);
        $oldStatus = $task->status;
        $task->update(['status' => $validated['status']]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id,
            'action' => 'status_updated',
            'comment' => $oldStatus.' → '.$validated['status'],
        ]);

        $task->load('assignees:id,name,role');
        $assigneeIds = $task->assignees->pluck('id')->toArray();

        $notifications = [];
        foreach (array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id) as $assigneeId) {
            $notifications[] = [
                'user_id' => $assigneeId,
                'sender_user_id' => $user->id,
                'type' => 'task_status_updated',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Status Updated',
                'message' => $user->name.' changed status of task "'.$task->title.'" from '.$oldStatus.' to '.$validated['status'].'.',
                'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
            ];
        }
        $this->notificationService->createBulk($notifications);

        $this->notificationService->confirmAction($user, 'Updated status of', 'task', $task->title, [
            'Previous Status' => $oldStatus,
            'New Status' => $validated['status'],
        ]);

        $this->clearDashboardCache($user->id);

        // Clear cache for all assignees
        foreach ($assigneeIds as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        return response()->json(['success' => true, 'message' => 'Task status updated', 'task' => $task->fresh()->load('assignees:id,name,email,role')]);
    }

    /**
     * Mark a task as completed and create a deliverable from it.
     *
     * Notifies the task creator that the task is ready for review.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Task  $task  The task to complete.
     * @return JsonResponse JSON response with the completed task and created deliverable.
     */
    public function completeTask(Request $request, Task $task)
    {
        try {
            $user = $request->user();
            $isCreator = intval($task->assigned_by) === intval($user->id);
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

            if (! $isCreator && ! $isAssignee) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $task->update(['status' => 'completed']);

            TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'completed']);

            $deliverable = Deliverable::create([
                'project_id' => $task->project_id, 'task_id' => $task->id,
                'title' => $task->title, 'description' => $task->description,
                'status' => 'pending', 'priority' => $task->priority,
                'due_date' => $task->end_date, 'assigned_to' => $user->id,
                'created_by' => $task->assigned_by,
            ]);

            $task->load('project:id,title');

            if ($task->assigned_by && $task->assigned_by !== $user->id) {
                $this->notificationService->notify(
                    $task->assigned_by,
                    $user->id,
                    'task_completed',
                    'task',
                    $task->id,
                    'Task Completed',
                    $user->name.' has completed the task "'.$task->title.'" and submitted it for review.',
                    '/tasks/task-details/'.$task->id.'?from=taskby'
                );
            }

            // Send confirmation email to performer
            $this->notificationService->confirmAction($user, 'Completed', 'task', $task->title, [
                'Project' => $task->project?->title ?? 'N/A',
                'Status' => 'Submitted for review',
            ]);

            // Log activity
            $this->activityService->log($user->id, 'task_completed', 'You completed task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        // Also clear dashboard cache for all assignees so their "today tasks" and summary refresh
        $taskAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
        foreach ($taskAssigneeIds as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        try {
                $this->auditService->log(
                    module: 'task_management',
                    action: 'complete',
                    description: "Completed task {$task->title}",
                    user: $user,
                    entityType: 'Task',
                    entityId: $task->id,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Task moved to deliverables',
                'task' => $task->fresh()->load('assignees:id,name,email,role'),
                'deliverable' => $deliverable,
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to complete task: '.$e->getMessage()], 500);
        }
    }

    /**
     * Acknowledge a task assignment.
     *
     * Only assignees can acknowledge. Changes status from pending to in_progress
     * and notifies the task creator.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Task  $task  The task to acknowledge.
     * @return JsonResponse JSON response with the updated task.
     */
    public function acknowledge(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Only assignees can acknowledge this task'], 403);
        }

        if (strtolower((string) $task->status) !== 'pending') {
            return response()->json(['success' => false, 'message' => 'This task cannot be acknowledged in its current status'], 422);
        }

        $task->update([
            'status' => 'in_progress',
            'acknowledged_at' => now(),
            'acknowledged_by' => $user->id,
        ]);

        // Update the assignee's pivot status
        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'in_progress',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'acknowledged',
            'comment' => $user->name.' acknowledged this task',
        ]);

        $task->load('project:id,title');

        // Notify the task creator
        if ($task->assigned_by && $task->assigned_by !== $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_acknowledged',
                'task',
                $task->id,
                'Task Acknowledged',
                $user->name.' acknowledged task "'.$task->title.'".',
                '/tasks/task-details/'.$task->id.'?from=taskby'
            );
        }

        $this->notificationService->confirmAction($user, 'Acknowledged', 'task', $task->title);
        $this->clearDashboardCache($user->id);

        if ($task->assigned_by) {
            $this->clearDashboardCache((int) $task->assigned_by);
        }

        return response()->json([
            'success' => true,
            'message' => 'Task acknowledged successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'acknowledgedBy:id,name']),
        ]);
    }

    /**
     * Pause an in-progress task.
     *
     * Only assignees can pause. Changes status from in_progress to paused
     * and notifies the task creator.
     */
    public function pause(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Only assignees can pause this task'], 403);
        }

        if (strtolower((string) $task->status) !== 'in_progress') {
            return response()->json(['success' => false, 'message' => 'This task cannot be paused in its current status'], 422);
        }

        $task->update([
            'status' => 'paused',
            'paused_at' => now(),
            'paused_by' => $user->id,
        ]);

        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'paused',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'paused',
            'comment' => $user->name.' paused this task',
        ]);

        $task->load('project:id,title');

        // Notify the task creator
        if ($task->assigned_by && $task->assigned_by !== $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_paused',
                'task',
                $task->id,
                'Task Paused',
                $user->name.' paused task "'.$task->title.'".',
                '/tasks/task-details/'.$task->id.'?from=taskby'
            );
        }

        $this->notificationService->confirmAction($user, 'Paused', 'task', $task->title);
        $this->clearDashboardCache($user->id);

        if ($task->assigned_by) {
            $this->clearDashboardCache((int) $task->assigned_by);
        }

        return response()->json([
            'success' => true,
            'message' => 'Task paused successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role', 'pausedBy:id,name']),
        ]);
    }

    /**
     * Continue a paused task (resume).
     *
     * Only assignees can continue. Changes status from paused back to in_progress
     * and notifies the task creator.
     */
    public function continueTask(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Only assignees can continue this task'], 403);
        }

        if (strtolower((string) $task->status) !== 'paused') {
            return response()->json(['success' => false, 'message' => 'This task is not paused'], 422);
        }

        $task->update([
            'status' => 'in_progress',
            'paused_at' => null,
            'paused_by' => null,
        ]);

        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'in_progress',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'continued',
            'comment' => $user->name.' continued this task',
        ]);

        $task->load('project:id,title');

        // Notify the task creator
        if ($task->assigned_by && $task->assigned_by !== $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_continued',
                'task',
                $task->id,
                'Task Continued',
                $user->name.' continued task "'.$task->title.'".',
                '/tasks/task-details/'.$task->id.'?from=taskby'
            );
        }

        $this->notificationService->confirmAction($user, 'Continued', 'task', $task->title);
        $this->clearDashboardCache($user->id);

        if ($task->assigned_by) {
            $this->clearDashboardCache((int) $task->assigned_by);
        }

        return response()->json([
            'success' => true,
            'message' => 'Task resumed successfully',
            'task' => $task->fresh()->load(['assignees:id,name,email,role']),
        ]);
    }

    /**
     * Submit a task for review by its creator.
     *
     * Only the assignee can submit. All deliverables must be submitted first.
     * Handles file uploads, link attachments, and determines first submission vs resubmission.
     *
     * @param  Request  $request  Input: comment, file, files[], links[].
     * @param  Task  $task  The task to submit.
     * @return JsonResponse JSON response with the updated task.
     */
    public function submit(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Only the assignee can submit this task'], 403);
        }
        if (! in_array($task->status, ['pending', 'in_progress', 'reopened', 'paused'])) {
            return response()->json(['success' => false, 'message' => 'This task cannot be submitted in its current status'], 422);
        }

        $pendingDeliverables = $task->deliverables()->where('status', 'pending')->count();
        if ($pendingDeliverables > 0) {
            return response()->json(['success' => false, 'message' => 'All deliverables must be submitted before submitting this task'], 422);
        }

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
            $filePath = $file->store('task-submissions/'.$task->id, 'public');
        }

        $submission = TaskSubmission::create([
            'task_id' => $task->id, 'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        if ($request->hasFile('files')) {
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(fn ($file) => [
                    'submission_type' => 'task',
                    'file_name' => basename($path = $file->store('task-submissions/'.$task->id, 'public')),
                    'original_name' => $file->getClientOriginalName(), 'file_path' => $path,
                    'file_type' => $file->getMimeType(), 'file_size' => $file->getSize(),
                    'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                    'url' => '/storage/'.$path,
                ])->toArray()
            );
        }

        if (! empty($validated['links'])) {
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

        if (in_array($task->status, ['reopened', 'in_progress', 'paused'])) {
            foreach (['rejected_at', 'rejected_by', 'rejection_comment', 'reopened_at', 'reopened_by', 'reopen_comment', 'reopen_instructions', 'reopen_new_deadline', 'reopen_file_path', 'reopen_file_name'] as $f) {
                $updateData[$f] = null;
            }
        }

        $task->update($updateData);

        // Update the submitting user's pivot status for per-user tracking
        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'submitted',
            'submitted_at' => now(),
        ]);

        $task->load('project:id,title');

        if ($task->assigned_by && $task->assigned_by !== $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_submitted',
                'task',
                $task->id,
                'Task Submitted',
                $user->name.' has completed the task "'.$task->title.'" and submitted it for review.',
                '/tasks/task-details/'.$task->id.'?from=taskby'
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, $isResubmit ? 'Resubmitted' : 'Submitted', 'task', $task->title, [
            'Project' => $task->project?->title ?? 'N/A',
            'Submitted To' => User::find($task->assigned_by)?->name ?? 'N/A',
        ]);

        // Log activity
        $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
        $this->activityService->log($user->id, 'task_'.$isResubmitLabel, 'You '.$isResubmitLabel.' task "'.$task->title.'" for review', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'submit',
                description: ($isResubmit ? 'Resubmitted' : 'Submitted')." task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

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
     * @param  Request  $request  The incoming HTTP request.
     * @param  Task  $task  The task to approve (must be in 'submitted' status).
     * @return JsonResponse JSON response with the approved task.
     */
    public function approve(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($task->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted tasks'], 422);
        }

        $task->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id, 'updated_by' => $user->id]);

        TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'approved']);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id),
            $user->id,
            'task_approved',
            'task',
            $task->id,
            'Task Approved',
            'Your task "'.$task->title.'" has been approved.',
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Approved', 'task', $task->title, [
            'Project' => $task->project?->title ?? 'N/A',
            'Assigned To' => $task->assignees->pluck('name')->implode(', '),
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_approved', 'You approved task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'approve',
                description: "Approved task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

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
     * @param  Request  $request  Input: comment (optional).
     * @param  Task  $task  The task to reject (must be in 'submitted' status).
     * @return JsonResponse JSON response with the rejected task.
     */
    public function reject(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($task->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reject submitted tasks'], 422);
        }

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $task->update(['status' => 'rejected', 'rejected_at' => now(), 'rejected_by' => $user->id, 'rejection_comment' => $validated['comment'] ?? null, 'updated_by' => $user->id]);

        TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'rejected', 'comment' => $validated['comment'] ?? null]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $assigneeIds = array_values(array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id));
        $rejectMsg = 'Your task "'.$task->title.'" has been rejected. Please make the required changes.';
        if (! empty($validated['comment'])) {
            $rejectMsg .= ' Reason: '.$validated['comment'];
        }

        $this->notificationService->notifyMultiple(
            $assigneeIds,
            $user->id,
            'task_rejected',
            'task',
            $task->id,
            'Task Rejected',
            $rejectMsg,
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Rejected', 'task', $task->title, [
            'Project' => $task->project?->title ?? 'N/A',
            'Assigned To' => $task->assignees->pluck('name')->implode(', '),
            'Reason' => $validated['comment'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_rejected', 'You rejected task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'reject',
                description: "Rejected task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

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
     * @param  Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  Task  $task  The task to reopen.
     * @return JsonResponse JSON response with the reopened task.
     */
    public function reopen(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($task->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reopen submitted tasks'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000', 'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date', 'file' => 'nullable|file|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('task-reopen/'.$task->id, 'public');
        }

        $updateData = [
            'status' => 'reopened', 'reopened_at' => now(), 'reopened_by' => $user->id,
            'reopen_comment' => $validated['comment'] ?? null,
            'reopen_instructions' => $validated['instructions'] ?? null,
            'updated_by' => $user->id,
        ];
        if (! empty($validated['new_deadline'])) {
            $updateData['reopen_new_deadline'] = $validated['new_deadline'];
            $updateData['end_date'] = $validated['new_deadline'];
        }
        if (! empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $task->update($updateData);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id, 'action' => 'reopened',
            'comment' => $validated['comment'] ?? null, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $assigneeIds = array_values(array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id));
        $reopenMsg = 'Your task "'.$task->title.'" has been reopened for revision.';
        if (! empty($validated['comment'])) {
            $reopenMsg .= ' Comment: '.$validated['comment'];
        }
        if (! empty($validated['instructions'])) {
            $reopenMsg .= ' Instructions: '.$validated['instructions'];
        }

        $this->notificationService->notifyMultiple(
            $assigneeIds,
            $user->id,
            'task_reopened',
            'task',
            $task->id,
            'Task Reopened',
            $reopenMsg,
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Reopened', 'task', $task->title, [
            'Project' => $task->project?->title ?? 'N/A',
            'Assigned To' => $task->assignees->pluck('name')->implode(', '),
            'Instructions' => $validated['instructions'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_reopened', 'You reopened task "'.$task->title.'" for revision', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'reopen',
                description: "Reopened task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

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
     * @param  Request  $request  The incoming HTTP request.
     * @param  Task  $task  The task to get the latest submission for.
     * @return JsonResponse JSON response with the latest submission.
     */
    public function latestSubmission(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isCreator && ! $isAssignee && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $submission = TaskSubmission::where('task_id', $task->id)->with('submittedBy:id,name,email')->latest()->first();

        return response()->json(['success' => true, 'submission' => $submission]);
    }

    /**
     * Download the file attached to a task submission.
     *
     * @param  TaskSubmission  $submission  The submission containing the file.
     * @return BinaryFileResponse|JsonResponse File download or error.
     */
    public function downloadSubmissionFile(TaskSubmission $submission)
    {
        $user = request()->user();
        $task = $submission->task;
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isCreator && ! $isAssignee && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (! $submission->file_path || ! Storage::disk('public')->exists($submission->file_path)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    /**
     * Mark all unviewed changes on a task as read.
     *
     * @param  Task  $task  The task whose changes to mark.
     * @return JsonResponse JSON response confirming changes marked.
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
     * @param  Task  $task  The task to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function destroy(Task $task)
    {
        $user = request()->user();
        if ((int) $task->assigned_by !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the task creator can delete'], 403);
        }

        $task->assignees()->detach();
        $task->deliverables()->delete();
        $task->files()->delete();
        $task->delete();

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'delete',
                description: "Deleted task {$task->title}",
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'Task deleted successfully']);
    }

    /**
     * Upload a file to a task. Only the creator, assignee, or admin/manager can upload.
     *
     * @param  Request  $request  Input: file (required, max 10MB).
     * @param  Task  $task  The task to upload the file to.
     * @return JsonResponse JSON response with the created file record.
     */
    public function uploadFile(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);
        }

        $request->validate(['file' => 'required|file|max:10240', 'name' => 'nullable|string|max:255']);
        $file = $request->file('file');
        $path = $file->store('task-files/'.$task->id, 'public');
        $customName = $request->input('name') ?: $file->getClientOriginalName();
        $fileRecord = $task->files()->create(['name' => $customName, 'url' => '/storage/'.$path]);

        TaskChange::create([
            'task_id' => $task->id,
            'field_name' => 'file_uploaded',
            'old_value' => null,
            'new_value' => $customName,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'File uploaded: '.$file->getClientOriginalName(),
        ]);

        return response()->json(['success' => true, 'message' => 'File uploaded successfully', 'file' => $fileRecord], 201);
    }

    /**
     * Add a URL link to a task. Only the creator, assignee, or admin/manager can add links.
     *
     * @param  Request  $request  Input: url (required), name (optional).
     * @param  Task  $task  The task to add the link to.
     * @return JsonResponse JSON response with the created file record.
     */
    public function addLink(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);
        }

        $validated = $request->validate(['url' => 'required|url|max:2048', 'name' => 'nullable|string|max:255']);
        $linkName = $validated['name'] ?? $validated['url'];
        $fileRecord = $task->files()->create(['name' => $linkName, 'url' => $validated['url']]);

        TaskChange::create([
            'task_id' => $task->id,
            'field_name' => 'link_added',
            'old_value' => null,
            'new_value' => $linkName,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'Link added: '.$linkName,
        ]);

        return response()->json(['success' => true, 'message' => 'Link added successfully', 'file' => $fileRecord], 201);
    }

    /**
     * Delete a file or link from a task. Also removes the physical file if it exists on disk.
     *
     * @param  Task  $task  The task the file belongs to.
     * @param  TaskFile  $file  The file to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function deleteFile(Task $task, TaskFile $file)
    {
        $user = request()->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);
        }

        $fileName = $file->name;
        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            Storage::disk('public')->delete($relativePath);
        }
        $file->delete();

        TaskChange::create([
            'task_id' => $task->id,
            'field_name' => 'file_removed',
            'old_value' => $fileName,
            'new_value' => null,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'File removed: '.$fileName,
        ]);

        return response()->json(['success' => true, 'message' => 'File deleted successfully']);
    }

    /**
     * Rename a task file/link by updating its name (and optionally URL).
     *
     * @param  Request  $request  Input: name (required), url (optional).
     * @param  Task     $task     The task the file belongs to.
     * @param  TaskFile $file     The file to rename.
     * @return JsonResponse JSON response with the updated file.
     */
    public function renameFile(Request $request, Task $task, TaskFile $file)
    {
        $user = request()->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (strtolower((string) $task->status) === 'approved') {
            return response()->json(['success' => false, 'message' => 'Approved tasks cannot be modified.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'url' => 'nullable|string|max:2048',
        ]);

        $oldName = $file->name;
        $file->name = $validated['name'];
        if (array_key_exists('url', $validated)) {
            $file->url = $validated['url'];
        }
        $file->save();

        TaskChange::create([
            'task_id' => $task->id,
            'field_name' => 'file_renamed',
            'old_value' => $oldName,
            'new_value' => $file->name,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'File renamed: '.$oldName.' → '.$file->name,
        ]);

        return response()->json(['success' => true, 'file' => $file]);
    }

    /**
     * Reorder task files by updating their sort_order values in bulk.
     *
     * @param  Request  $request  Input: items[] with id and sort_order.
     * @param  Task  $task  The task whose files are being reordered.
     * @return JsonResponse JSON response confirming reorder.
     */
    public function reorderFiles(Request $request, Task $task)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:task_files,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        foreach ($request->items as $item) {
            TaskFile::where('id', $item['id'])->where('task_id', $task->id)->update(['sort_order' => $item['sort_order']]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Reorder tasks by updating their sort_order values in bulk.
     *
     * @param  Request  $request  Input: items[] with id and sort_order.
     * @return JsonResponse JSON response confirming reorder.
     */
    public function reorderTasks(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:tasks,id', 'items.*.sort_order' => 'required|integer|min:0']);
        $ids = [];
        $bindings = [];
        foreach ($request->items as $item) {
            $ids[] = (int) $item['id'];
            $bindings[] = (int) $item['id'];
            $bindings[] = (int) $item['sort_order'];
        }
        if (! empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            DB::statement('UPDATE tasks SET sort_order = CASE id '.implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?'))." END WHERE id IN ($ph)", [...$bindings, ...$ids]);
        }

        return response()->json(['success' => true, 'message' => 'Tasks reordered successfully']);
    }

    /**
     * Send update notifications to all task assignees (excluding the updater).
     *
     * @param  Task  $task  The updated task.
     * @param  User  $updater  The user who made the update.
     * @param  int  $changeCount  Number of changes made.
     */
    private function sendTaskUpdateNotification(Task $task, User $updater, array $changes = []): void
    {
        if (! $task->relationLoaded('assignees')) {
            $task->load('assignees:id');
        }
        $assigneeIds = $task->assignees->pluck('id')->toArray();

        $changeLabels = array_map(fn ($c) => $c['label'] ?? ucwords(str_replace('_', ' ', $c['field_name'])), $changes);
        $summary = count($changeLabels) > 0
            ? implode(', ', array_slice($changeLabels, 0, 4)).(count($changeLabels) > 4 ? ' and '.(count($changeLabels) - 4).' more' : '')
            : 'details';

        $msg = $updater->name.' updated task "'.$task->title.'" — changed: '.$summary.'.';

        $notifications = [];
        foreach (array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $updater->id) as $assigneeId) {
            $notifications[] = [
                'user_id' => $assigneeId,
                'sender_user_id' => $updater->id,
                'type' => 'task_updated',
                'related_module' => 'task',
                'related_id' => $task->id,
                'title' => 'Task Updated',
                'message' => $msg,
                'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
            ];
        }

        $this->notificationService->createBulk($notifications);
    }

    /**
     * Get access credentials for a task.
     * Creator (assigner) sees all; assignees see only credentials assigned to them.
     */
    public function getAccessCredentials(Task $task)
    {
        $user = request()->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees->contains('id', $user->id);

        if (!$isCreator && !$isAssignee) {
            return response()->json(['success' => true, 'credentials' => []]);
        }

        $credentials = $task->accessCredentials()
            ->with('assignedUsers:id,name,role')
            ->get()
            ->filter(function ($cred) use ($user, $isCreator) {
                if ($isCreator) {
                    return true;
                }
                return $cred->assignedUsers->contains('id', $user->id);
            })
            ->values();

        return response()->json([
            'success' => true,
            'credentials' => $credentials->map(function ($cred) {
                return [
                    'id' => $cred->id,
                    'website_name' => $cred->website_name,
                    'website_url' => $cred->website_url,
                    'username' => $cred->username,
                    'password' => $cred->password_decrypted,
                    'assigned_users' => $cred->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
                    'created_by' => $cred->creator?->name,
                    'created_at' => $cred->created_at,
                ];
            }),
        ]);
    }

    /**
     * Store a new access credential for a task.
     * Any authenticated user (assigner or assignee) can create.
     */
    public function storeAccessCredential(Request $request, Task $task)
    {
        $request->validate([
            'website_name' => 'required|string|max:255',
            'username' => 'required|string|max:255',
            'password' => 'required|string|max:1000',
            'assigned_user_ids' => 'required|array|min:1',
            'assigned_user_ids.*' => 'exists:users,id',
        ]);

        $credential = $task->accessCredentials()->create([
            'website_name' => $request->website_name,
            'username' => $request->username,
            'password' => $request->password,
            'created_by' => $request->user()->id,
        ]);

        $credential->assignedUsers()->sync($request->assigned_user_ids);

        return response()->json([
            'success' => true,
            'message' => 'Access credential created successfully',
            'credential' => [
                'id' => $credential->id,
                'website_name' => $credential->website_name,
                'website_url' => $credential->website_url,
                'username' => $credential->username,
                'password' => $credential->password_decrypted,
                'assigned_users' => $credential->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ], 201);
    }

    /**
     * Update an access credential for a task.
     */
    public function updateAccessCredential(Request $request, Task $task, \App\Models\TaskAccessCredential $credential)
    {
        if ($credential->task_id !== $task->id) {
            return response()->json(['success' => false, 'message' => 'Credential does not belong to this task'], 404);
        }

        $request->validate([
            'website_name' => 'required|string|max:255',
            'website_url' => 'nullable|string|max:500',
            'username' => 'required|string|max:255',
            'password' => 'required|string|max:1000',
            'assigned_user_ids' => 'required|array|min:1',
            'assigned_user_ids.*' => 'exists:users,id',
        ]);

        $credential->update([
            'website_name' => $request->website_name,
            'website_url' => $request->website_url,
            'username' => $request->username,
            'password' => $request->password,
        ]);

        $credential->assignedUsers()->sync($request->assigned_user_ids);

        return response()->json([
            'success' => true,
            'message' => 'Access credential updated successfully',
            'credential' => [
                'id' => $credential->id,
                'website_name' => $credential->website_name,
                'website_url' => $credential->website_url,
                'username' => $credential->username,
                'password' => $credential->password_decrypted,
                'assigned_users' => $credential->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ]);
    }

    /**
     * Delete an access credential for a task.
     */
    public function deleteAccessCredential(Task $task, \App\Models\TaskAccessCredential $credential)
    {
        if ($credential->task_id !== $task->id) {
            return response()->json(['success' => false, 'message' => 'Credential does not belong to this task'], 404);
        }

        $credential->delete();

        return response()->json([
            'success' => true,
            'message' => 'Access credential deleted successfully',
        ]);
    }

    /**
     * Get the list of statuses considered as pending/in-progress for filtering.
     *
     * @return array Array of status strings.
     */
    private function pendingTaskStatuses(): array
    {
        return ['pending', 'in_progress', 'In Progress', 'In-progress', 'planned', 'Planning', 'Planned', 'submitted', 'reopened', 'rejected'];
    }

    /**
     * Get the list of statuses that indicate a task is completed (for due-today exclusion).
     *
     * @return array Array of completed status strings.
     */
    private function incompleteDueTodayStatuses(): array
    {
        return ['approved', 'completed', 'done'];
    }

    /**
     * Apply a due-today filter to a query (tasks due today that are not yet completed).
     *
     * @param  Builder  $query  The query to filter.
     * @return Builder The filtered query.
     */
    private function applyDueTodayFilter($query, $userId = null)
    {
        return $query->where(function ($q) use ($userId) {
            if ($userId) {
                $q->whereRaw('DATE(COALESCE((SELECT pu.due_date FROM task_user pu WHERE pu.task_id = tasks.id AND pu.user_id = ? LIMIT 1), tasks.end_date)) = ?', [$userId, today()->toDateString()]);
            } else {
                $q->whereDate('end_date', today());
            }
        })->whereNotIn('status', $this->incompleteDueTodayStatuses());
    }
}
