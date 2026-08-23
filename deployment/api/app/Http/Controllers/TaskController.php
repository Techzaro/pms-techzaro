<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskAccessCredential;
use App\Models\TaskChange;
use App\Models\TaskDelegation;
use App\Models\TaskFile;
use App\Models\TaskPauseSession;
use App\Models\TaskSubmission;
use App\Models\TaskWorkflowEvent;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\DelegationService;
use App\Services\NotificationService;
use App\Services\RecurringService;
use App\Traits\HasStorageEnforcement;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Controller for managing tasks within projects.
 * Handles CRUD operations, status workflows (submit, approve, reject, reopen),
 * file/link management, deliverable progress tracking, and task reordering.
 * Supports both project-scoped and standalone tasks.
 */
class TaskController extends Controller
{
    use HasStorageEnforcement;
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService,
        private DelegationService $delegationService
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
        $isInProgressFilter = $request->input('status') === 'in_progress';
        $isPausedFilter = $request->input('status') === 'paused';
        $statusFilter = $request->input('status');
        $filters = $request->query();
        if ($isDueTodayFilter || $isPendingFilter || $isInProgressFilter || $isPausedFilter) {
            unset($filters['status']);
        }

        $tasksQuery = Task::where(function ($q) use ($user) {
            $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                ->orWhere('assigned_to', $user->id);
        })
            ->where(function ($q) use ($user) {
                $q->where('assigned_by', '!=', $user->id)
                    ->orWhere('current_owner', $user->id);
            });

        $tasksQuery->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role', 'currentOwner:id,name']);
        $tasksQuery = $this->applyQueryFiltersSortingPagination($request, $tasksQuery);
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

        $tasks->transform(function ($task) use ($dlvStats, $user) {
            $task->item_type = 'task';
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->pending_deliverables_count = $pending;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

            // Transferor flag for list views
            $isTransferor = false;
            $chain = $task->delegation_chain ?? [];
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $isTransferor = true;
                    break;
                }
            }
            $task->is_transferor = $isTransferor;
            $task->transferor_return_to_self = true;
            $task->transferor_has_approved = false;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferor_return_to_self = $entry['return_to_transferor'] ?? true;
                    break;
                }
            }
            $approvalChain = $task->approval_chain ?? [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                    $task->transferor_has_approved = true;
                    break;
                }
            }

            $task->current_owner_id = $task->current_owner;
            $task->current_owner_name = $task->currentOwner?->name;

            // Set transferred_by_name for the transferee
            $task->transferred_by_name = null;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferred_by_name = $entry['delegated_by_name'];
                }
            }

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
        $isInProgressFilter = $request->input('status') === 'in_progress';
        $isPausedFilter = $request->input('status') === 'paused';
        $filters = $request->query();
        if ($isPendingFilter || $isDueTodayFilter || $isInProgressFilter || $isPausedFilter) {
            unset($filters['status']);
        }

        $tasks = Task::where('assigned_by', $user->id)
            ->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                    ->orWhere('assigned_to', $user->id);
            })
            ->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $user->id))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isInProgressFilter, fn ($q) => $q->whereIn('status', $this->inProgressTaskStatuses()))
            ->when($isPausedFilter, fn ($q) => $q->whereIn('status', $this->pausedTaskStatuses()))
            ->with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role', 'currentOwner:id,name'])
            ->orderBy('sort_order')->latest('updated_at')
            ->filter($filters)
            ->limit(200)
            ->get();

        if ($user->role === 'guest') {
            $tasks = Task::whereHas('project', fn ($q) => $q->whereJsonContains('guest_ids', $user->id))
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

        $tasks->transform(function ($task) use ($dlvStats, $user) {
            $task->item_type = 'task';
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->pending_deliverables_count = $pending;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

            // Transferor flag for list views
            $isTransferor = false;
            $chain = $task->delegation_chain ?? [];
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $isTransferor = true;
                    break;
                }
            }
            $task->is_transferor = $isTransferor;
            $task->transferor_return_to_self = true;
            $task->transferor_has_approved = false;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferor_return_to_self = $entry['return_to_transferor'] ?? true;
                    break;
                }
            }
            $approvalChain = $task->approval_chain ?? [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                    $task->transferor_has_approved = true;
                    break;
                }
            }

            $task->current_owner_id = $task->current_owner;
            $task->current_owner_name = $task->currentOwner?->name;

            // Set transferred_by_name for the transferee
            $task->transferred_by_name = null;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferred_by_name = $entry['delegated_by_name'];
                }
            }

            // Check if any accepted delegation has return_to_transferor=false (Direct to OA)
            $task->has_direct_to_oa_delegation = false;
            $task->delegator_name = null;
            foreach ($chain as $entry) {
                if ($entry['status'] === 'accepted') {
                    $rt = $entry['return_to_transferor'] ?? true;
                    if ($rt === false || $rt === 0 || $rt === '0' || $rt === 'false') {
                        $task->has_direct_to_oa_delegation = true;
                        $task->delegator_name = $entry['delegated_by_name'] ?? null;
                        break;
                    }
                }
            }

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
        $isInProgressFilter = $request->input('status') === 'in_progress';
        $isPausedFilter = $request->input('status') === 'paused';

        $tasksQuery = Task::with(['project:id,title,team_id', 'assignees:id,name,email,role', 'assigner:id,name,email,role', 'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role', 'currentOwner:id,name']);

        if ($user->role === 'guest') {
            $tasksQuery->whereHas('project', fn ($q) => $q->whereJsonContains('guest_ids', $user->id));
        } else {
            $tasksQuery->where('assigned_by', $userId)
                ->where(function ($q) {
                    $q->whereColumn('assigned_by', '!=', 'assigned_to')->orWhereNull('assigned_to');
                });
        }

        $tasksQuery = $this->applyQueryFiltersSortingPagination($request, $tasksQuery);
        $tasks = $tasksQuery->get();

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

            // Check delegation chain for OA visibility
            $delegationChain = $task->delegation_chain ?? [];
            $latestDelegation = null;
            if (! empty($delegationChain)) {
                $latestDelegation = end($delegationChain);
            }
            $hasActiveDelegation = $latestDelegation && in_array($latestDelegation['status'], ['pending', 'accepted']);
            $delegationReturnToTransferor = $hasActiveDelegation ? ($latestDelegation['return_to_transferor'] ?? true) : true;

            $delegationTransfereeId = $hasActiveDelegation ? (int) $latestDelegation['delegated_to'] : null;
            $delegationTransferorId = $hasActiveDelegation ? (int) $latestDelegation['delegated_by'] : null;

            $assignees = $task->assignees->isEmpty() ? collect([null]) : $task->assignees;
            $rowCreated = false;
            foreach ($assignees as $assignee) {
                if ($assignee && (int) $assignee->id === (int) $task->assigned_by) {
                    continue;
                }
                if (! $assignee && (int) $task->assigned_to === (int) $task->assigned_by) {
                    continue;
                }
                if ($isDueTodayFilter && $assignee) {
                    $effectiveDueDate = ($assignee->pivot->due_date ?? null) ?: $task->end_date;
                    if (! $effectiveDueDate || Carbon::parse($effectiveDueDate)->toDateString() !== today()->toDateString()) {
                        continue;
                    }
                }
                // When delegation exists, show only the relevant assignee's row
                if ($delegationTransfereeId && $assignee) {
                    if ($delegationReturnToTransferor) {
                        // return_to_transferor=true → show the transferor
                        if ((int) $assignee->id !== $delegationTransferorId) {
                            continue;
                        }
                    } else {
                        // return_to_transferor=false → show the transferee
                        // If the transferee is not in the assignees list, skip and create virtual row later
                        if ((int) $assignee->id !== $delegationTransfereeId) {
                            continue;
                        }
                    }
                }

                $clone = clone $task;
                $clone->setRelation('assignees', $assignee ? collect([$assignee]) : collect());
                $clone->item_type = 'task';
                $clone->total_deliverables = $progress['total'];
                $clone->completed_deliverables = $progress['completed'];
                $clone->pending_deliverables_count = $progress['pending'];
                $clone->deliverables_progress = $progress['progress'];
                // Transferor flags
                $isTransferor = false;
                $chain = $task->delegation_chain ?? [];
                foreach ($chain as $entry) {
                    if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                        $isTransferor = true;
                        break;
                    }
                }
                $clone->is_transferor = $isTransferor;
                $clone->transferor_return_to_self = true;
                $clone->transferor_has_approved = false;
                foreach ($chain as $entry) {
                    if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                        $clone->transferor_return_to_self = $entry['return_to_transferor'] ?? true;
                        break;
                    }
                }
                $approvalChain = $task->approval_chain ?? [];
                foreach ($approvalChain as $aEntry) {
                    if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                        $clone->transferor_has_approved = true;
                        break;
                    }
                }
                // Set transferred_by_name for the transferee
                $clone->transferred_by_name = null;
                foreach ($chain as $entry) {
                    if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                        $clone->transferred_by_name = $entry['delegated_by_name'];
                    }
                }
                // Set delegation flags for OA view
                $clone->has_direct_to_oa_delegation = false;
                $clone->delegator_name = null;
                $clone->is_transferee = false;
                if ($hasActiveDelegation && ! $delegationReturnToTransferor) {
                    $clone->has_direct_to_oa_delegation = true;
                    $clone->delegator_name = $latestDelegation['delegated_by_name'] ?? null;
                    $clone->is_transferee = true;
                }
                $clone->current_owner_id = $task->current_owner;
                $clone->current_owner_name = $task->currentOwner?->name;
                $expandedTasks->push($clone);
                $rowCreated = true;
            }

            // If no row was created for Direct to OA delegation, create a virtual transferee row
            if (! $rowCreated && $hasActiveDelegation && ! $delegationReturnToTransferor) {
                $clone = clone $task;
                $clone->setRelation('assignees', collect());
                $clone->item_type = 'task';
                $clone->total_deliverables = $progress['total'];
                $clone->completed_deliverables = $progress['completed'];
                $clone->pending_deliverables_count = $progress['pending'];
                $clone->deliverables_progress = $progress['progress'];
                $clone->is_transferor = false;
                $clone->transferor_return_to_self = false;
                $clone->transferor_has_approved = false;
                $clone->transferred_by_name = null;
                $clone->has_direct_to_oa_delegation = true;
                $clone->delegator_name = $latestDelegation['delegated_by_name'] ?? null;
                $clone->is_transferee = true;
                $clone->current_owner_id = (int) $latestDelegation['delegated_to'];
                $clone->current_owner_name = $latestDelegation['delegated_to_name'] ?? null;
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
            'project:id,title,team_id,created_by,client_name,category,budget,priority,sidebar_notes,sheets_documents,website_link,website_name,status,start_date,end_date,guest_ids',
            'project.creator:id,name,email,role',
            'project.team:id,name,leader_id',
            'project.team.leader:id,name',
            'project.team.members:id,name,email,role',
            'project.milestones:id,project_id,title,due_date,status,sort_order',
            'project.files:id,project_id,name,url',
            'files:id,task_id,name,url',
            'assignees:id,name,email,role',
            'assigner:id,name,email,role',
            'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments', 'approvedBy:id,name', 'reopenedBy:id,name'])->latest(),
            'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments', 'approvedBy:id,name', 'reopenedBy:id,name']),
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
            'acknowledgedBy:id,name',
            'pausedBy:id,name',
            'assignerPausedBy:id,name',
            'currentOwner:id,name,email,role',
            'originalAssigner:id,name,email,role',
            'delegations' => fn ($q) => $q->with(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role'])->latest(),
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'changes' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'deliverableTemplates',
            'followers:id,name,email,avatar,role',
        ]);

        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees->contains('id', $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isProjectCreator = $task->project && (int) $task->project->created_by === (int) $user->id;
        $isTeamLeader = $task->project && $task->project->team && (int) $task->project->team->leader_id === (int) $user->id;
        $isTeamMember = $task->project && $task->project->team && $task->project->team->members && $task->project->team->members->contains('id', $user->id);
        $isGuestOfProject = $user->role === 'guest' && $task->project && $task->project->isAccessibleByGuest($user);
        $isGuestDeliverableAssignee = $user->role === 'guest' && \App\Models\Deliverable::where('task_id', $task->id)->where('assigned_to', $user->id)->exists();
        $isCurrentOwner = $task->current_owner && (int) $task->current_owner === (int) $user->id;

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager && ! $isProjectCreator && ! $isTeamLeader && ! $isTeamMember && ! $isGuestOfProject && ! $isGuestDeliverableAssignee && ! $isCurrentOwner) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Single query for deliverables with stats
        $deliverables = $task->deliverables()->when(! $isCreator && ! $isGuestOfProject, function ($q) use ($user) {
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
        $pendingStatuses = ['pending', 'in_progress', 'reopened', 'paused'];
        $pendingDeliverables = $dlvStats->pending ?? 0;
        $allDeliverablesSubmitted = (int) $pendingDeliverables === 0;

        $changes = $task->unviewedChanges->map(fn ($c) => [
            'id' => $c->id, 'field_name' => $c->field_name,
            'old_value' => $c->old_value, 'new_value' => $c->new_value,
            'modified_by' => $c->modifiedBy?->name ?? 'Unknown', 'created_at' => $c->created_at,
        ]);

        $payload = $task->toArray();

        // When return_to_transferor=true, only the transferor should see the transferee's submissions
        // The OA and other viewers should NOT see them until the transferor submits
        $delegationChain = $task->delegation_chain ?? [];
        if (is_string($delegationChain)) {
            $delegationChain = json_decode($delegationChain, true) ?? [];
        }
        if (! empty($delegationChain)) {
            $lastAccepted = null;
            foreach ($delegationChain as $entry) {
                if (strtolower($entry['status'] ?? '') === 'accepted') {
                    $lastAccepted = $entry;
                }
            }
            if ($lastAccepted && ($lastAccepted['return_to_transferor'] ?? true)) {
                $transferorId = (int) ($lastAccepted['delegated_by'] ?? 0);
                $transfereeId = (int) ($lastAccepted['delegated_to'] ?? 0);
                // Only transferor and transferee should see the transferee's submissions
                if ((int) $user->id !== $transferorId && (int) $user->id !== $transfereeId) {
                    $allSubmissions = $payload['submissions'] ?? [];
                    $payload['submissions'] = array_values(array_filter($allSubmissions, function ($s) use ($transfereeId) {
                        $sb = $s['submitted_by'] ?? null;
                        if (is_array($sb)) {
                            $sb = $sb['id'] ?? $sb['submitted_by'] ?? 0;
                        }
                        return (int) $sb !== $transfereeId;
                    }));
                    foreach (['latest_submission', 'latestSubmission'] as $key) {
                        $latestSub = $payload[$key] ?? null;
                        if ($latestSub) {
                            $sb = $latestSub['submitted_by'] ?? null;
                            if (is_array($sb)) {
                                $sb = $sb['id'] ?? $sb['submitted_by'] ?? 0;
                            }
                            if ((int) $sb === $transfereeId) {
                                $payload[$key] = null;
                            }
                        }
                    }
                }
            }
        }

        $payload['deliverables'] = $deliverables;
        $payload['deliverables_progress'] = (int) $dlvStats->total > 0 ? (int) round(((int) $dlvStats->completed / max((int) $dlvStats->total, 1)) * 100) : 0;
        $payload['total_deliverables'] = (int) $dlvStats->total;
        $payload['completed_deliverables'] = (int) $dlvStats->completed;
        $payload['pending_deliverables_count'] = (int) $dlvStats->pending;
        $payload['unviewed_changes'] = $changes;
        $payload['unviewed_changes_count'] = $task->unviewedChanges->count();
        $payload['is_creator'] = $isCreator;
        $payload['is_assignee'] = $isAssignee;
        $payload['assigner_paused'] = (bool) $task->assigner_paused;
        $payload['assigner_paused_at'] = $task->assigner_paused_at;
        $payload['can_edit'] = $isCreator && ! $isApproved;
        $userPivot = $isAssignee ? $task->assignees()->where('users.id', $user->id)->first()?->pivot : null;
        $payload['my_status'] = $userPivot?->status ?? 'pending';
        $payload['my_submitted_at'] = $userPivot?->submitted_at;
        $isCurrentOwner = $this->delegationService->isCurrentOwner($task, $user);
        $payload['is_current_owner'] = $isCurrentOwner;

        // Determine if the current user is a transferor
        $isTransferor = false;
        $transferorReturnToSelf = true;
        $transferorHasApproved = false;
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                $isTransferor = true;
                $transferorReturnToSelf = $entry['return_to_transferor'] ?? true;
                break;
            }
        }
        // Check approval_chain for this transferor
        $approvalChain = $task->approval_chain ?? [];
        foreach ($approvalChain as $aEntry) {
            if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                $transferorHasApproved = true;
                break;
            }
        }
        // Fallback: if approval_chain is empty/stale but the transferor is the current owner
        // and the task is in_progress after a submitted status, they must have approved
        if (! $transferorHasApproved && $isTransferor && $transferorReturnToSelf) {
            if ((int) ($task->current_owner ?? 0) === (int) $user->id && $task->status === 'in_progress') {
                $transferorHasApproved = true;
                // Also fix the approval_chain in DB for future requests
                if (empty($approvalChain)) {
                    $fixedChain = [];
                    foreach ($chain as $entry) {
                        if ((int) $entry['delegated_by'] === (int) $user->id && ($entry['return_to_transferor'] ?? true)) {
                            $fixedChain[] = [
                                'approver_id' => $entry['delegated_by'],
                                'approver_name' => $entry['delegated_by_name'] ?? null,
                                'level' => $entry['level'],
                                'status' => 'approved',
                                'approved_at' => now()->toISOString(),
                            ];
                        }
                    }
                    if (! empty($fixedChain)) {
                        $task->update(['approval_chain' => $fixedChain]);
                    }
                }
            }
        }
        $payload['is_transferor'] = $isTransferor;
        $payload['transferor_return_to_self'] = $transferorReturnToSelf;
        $payload['transferor_has_approved'] = $transferorHasApproved;

        $activeOutgoingDelegation = TaskDelegation::where('task_id', $task->id)
            ->where('delegated_by', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->first();
        $payload['active_outgoing_delegation'] = $activeOutgoingDelegation ? true : false;
        $payload['active_outgoing_delegation_id'] = $activeOutgoingDelegation?->id;
        $payload['can_revoke_delegation'] = $activeOutgoingDelegation && $activeOutgoingDelegation->status === 'pending';

        // Transferors: can_submit is false until they approve; after approval they can submit to OA
        $payload['can_submit'] = ($isAssignee || $isCurrentOwner) && in_array($task->status, ['in_progress', 'reopened', 'paused']) && $allDeliverablesSubmitted
            && ($userPivot?->status !== 'submitted');
        if ($isTransferor && ! $transferorHasApproved) {
            // Transferor hasn't approved yet — block submit
            $payload['can_submit'] = false;
            if (! $transferorReturnToSelf) {
                $payload['is_assignee'] = false;
            }
        }
        // Transferor has approved — force allow submit so they can forward to OA
        if ($isTransferor && $transferorHasApproved && $transferorReturnToSelf) {
            $payload['can_submit'] = true;
            $payload['is_assignee'] = true;
            $payload['is_current_owner'] = true;
            $payload['my_status'] = $payload['my_status'] === 'submitted' ? 'pending' : ($payload['my_status'] ?? 'pending');
        }
        $payload['can_delegate'] = ($isAssignee || $isCurrentOwner)
            && ! in_array($task->status, ['approved', 'rejected', 'submitted'])
            && $task->allow_transfer;
        if ($isTransferor) {
            $payload['can_delegate'] = false;
        }
        $payload['has_delegation_chain'] = ! empty($task->delegation_chain);
        $payload['delegation_chain'] = $task->delegation_chain ?? [];
        $payload['approval_chain'] = $task->approval_chain ?? [];
        $nextApprover = $this->delegationService->getNextApprover($task);
        $payload['next_approver_id'] = $nextApprover;
        $payload['is_next_approver'] = ($nextApprover && (int) $nextApprover === (int) $user->id)
            || ($nextApprover === null && !empty($task->delegation_chain) && (int) $task->assigned_by === (int) $user->id);
        $payload['pending_delegation'] = $task->pendingDelegations()->where('delegated_to', $user->id)->first();
        $payload['current_owner_name'] = $task->currentOwner?->name ?? $task->assignee?->name ?? null;
        $payload['original_assigner_name'] = $task->originalAssigner?->name ?? $task->assigner?->name ?? null;
        $payload['is_delegatee'] = $task->current_owner && (int) $task->current_owner === (int) $user->id
            && ($task->delegation_count > 0 || ! empty($task->delegation_chain));
        $payload['allow_transfer'] = $task->allow_transfer ?? true;

        $taskChangeMax = (int) TaskChange::where('task_id', $task->id)->max('id');
        $taskEventMax = (int) TaskWorkflowEvent::where('task_id', $task->id)->max('id');
        $payload['activity_max_id'] = max($taskChangeMax, $taskEventMax);

        $payload['timer'] = [
            'state' => $task->timer_state,
            'work_seconds' => $task->getCurrentWorkSeconds(),
            'work_formatted' => Task::formatDuration($task->getCurrentWorkSeconds()),
            'elapsed_seconds' => $task->getCurrentElapsedSeconds(),
            'elapsed_formatted' => Task::formatDuration($task->getCurrentElapsedSeconds()),
            'pause_count' => (int) ($task->pause_count ?? 0),
            'total_pause_seconds' => (int) ($task->total_pause_seconds ?? 0),
            'total_pause_formatted' => Task::formatDuration((int) ($task->total_pause_seconds ?? 0)),
            'resume_count' => (int) ($task->resume_count ?? 0),
            'work_started_at' => $task->work_started_at?->format('Y-m-d\TH:i:s'),
            'work_completed_at' => $task->work_completed_at?->format('Y-m-d\TH:i:s'),
            'last_timer_event_at' => $task->last_timer_event_at?->format('Y-m-d\TH:i:s'),
        ];

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
            'deliverables.*.start_date' => 'nullable|date',
            'deliverables.*.due_date' => 'nullable|date',
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
            'task_type' => 'nullable|in:standard,recurring',
            'recurrence_settings' => 'nullable|array|required_if:task_type,recurring',
            'recurrence_settings.repeat' => 'required_with:recurrence_settings|in:daily,weekly,monthly,custom',
            'recurrence_settings.skip_weekends' => 'nullable|boolean',
            'recurrence_start_date' => 'nullable|date',
            'recurrence_end_date' => 'nullable|date',
            'deliverable_templates' => 'nullable|array',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
            'allow_transfer' => 'nullable|boolean',
            'followers' => 'nullable|array',
            'followers.*' => 'exists:users,id',
        ]);

        if (! empty($validated['start_date']) && ! empty($validated['end_date'])) {
            if (Carbon::parse($validated['end_date'])->lt(Carbon::parse($validated['start_date']))) {
                throw ValidationException::withMessages([
                    'end_date' => ['Due date cannot be earlier than the start date.'],
                    'start_date' => ['Start date cannot be later than the due date.'],
                ]);
            }
        }

        if (($validated['task_type'] ?? 'standard') === 'recurring') {
            $recStart = $validated['recurrence_start_date'] ?? $validated['start_date'] ?? null;
            $recEnd = $validated['recurrence_end_date'] ?? $validated['end_date'] ?? null;

            if (empty($recStart) || empty($recEnd)) {
                throw ValidationException::withMessages([
                    'recurrence_end_date' => 'Both recurrence Start and End dates are required for recurring tasks.',
                ]);
            }
            if (Carbon::parse($recEnd)->lt(Carbon::parse($recStart))) {
                throw ValidationException::withMessages([
                    'recurrence_end_date' => 'Recurrence End date must be after or equal to the Start date.',
                ]);
            }

            $validated['recurrence_start_date'] = $recStart;
            $validated['recurrence_end_date'] = $recEnd;
            if (empty($validated['start_date'])) {
                $validated['start_date'] = $recStart;
            }
            if (empty($validated['end_date'])) {
                $validated['end_date'] = $recEnd;
            }

            if (empty($validated['deliverable_templates'])) {
                $validated['deliverable_templates'] = [
                    [
                        'title' => '{{number}} - Task Deliverable',
                        'description' => null,
                        'quantity' => 1,
                        'combined' => false,
                    ],
                ];
            }
        }

        // Validate task end_date does not exceed project end_date
        if (! empty($validated['end_date']) && $project->end_date) {
            $taskEnd = Carbon::parse($validated['end_date']);
            $projectEnd = Carbon::parse($project->end_date);
            if ($taskEnd->gt($projectEnd)) {
                throw ValidationException::withMessages([
                    'end_date' => 'Task deadline cannot exceed the project deadline ('.$projectEnd->format('d M Y h:i A').').',
                ]);
            }
        }

        // Validate deliverable due_date does not exceed task end_date
        if (! empty($validated['end_date']) && ! empty($validated['deliverables'])) {
            $endDateTime = Carbon::parse($validated['end_date']);
            foreach ($validated['deliverables'] as $index => $del) {
                if (! empty($del['due_date'])) {
                    $deliverableDateTime = Carbon::parse($del['due_date']);
                    if ($deliverableDateTime->gt($endDateTime)) {
                        throw ValidationException::withMessages([
                            "deliverables.{$index}.due_date" => 'Deliverable due date cannot exceed the task end date.',
                        ]);
                    }
                }
            }
        }

        // Validate that all assignees are members of the project
        $projectMemberIds = collect(app(ProjectController::class)
            ->getMembers($project)
            ->getData())
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->toArray();

        $invalidAssignees = array_diff(
            array_map('intval', $validated['assigned_to']),
            $projectMemberIds
        );

        if (! empty($invalidAssignees)) {
            throw ValidationException::withMessages([
                'assigned_to' => 'One or more selected users are not members of this project. Please select only project members.',
            ]);
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
                'recurrence_start_date' => $validated['recurrence_start_date'] ?? $validated['start_date'] ?? null,
                'recurrence_end_date' => $validated['recurrence_end_date'] ?? $validated['end_date'] ?? null,
                'allow_transfer' => $validated['allow_transfer'] ?? true,
            ]);
            $task->assignees()->sync([$userId => ['due_date' => $dueDates[$userId] ?? null]]);
            if (! empty($validated['followers'])) {
                $task->followers()->sync($validated['followers']);
            }

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
                        'start_date' => $del['start_date'] ?? null,
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
                    $taskStartDate = $validated['recurrence_start_date'] ?? $validated['start_date'] ?? now()->toDateTimeString();
                    $taskEndDate = $validated['recurrence_end_date'] ?? $validated['end_date'] ?? now()->addDays(30)->toDateTimeString();
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

        // Bulk notifications (Excluding self-notifications)
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
                    'message' => 'Task '.$task->business_id.' ('.$task->title.') has been assigned to you by '.$user->name.'.',
                    'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                ];
            }
        }
        if (!empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }

        // Send confirmation email to performer
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->notificationService->confirmAction($user, 'Assigned', 'task', $createdTasks[0]->title, [
            'Project' => $project->title,
            'Business ID' => $createdTasks[0]->business_id,
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
            'deliverables.*.start_date' => 'nullable|date',
            'deliverables.*.due_date' => 'nullable|date',
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
            'task_type' => 'nullable|in:standard,recurring',
            'recurrence_settings' => 'nullable|array|required_if:task_type,recurring',
            'recurrence_settings.repeat' => 'required_with:recurrence_settings|in:daily,weekly,monthly,custom',
            'recurrence_settings.skip_weekends' => 'nullable|boolean',
            'recurrence_start_date' => 'nullable|date',
            'recurrence_end_date' => 'nullable|date',
            'deliverable_templates' => 'nullable|array',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
            'allow_transfer' => 'nullable|boolean',
        ]);

        if (($validated['task_type'] ?? 'standard') === 'recurring') {
            $recStart = $validated['recurrence_start_date'] ?? $validated['start_date'] ?? null;
            $recEnd = $validated['recurrence_end_date'] ?? $validated['end_date'] ?? null;

            if (empty($recStart) || empty($recEnd)) {
                throw ValidationException::withMessages([
                    'recurrence_end_date' => 'Both recurrence Start and End dates are required for recurring tasks.',
                ]);
            }
            if (Carbon::parse($recEnd)->lt(Carbon::parse($recStart))) {
                throw ValidationException::withMessages([
                    'recurrence_end_date' => 'Recurrence End date must be after or equal to the Start date.',
                ]);
            }

            $validated['recurrence_start_date'] = $recStart;
            $validated['recurrence_end_date'] = $recEnd;
            if (empty($validated['start_date'])) {
                $validated['start_date'] = $recStart;
            }
            if (empty($validated['end_date'])) {
                $validated['end_date'] = $recEnd;
            }

            if (empty($validated['deliverable_templates'])) {
                $validated['deliverable_templates'] = [
                    [
                        'title' => '{{number}} - Task Deliverable',
                        'description' => null,
                        'quantity' => 1,
                        'combined' => false,
                    ],
                ];
            }
        }

        // Validate deliverable due_date does not exceed task end_date
        if (! empty($validated['end_date']) && ! empty($validated['deliverables'])) {
            $endDateTime = Carbon::parse($validated['end_date']);
            foreach ($validated['deliverables'] as $index => $del) {
                if (! empty($del['due_date'])) {
                    $deliverableDateTime = Carbon::parse($del['due_date']);
                    if ($deliverableDateTime->gt($endDateTime)) {
                        throw ValidationException::withMessages([
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
                'recurrence_start_date' => $validated['recurrence_start_date'] ?? $validated['start_date'] ?? null,
                'recurrence_end_date' => $validated['recurrence_end_date'] ?? $validated['end_date'] ?? null,
                'allow_transfer' => $validated['allow_transfer'] ?? true,
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
                        'start_date' => $del['start_date'] ?? null,
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
                    $taskStartDate = $validated['recurrence_start_date'] ?? $validated['start_date'] ?? now()->toDateTimeString();
                    $taskEndDate = $validated['recurrence_end_date'] ?? $validated['end_date'] ?? now()->addDays(30)->toDateTimeString();
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

        // Bulk notifications (Excluding self-notifications)
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
                    'message' => 'Task '.$task->business_id.' ('.$task->title.') has been assigned to you by '.$user->name.'.',
                    'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                ];
            }
        }
        if (!empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }

        // Send confirmation email to performer
        $taskCount = count($createdTasks);
        $assigneeNames = User::whereIn('id', $validated['assigned_to'])->pluck('name')->implode(', ');
        $this->notificationService->confirmAction($user, 'Assigned', 'task', $createdTasks[0]->title, [
            'Business ID' => $createdTasks[0]->business_id,
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

        // Decode JSON-encoded array fields if passed as strings
        foreach (['existing_file_names', 'deliverables', 'requirements', 'assigned_to', 'due_dates', 'followers'] as $field) {
            if (is_string($request->input($field))) {
                $decoded = json_decode($request->input($field), true);
                if (is_array($decoded)) {
                    $request->merge([$field => $decoded]);
                }
            }
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'requirements' => 'sometimes|nullable|array',
            'requirements.*' => 'required_with:requirements|string|max:500',
            'project_id' => 'sometimes|nullable|integer|exists:projects,id',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'priority' => 'sometimes|string|max:32',
            'status' => 'sometimes|string|max:64',
            'assigned_to' => 'sometimes|required|array|min:1',
            'assigned_to.*' => 'required|integer|exists:users,id',
            'followers' => 'nullable|array',
            'followers.*' => 'integer|exists:users,id',
            'deliverables' => 'nullable|array',
            'deliverables.*.id' => 'nullable|integer|exists:deliverables,id',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.start_date' => 'sometimes|nullable|date',
            'deliverables.*.due_date' => 'nullable|date',
            'deliverables.*.assigned_to' => 'nullable|exists:users,id',
            'existing_file_names' => 'nullable|array',
            'existing_file_names.*.id' => 'required_with:existing_file_names|exists:task_files,id',
            'existing_file_names.*.name' => 'nullable|string|max:255',
            'existing_file_names.*.url' => 'nullable|string|max:2048',
            'due_dates' => 'nullable|array',
            'due_dates.*' => 'nullable|date',
            'allow_transfer' => 'sometimes|boolean',
        ]);

        $assigneeIds = $validated['assigned_to'] ?? null;
        if ($request->has('assigned_to') && (empty($assigneeIds) || count($assigneeIds) === 0)) {
            throw ValidationException::withMessages([
                'assigned_to' => ['At least one assignee must be selected for this task.'],
            ]);
        }
        unset($validated['assigned_to']);
        $followers = $validated['followers'] ?? null;
        unset($validated['followers']);
        $dueDates = $validated['due_dates'] ?? null;
        unset($validated['due_dates']);
        $existingFileNames = $validated['existing_file_names'] ?? null;
        unset($validated['existing_file_names']);

        // Validate start_date is not later than end_date
        $startDateVal = $validated['start_date'] ?? $task->start_date;
        $endDateVal = $validated['end_date'] ?? $task->end_date;
        if (! empty($startDateVal) && ! empty($endDateVal)) {
            if (Carbon::parse($endDateVal)->lt(Carbon::parse($startDateVal))) {
                throw ValidationException::withMessages([
                    'end_date' => ['Due date cannot be earlier than the start date.'],
                    'start_date' => ['Start date cannot be later than the due date.'],
                ]);
            }
        }

        // Validate task end_date does not exceed project end_date
        if (! empty($validated['end_date']) && $task->project && $task->project->end_date) {
            $taskEnd = Carbon::parse($validated['end_date']);
            $projectEnd = Carbon::parse($task->project->end_date);
            if ($taskEnd->gt($projectEnd)) {
                throw ValidationException::withMessages([
                    'end_date' => 'Task deadline cannot exceed the project deadline ('.$projectEnd->format('d M Y h:i A').').',
                ]);
            }
        }

        $oldValues = [];
        foreach (['title', 'description', 'requirements', 'project_id', 'start_date', 'end_date', 'priority', 'status'] as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $task->{$f};
            }
        }

        $oldAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $validated['updated_by'] = $user->id;
        $task->update($validated);

        if ($request->has('followers')) {
            $task->followers()->sync($followers ?? []);
        }

        // Rename existing files/links if provided
        if ($existingFileNames) {
            foreach ($existingFileNames as $item) {
                $updateData = [];
                if (isset($item['name'])) {
                    $updateData['name'] = $item['name'];
                }
                if (isset($item['url'])) {
                    $updateData['url'] = $item['url'];
                }
                if (! empty($updateData)) {
                    TaskFile::where('id', $item['id'])
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
                    // Skip self-notification
                    if ((int) $newId === (int) $user->id) {
                        continue;
                    }
                    $newAssignNotifications[] = [
                        'user_id' => $newId, 'sender_user_id' => $user->id,
                        'type' => 'task_assigned', 'related_module' => 'task',
                        'related_id' => $task->id, 'title' => 'Task Assigned',
                        'message' => 'Task '.$task->business_id.' ('.$task->title.') has been assigned to you by '.$user->name.'.',
                        'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                    ];
                }
                if (! empty($newAssignNotifications)) {
                    $this->notificationService->createBulk($newAssignNotifications);
                }
            }
        } elseif (! empty($dueDates) && ! empty($assigneeIds)) {
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
                        'start_date' => $del['start_date'] ?? null,
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
                    'start_date' => $del['start_date'] ?? null,
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
                'Business ID' => $task->business_id,
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
            'recurrence_start_date' => 'nullable|date',
            'recurrence_end_date' => 'nullable|date|after_or_equal:recurrence_start_date',
            'deliverable_templates' => 'nullable|array|min:1',
            'deliverable_templates.*.title' => 'required_with:deliverable_templates|string|max:255',
            'deliverable_templates.*.description' => 'nullable|string|max:2000',
            'deliverable_templates.*.quantity' => 'nullable|integer|min:1|max:100',
            'deliverable_templates.*.combined' => 'nullable|boolean',
            'regenerate' => 'nullable|boolean',
        ]);

        if (isset($validated['recurrence_start_date']) && isset($validated['recurrence_end_date'])) {
            if (Carbon::parse($validated['recurrence_end_date'])->lt(Carbon::parse($validated['recurrence_start_date']))) {
                throw ValidationException::withMessages([
                    'recurrence_end_date' => 'Recurrence End date must be after or equal to the Start date.',
                ]);
            }
        }

        // Ensure task is marked as recurring
        $updateData = ['task_type' => 'recurring'];
        if (isset($validated['recurrence_settings'])) {
            $updateData['recurrence_settings'] = $validated['recurrence_settings'];
        }
        if (array_key_exists('recurrence_start_date', $validated)) {
            $updateData['recurrence_start_date'] = $validated['recurrence_start_date'];
        }
        if (array_key_exists('recurrence_end_date', $validated)) {
            $updateData['recurrence_end_date'] = $validated['recurrence_end_date'];
        }
        $task->update($updateData);

        // Update templates
        if (! empty($validated['deliverable_templates'])) {
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
        if (!empty($validated['regenerate'])) {
            $today = now()->startOfDay();

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
                array_map(fn ($t) => (int) ($t['quantity'] ?? 1), $validated['deliverable_templates'] ?? $task->deliverableTemplates()->get()->toArray())
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
     * Delete active recurrence rule for a task.
     * Terminates recurrence, deletes uncompleted future deliverables, and preserves past completed deliverables.
     */
    public function deleteRecurring(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($task->task_type !== 'recurring') {
            return response()->json(['success' => false, 'message' => 'Task is not a recurring task.'], 422);
        }

        $recurrenceEnd = $task->recurrence_end_date ?? $task->end_date;
        if ($recurrenceEnd && Carbon::parse($recurrenceEnd)->isPast()) {
            return response()->json(['success' => false, 'message' => 'Recurrence series has already expired.'], 422);
        }

        // Find non-completed deliverables
        $pendingDeliverables = $task->deliverables()
            ->where('status', '!=', 'approved')
            ->get();

        $deletedCount = $pendingDeliverables->count();

        $pendingDeliverables->each(function ($dlv) {
            $dlv->submissions()->delete();
            $dlv->workflowEvents()->delete();
            $dlv->changes()->delete();
            $dlv->delete();
        });

        $task->update([
            'task_type' => 'standard',
            'recurrence_settings' => null,
            'recurrence_start_date' => null,
            'recurrence_end_date' => null,
            'recurrence_status' => 'cancelled',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'recurrence_deleted',
            'comment' => 'Recurrence series deleted. ' . $deletedCount . ' pending future deliverable(s) removed.',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Recurrence rule deleted successfully.',
            'deleted_pending_count' => $deletedCount,
            'task' => $task->fresh(),
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

            if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
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
    public function timer(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isCreator && ! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        return response()->json([
            'success' => true,
            'timer' => [
                'state' => $task->timer_state,
                'work_seconds' => $task->getCurrentWorkSeconds(),
                'work_formatted' => Task::formatDuration($task->getCurrentWorkSeconds()),
                'elapsed_seconds' => $task->getCurrentElapsedSeconds(),
                'elapsed_formatted' => Task::formatDuration($task->getCurrentElapsedSeconds()),
                'pause_count' => (int) ($task->pause_count ?? 0),
                'total_pause_seconds' => (int) ($task->total_pause_seconds ?? 0),
                'total_pause_formatted' => Task::formatDuration((int) ($task->total_pause_seconds ?? 0)),
                'resume_count' => (int) ($task->resume_count ?? 0),
                'work_started_at' => $task->work_started_at?->format('Y-m-d\TH:i:s'),
                'work_completed_at' => $task->work_completed_at?->format('Y-m-d\TH:i:s'),
                'last_timer_event_at' => $task->last_timer_event_at?->format('Y-m-d\TH:i:s'),
            ],
        ]);
    }

    public function timerSessions(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

        if (! $isCreator && ! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $sessions = TaskPauseSession::where('task_id', $task->id)
            ->with('user:id,name')
            ->orderByDesc('paused_at')
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'user' => $s->user?->name,
                'reason' => $s->reason,
                'reason_detail' => $s->reason_detail,
                'reason_label' => $s->reason_label,
                'paused_at' => $s->paused_at?->format('Y-m-d\TH:i:s'),
                'resumed_at' => $s->resumed_at?->format('Y-m-d\TH:i:s'),
                'duration_seconds' => $s->duration_seconds ?? 0,
                'duration_formatted' => $s->formatted_duration,
                'is_auto_paused' => (bool) $s->is_auto_paused,
            ]);

        return response()->json(['success' => true, 'sessions' => $sessions]);
    }

    public function acknowledge(Request $request, Task $task)
    {
        $user = $request->user();
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists()
            || (int) $task->assigned_to === (int) $user->id
            || in_array($user->role, ['admin', 'manager']);

        if (! $isAssignee) {
            return response()->json(['success' => false, 'message' => 'Only assignees can acknowledge this task'], 403);
        }

        if ($task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is paused by the assigner and cannot be acknowledged'], 422);
        }

        $currentStatus = strtolower((string) $task->status);

        if ($currentStatus === 'in_progress') {
            return response()->json([
                'success' => true,
                'message' => 'Task is already in progress',
                'task' => $task,
            ]);
        }

        if (! in_array($currentStatus, ['pending', 'not_started', 'assigned', 'reopened'])) {
            return response()->json(['success' => false, 'message' => "This task cannot be acknowledged in its current status ({$task->status})"], 422);
        }

        $task->update([
            'status' => 'in_progress',
            'acknowledged_at' => now(),
            'acknowledged_by' => $user->id,
        ]);

        $task->startTimer();

        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'in_progress',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'acknowledged',
            'comment' => $user->name.' acknowledged this task',
        ]);

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'timer_started',
            'comment' => 'Work timer started',
        ]);

        $task->load('project:id,title');

        // Notify the task creator (Excluding self-notification)
        if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_acknowledged',
                'task',
                $task->id,
                'Task Acknowledged & Work Started',
                $user->name.' acknowledged task "'.$task->title.'" and started working.',
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'acknowledgedBy:id,name'])->toArray()),
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
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists() || (int) $task->assigned_to === (int) $user->id;
        $isCreator = (int) ($task->assigned_by ?? 0) === (int) $user->id || (int) ($task->created_by ?? 0) === (int) $user->id;
        $isAuthorized = $isAssignee || $isCreator || in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isAuthorized) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to pause/resume this task.'], 403);
        }

        if ($request->input('reason') === 'auto_paused') {
            return response()->json(['success' => false, 'message' => 'Automatic pausing due to inactivity is disabled.'], 422);
        }

        if ($task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is paused by the assigner and cannot be paused'], 422);
        }

        if (! in_array(strtolower((string) $task->status), ['in_progress', 'submitted'])) {
            return response()->json(['success' => false, 'message' => 'This task cannot be paused in its current status'], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:64',
            'reason_detail' => 'nullable|string|max:500',
        ]);

        $task->update([
            'status' => 'paused',
            'paused_at' => now(),
            'paused_by' => $user->id,
        ]);

        $task->pauseTimer($validated['reason'], $validated['reason_detail'] ?? null, false, $user->id);

        if ($isAssignee) {
            $task->assignees()->updateExistingPivot($user->id, [
                'status' => 'paused',
            ]);
        }

        $reasonLabel = Task::pauseReasons()[$validated['reason']] ?? $validated['reason'];

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'paused',
            'comment' => $user->name.' paused this task — Reason: '.$reasonLabel.($validated['reason_detail'] ? ' ('.$validated['reason_detail'].')' : ''),
        ]);

        $task->load('project:id,title');

        if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
            $this->notificationService->notify(
                $task->assigned_by,
                $user->id,
                'task_paused',
                'task',
                $task->id,
                'Task Paused',
                $user->name.' paused task "'.$task->title.'" — Reason: '.$reasonLabel,
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'pausedBy:id,name'])->toArray()),
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
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists() || (int) $task->assigned_to === (int) $user->id;
        $isAuthorized = $isAssignee || in_array($user->role, ['admin', 'manager']);

        if (! $isAuthorized) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to pause/resume this task.'], 403);
        }

        if ($task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is paused by the assigner and cannot be continued'], 422);
        }

        if (strtolower((string) $task->status) !== 'paused') {
            return response()->json(['success' => false, 'message' => 'This task is not paused'], 422);
        }

        $task->update([
            'status' => 'in_progress',
            'paused_at' => null,
            'paused_by' => null,
        ]);

        $task->resumeTimer($user->id);

        if ($isAssignee) {
            $task->assignees()->updateExistingPivot($user->id, [
                'status' => 'in_progress',
            ]);
        }

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'continued',
            'comment' => $user->name.' resumed this task',
        ]);

        $task->load('project:id,title');

        // Notify the task creator (Excluding self-notification)
        if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role'])->toArray()),
        ]);
    }

    /**
     * Pause a task as the assigner (task creator).
     *
     * Puts the task on hold so the assignee cannot perform any workflow actions.
     * Only the task creator can use this. The task status is NOT changed;
     * an assigner_paused flag is set instead.
     */
    public function assignerPause(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) ($task->assigned_by ?? 0) === (int) $user->id || (int) ($task->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Only the task creator or admin/manager can pause this task'], 403);
        }

        if ($task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is already paused by the assigner'], 422);
        }

        $activeStatuses = ['pending', 'in_progress', 'reopened', 'paused', 'submitted'];
        if (! in_array(strtolower((string) $task->status), $activeStatuses)) {
            return response()->json(['success' => false, 'message' => 'This task cannot be paused in its current status'], 422);
        }

        $previousStatus = $task->status;

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $task->update([
            'assigner_paused' => true,
            'assigner_paused_at' => now(),
            'assigner_paused_by' => $user->id,
        ]);

        if ($task->timer_state === 'running') {
            $task->pauseTimer('other', $validated['reason'], false, $user->id);
        } elseif ($task->timer_state === 'paused') {
            $task->update([
                'pause_count' => ($task->pause_count ?? 0) + 1,
            ]);

            TaskPauseSession::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'reason' => 'other',
                'reason_detail' => 'On Hold: '.$validated['reason'],
                'paused_at' => now(),
                'is_auto_paused' => false,
            ]);
        }

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'assigner_paused',
            'comment' => $user->name.' placed this task on hold — Reason: '.$validated['reason'],
        ]);

        $task->load('project:id,title');

        // Notify all assignees (Excluding self-notification)
        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id),
            $user->id,
            'task_assigner_paused',
            'task',
            $task->id,
            'Task Paused by Assigner',
            $user->name.' paused task "'.$task->title.'" — you cannot perform any actions until it is resumed.',
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        $this->notificationService->confirmAction($user, 'Paused', 'task', $task->title);

        $this->activityService->log($user->id, 'task_assigner_paused', 'You paused task "'.$task->title.'"', 'task', $task->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'assigner_pause',
                description: 'Assigner paused task '.$task->title,
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $this->clearDashboardCache($user->id);

        foreach ($assigneeIds as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Task paused by assigner',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assignerPausedBy:id,name'])->toArray()),
        ]);
    }

    /**
     * Resume a task paused by the assigner (task creator).
     *
     * Resumes the task so the assignee can continue workflow actions.
     * Only the task creator can use this.
     */
    public function assignerResume(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) ($task->assigned_by ?? 0) === (int) $user->id || (int) ($task->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Only the task creator or admin/manager can resume this task'], 403);
        }

        if (! $task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is not paused by the assigner'], 422);
        }

        $task->update([
            'assigner_paused' => false,
            'assigner_paused_at' => null,
            'assigner_paused_by' => null,
        ]);

        $timerResumed = false;
        if ($task->timer_state === 'paused' && strtolower((string) $task->status) === 'in_progress') {
            $task->resumeTimer($user->id);
            $timerResumed = true;
        } elseif ($task->timer_state === 'paused') {
            $openSession = $task->pauseSessions()->whereNull('resumed_at')->latest()->first();
            if ($openSession && $openSession->is_auto_paused === false) {
                $duration = max(0, abs((int) now()->diffInSeconds($openSession->paused_at)));
                $openSession->update([
                    'resumed_at' => now(),
                    'duration_seconds' => $duration,
                    'resumed_by' => $user->id,
                ]);
                $task->update([
                    'total_pause_seconds' => ($task->total_pause_seconds ?? 0) + $duration,
                ]);
            }
        }

        TaskWorkflowEvent::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'action' => 'assigner_resumed',
            'comment' => $user->name.' resumed this task from hold'.($timerResumed ? ' — timer resumed' : ' — task remains paused'),
        ]);

        $task->load('project:id,title');

        // Notify all assignees (Excluding self-notification)
        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id),
            $user->id,
            'task_assigner_resumed',
            'task',
            $task->id,
            'Task Resumed by Assigner',
            $user->name.' resumed task "'.$task->title.'" — you can continue working on it.',
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        $this->notificationService->confirmAction($user, 'Resumed', 'task', $task->title);

        $this->activityService->log($user->id, 'task_assigner_resumed', 'You resumed task "'.$task->title.'"', 'task', $task->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'assigner_resume',
                description: 'Assigner resumed task '.$task->title,
                user: $user,
                entityType: 'Task',
                entityId: $task->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $this->clearDashboardCache($user->id);

        foreach ($assigneeIds as $assigneeId) {
            if ((int) $assigneeId !== (int) $user->id) {
                $this->clearDashboardCache((int) $assigneeId);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Task resumed by assigner',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assignerPausedBy:id,name'])->toArray()),
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
        $isCurrentOwner = $this->delegationService->isCurrentOwner($task, $user);

        if (! $isAssignee && ! $isCurrentOwner) {
            return response()->json(['success' => false, 'message' => 'Only the assignee or current owner can submit this task'], 403);
        }

        // Transferors cannot submit unless they've approved (return_to_transferor flow)
        $chain = $task->delegation_chain ?? [];
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                $approvalChain = $task->approval_chain ?? [];
                $transferorApproved = false;
                foreach ($approvalChain as $aEntry) {
                    if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                        $transferorApproved = true;
                        break;
                    }
                }
                if (! $transferorApproved) {
                    return response()->json(['success' => false, 'message' => 'Transferors cannot submit this task'], 403);
                }
                break;
            }
        }

        if ($task->assigner_paused) {
            return response()->json(['success' => false, 'message' => 'This task is paused by the assigner and cannot be submitted'], 422);
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
            'version_number' => ($task->submission_count ?? 0) + 1,
            'status' => 'pending',
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

        // Increment submission count
        $task->increment('submission_count');

        $task->stopTimer();

        $finalWorkSeconds = $task->fresh()->total_work_seconds;
        $formattedDuration = Task::formatDuration($finalWorkSeconds);

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id,
            'action' => 'timer_stopped',
            'comment' => 'Final work duration: '.$formattedDuration,
        ]);

        // Update the submitting user's pivot status for per-user tracking
        $task->assignees()->updateExistingPivot($user->id, [
            'status' => 'submitted',
            'submitted_at' => now(),
        ]);

        $task->load('project:id,title');

        // Determine who to notify about the submission
        $notifyUserId = null;
        $chain = $task->delegation_chain ?? [];
        $isTransferor = false;

        // Check if this user is the transferor (delegated_by in an accepted delegation)
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                $isTransferor = true;
                break;
            }
        }

        if ($isTransferor) {
            // Transferor is submitting → notify original assigner
            if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
                $notifyUserId = $task->assigned_by;
            }
        } elseif (! empty($chain)) {
            // Transferee is submitting → find the transferor (delegated_by of last accepted entry)
            $lastAccepted = null;
            foreach ($chain as $entry) {
                if ($entry['status'] === 'accepted') {
                    $lastAccepted = $entry;
                }
            }
            if ($lastAccepted) {
                $returnToTransferor = $lastAccepted['return_to_transferor'] ?? true;
                if ($returnToTransferor) {
                    // Notify the transferor only
                    $notifyUserId = (int) $lastAccepted['delegated_by'];
                } else {
                    // No return_to_transferor → notify original assigner
                    $notifyUserId = $task->assigned_by;
                }
            }
        } else {
            // No delegation chain → notify original assigner
            if ($task->assigned_by && (int) $task->assigned_by !== (int) $user->id) {
                $notifyUserId = $task->assigned_by;
            }
        }

        if ($notifyUserId && (int) $notifyUserId !== (int) $user->id) {
            $this->notificationService->notify(
                $notifyUserId,
                $user->id,
                'task_submitted',
                'task',
                $task->id,
                'Task Submitted',
                $user->name.' has completed task '.$task->business_id.' ("'.$task->title.'") and submitted it for review.',
                '/tasks/task-details/'.$task->id.'?from=taskby'
            );
        }

        // Send confirmation email to performer
        $submittedToName = User::find($notifyUserId)?->name ?? 'N/A';
        $this->notificationService->confirmAction($user, $isResubmit ? 'Resubmitted' : 'Submitted', 'task', $task->title, [
            'Business ID' => $task->business_id,
            'Project' => $task->project?->title ?? 'N/A',
            'Submitted To' => $submittedToName,
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
            'task' => $this->taskWithTimer($task->fresh()->load([
                'assignees:id,name,email,role', 'assigner:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
            ])->toArray()),
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
        $isDelegationChain = $this->delegationService->isInDelegationChain($task, $user);
        $nextApprover = $this->delegationService->getNextApprover($task);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;

        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        if (! $isCreator && ! $isAdminOrManager && ! $isDelegationChain && ! $isNextApprover) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($task->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted tasks'], 422);
        }

        // Check if user is a transferor (next_approver from delegation chain with return_to_transferor=true)
        $isNextApproverTransferor = $isNextApprover && ! $isCreator && ! $isAdminOrManager;
        $approvalChain = $task->approval_chain ?? [];
        if ($isNextApproverTransferor) {
            // Mark this transferor as approved in the approval_chain, then set task back to the transferor for submission to OA
            // If approval_chain is empty (legacy data), rebuild it from the delegation chain first
            if (empty($approvalChain)) {
                $approvalChain = $this->delegationService->rebuildApprovalChain($task);
            }
            $updatedApprovalChain = [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id) {
                    $aEntry['status'] = 'approved';
                    $aEntry['approved_at'] = now()->toISOString();
                }
                $updatedApprovalChain[] = $aEntry;
            }

            // Find the delegatee from the delegation chain
            $delegateeId = null;
            $delegateeName = null;
            $chain = $task->delegation_chain ?? [];
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $delegateeId = (int) $entry['delegated_to'];
                    $delegateeName = $entry['delegated_to_name'] ?? null;
                    break;
                }
            }

            $task->update([
                'approval_chain' => $updatedApprovalChain,
                'status' => 'in_progress',
                'current_owner' => $user->id,
                'updated_by' => $user->id,
            ]);

            // Reset transferor's pivot status so they can submit to the original assigner
            $task->assignees()->updateExistingPivot($user->id, [
                'status' => 'pending',
                'submitted_at' => null,
            ]);

            // Notify the transferor that they can now submit to OA (Excluding self-notification)
            if ((int) $user->id !== (int) $user->id) {
                // Self check ensures transferor doesn't spam themselves
            } else {
                // Handled via self-check design
            }

            TaskWorkflowEvent::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'action' => 'transferor_approved',
                'comment' => $user->name.' (transferor) approved the submission. Task is now with the transferor ready to forward to original assigner.',
            ]);

            $this->activityService->log($user->id, 'task_transferor_approved', 'You approved the delegated task "'.$task->title.'" – you can now submit it to the original assigner', 'task', $task->id);

            $task->fresh();

            $taskData = $this->taskWithTimer($task->load(['assignees:id,name,email,role', 'assigner:id,name', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ])->toArray());
            $taskData['transferor_has_approved'] = true;
            $taskData['is_assignee'] = true;
            $taskData['is_current_owner'] = true;
            $taskData['my_status'] = 'pending';
            $taskData['can_submit'] = true;
            $taskData['active_outgoing_delegation'] = false;
            $taskData['active_outgoing_delegation_id'] = null;
            $taskData['can_delegate'] = false;
            $taskData['status'] = 'in_progress';

            return response()->json([
                'success' => true,
                'message' => 'Approved – you can now submit to the original assigner',
                'task' => $taskData,
            ]);
        }

        $task->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id, 'updated_by' => $user->id]);

        // Mark the latest submission as approved
        $latestSubmission = TaskSubmission::where('task_id', $task->id)->latest()->first();
        if ($latestSubmission) {
            $latestSubmission->update([
                'status' => 'approved',
                'approved_by' => $user->id,
                'approved_at' => now(),
            ]);
        }

        TaskWorkflowEvent::create(['task_id' => $task->id, 'user_id' => $user->id, 'action' => 'approved']);

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $this->notificationService->notifyMultiple(
            array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id),
            $user->id,
            'task_approved',
            'task',
            $task->id,
            'Task Approved',
            'Your task '.$task->business_id.' ("'.$task->title.'") has been approved.',
            '/tasks/task-details/'.$task->id.'?from=tasks'
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Approved', 'task', $task->title, [
            'Business ID' => $task->business_id,
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ])->toArray()),
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
        $isDelegationChain = $this->delegationService->isInDelegationChain($task, $user);
        $nextApprover = $this->delegationService->getNextApprover($task);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager']) && ! $isDelegationChain && ! $isNextApprover) {
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
        $rejectMsg = 'Your task '.$task->business_id.' ("'.$task->title.'") has been rejected. Please make the required changes.';
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
            'Business ID' => $task->business_id,
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ])->toArray()),
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
        $isDelegationChain = $this->delegationService->isInDelegationChain($task, $user);

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager']) && ! $isDelegationChain) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (! in_array($task->status, ['submitted', 'approved'])) {
            return response()->json(['success' => false, 'message' => 'Can only reopen submitted or approved tasks'], 422);
        }

        $validated = $request->validate([
            'reopen_reason' => 'required|string|max:500',
            'reopen_reason_detail' => 'nullable|string|max:2000',
            'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date',
            'link' => 'nullable|string|max:2000',
            'files' => 'nullable|array',
            'files.*' => 'nullable|file|max:51200',
            'file' => 'nullable|file|max:51200',
        ]);

        $filePaths = [];
        $fileNames = [];
        $uploadedFiles = [];
        if ($request->hasFile('files')) {
            $uploadedFiles = $request->file('files');
        } elseif ($request->hasFile('file')) {
            $uploadedFiles = [$request->file('file')];
        }

        foreach ($uploadedFiles as $uploadedFile) {
            if ($uploadedFile && $uploadedFile->isValid()) {
                $fileNames[] = $uploadedFile->getClientOriginalName();
                $filePaths[] = $uploadedFile->store('task-reopen/'.$task->id, 'public');
            }
        }

        $filePath = ! empty($filePaths) ? implode(',', $filePaths) : null;
        $fileName = ! empty($fileNames) ? implode(', ', $fileNames) : null;

        $reopenReason = $validated['reopen_reason'] === 'Other'
            ? ($validated['reopen_reason_detail'] ?? 'Other')
            : $validated['reopen_reason'];

        $reopenComment = $reopenReason;
        if (! empty($validated['reopen_reason_detail']) && $validated['reopen_reason'] !== 'Other') {
            $reopenComment .= ': '.$validated['reopen_reason_detail'];
        }

        $updateData = [
            'status' => 'reopened', 'reopened_at' => now(), 'reopened_by' => $user->id,
            'reopen_comment' => $reopenComment,
            'reopen_reason' => $validated['reopen_reason'],
            'reopen_instructions' => $validated['instructions'] ?? null,
            'reopen_link' => $validated['link'] ?? null,
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

        // Increment reopen count
        $task->increment('reopen_count');

        // Update latest submission if reopening from approved
        if ($task->status === 'reopened' && $task->submitted_at) {
            $latestSubmission = TaskSubmission::where('task_id', $task->id)->latest()->first();
            if ($latestSubmission && $latestSubmission->status !== 'reopened') {
                $latestSubmission->update([
                    'status' => 'reopened',
                    'reopened_by' => $user->id,
                    'reopened_at' => now(),
                    'reopen_reason' => $reopenComment,
                ]);
            }
        }

        TaskWorkflowEvent::create([
            'task_id' => $task->id, 'user_id' => $user->id, 'action' => 'reopened',
            'comment' => $reopenComment, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $reopenReasonText = $validated['reopen_reason'];
        if (! empty($validated['reopen_reason_detail']) && $validated['reopen_reason'] !== 'Other') {
            $reopenReasonText .= ': '.$validated['reopen_reason_detail'];
        }

        $assigneeIds = $task->assignees()->pluck('users.id')->toArray();
        $assigneeIds = array_values(array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $user->id));
        $reopenMsg = 'Your task '.$task->business_id.' ("'.$task->title.'") has been reopened. Reason: '.$reopenReasonText;
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
            'Business ID' => $task->business_id,
            'Project' => $task->project?->title ?? 'N/A',
            'Assigned To' => $task->assignees->pluck('name')->implode(', '),
            'Reason' => $reopenReasonText,
            'Instructions' => $validated['instructions'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'task_reopened', 'You reopened task "'.$task->title.'". Reason: '.$reopenReasonText, 'task', $task->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'task_management',
                action: 'reopen',
                description: "Reopened task {$task->title}. Reason: {$reopenReasonText}",
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
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'approvedBy:id,name', 'reopenedBy:id,name'])->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            ])->toArray()),
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
        if ($user) {
            $task = $submission->task;
            $isCreator = (int) ($task->assigned_by ?? 0) === (int) $user->id;
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();

            if (! $isCreator && ! $isAssignee && ! in_array($user->role, ['admin', 'manager'])) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        if (! $submission->file_path) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        $resolved = \App\Services\FileStorageService::resolveFile($submission->file_path);
        if (! $resolved) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        $fileName = $submission->file_name ?: basename($resolved['path']);

        return Storage::disk($resolved['disk'])->download($resolved['path'], $fileName);
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
        $isCreator = (int) ($task->assigned_by ?? 0) === (int) $user->id || (int) ($task->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the task creator or admin/manager can delete'], 403);
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

        $storageCheck = $this->checkStorageLimit($request, $file);
        if ($storageCheck && !$storageCheck['allowed']) {
            return response()->json(['success' => false, 'message' => $storageCheck['message']], 422);
        }

        $path = $file->store('task-files/'.$task->id, 'public');
        $this->trackFileUpload($request, 'attachments', '/storage/'.$path, $file->getClientOriginalName(), $file->getMimeType(), $file->getSize());

        $customName = $request->input('name') ?: $file->getClientOriginalName();
        $nextOrder = $task->files()->max('sort_order') + 1;
        $fileRecord = $task->files()->create(['name' => $customName, 'url' => '/storage/'.$path, 'sort_order' => $nextOrder]);

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
        $nextOrder = $task->files()->max('sort_order') + 1;
        $fileRecord = $task->files()->create(['name' => $linkName, 'url' => $validated['url'], 'sort_order' => $nextOrder]);

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
     * @param  Task  $task  The task the file belongs to.
     * @param  TaskFile  $file  The file to rename.
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
        if ($task->assigned_to && ! in_array($task->assigned_to, $assigneeIds)) {
            $assigneeIds[] = $task->assigned_to;
        }

        $changeLabels = array_map(fn ($c) => $c['label'] ?? ucwords(str_replace('_', ' ', $c['field_name'])), $changes);
        $summary = count($changeLabels) > 0
            ? implode(', ', array_slice($changeLabels, 0, 4)).(count($changeLabels) > 4 ? ' and '.(count($changeLabels) - 4).' more' : '')
            : 'details';

        $msg = $updater->name.' updated task "'.$task->title.'" — changed: '.$summary.'.';

        $eventData = [
            'user_id' => $task->assigned_to ?? ($assigneeIds[0] ?? $updater->id),
            'sender_user_id' => $updater->id,
            'type' => 'task_updated',
            'related_module' => 'task',
            'related_id' => $task->id,
            'title' => 'Task Updated',
            'message' => $msg,
            'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
        ];

        // Dispatch webhooks for the performer/updater if webhooks are configured on their account
        if (! empty($updater->slack_webhook_url) || ! empty($updater->google_chat_webhook_url) || ! empty($updater->ms_teams_webhook_url)) {
            $this->notificationService->dispatchWebhooks($updater, $eventData);
        }

        $notifications = [];
        foreach (array_filter($assigneeIds, fn ($id) => (int) $id !== (int) $updater->id) as $assigneeId) {
            $notifications[] = array_merge($eventData, ['user_id' => $assigneeId]);
        }

        if (! empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }
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

        if (! $isCreator && ! $isAssignee) {
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
                    'assigned_users' => $cred->assignedUsers->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]),
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
                'assigned_users' => $credential->assignedUsers->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ], 201);
    }

    /**
     * Update an access credential for a task.
     */
    public function updateAccessCredential(Request $request, Task $task, TaskAccessCredential $credential)
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
                'assigned_users' => $credential->assignedUsers->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ]);
    }

    /**
     * Delete an access credential for a task.
     */
    public function deleteAccessCredential(Task $task, TaskAccessCredential $credential)
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
     * Get all tasks visible to the authenticated user based on role-based visibility.
     *
     * Admin: Sees all tasks in the company.
     * Manager: Sees tasks within their team scope (teams they are member of or lead).
     * Team Lead: Sees tasks within their team scope (teams they lead or are member of).
     * Member: Sees tasks they are directly involved in (assigned to, assigned by, or as assignee).
     *
     * This is a read-only endpoint — no actions are permitted.
     *
     * @param  Request  $request  Query parameters: status, search, time_filter.
     * @return JsonResponse JSON response with filtered tasks.
     */
    public function allTasks(Request $request)
    {
        $user = $request->user();
        $role = $user->role;

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $isInProgressFilter = $request->input('status') === 'in_progress';
        $isPausedFilter = $request->input('status') === 'paused';
        $statusFilter = $request->input('status');
        $search = $request->input('search');
        $timeFilter = $request->input('time_filter');

        $tasksQuery = Task::query();

        // ── Role-based visibility ──
        switch ($role) {
            case 'admin':
                // Admin sees everything — no scope filter
                break;

            case 'manager':
                // Manager sees tasks where any participant (creator or assignee) is in the same team(s)
                $teamIds = $user->teams()->pluck('teams.id');
                $ledTeamIds = $user->ledTeams()->pluck('teams.id');
                $allTeamIds = $teamIds->merge($ledTeamIds)->unique();

                if ($allTeamIds->isNotEmpty()) {
                    $scopeUserIds = DB::table('team_user')
                        ->whereIn('team_id', $allTeamIds)
                        ->pluck('user_id')
                        ->push($user->id)
                        ->unique();

                    $tasksQuery->where(function ($q) use ($scopeUserIds) {
                        $q->whereIn('assigned_by', $scopeUserIds)
                            ->orWhereIn('assigned_to', $scopeUserIds)
                            ->orWhereHas('assignees', fn ($aq) => $aq->whereIn('users.id', $scopeUserIds));
                    });
                } else {
                    // No teams — only own tasks
                    $tasksQuery->where(function ($q) use ($user) {
                        $q->where('assigned_by', $user->id)
                            ->orWhere('assigned_to', $user->id)
                            ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
                    });
                }
                break;

            case 'team_lead':
            case 'teamlead':
                // Team Lead sees tasks within their team scope
                $ledTeamIds = $user->ledTeams()->pluck('teams.id');
                $memberTeamIds = $user->teams()->pluck('teams.id');
                $allTeamIds = $ledTeamIds->merge($memberTeamIds)->unique();

                if ($allTeamIds->isNotEmpty()) {
                    $scopeUserIds = DB::table('team_user')
                        ->whereIn('team_id', $allTeamIds)
                        ->pluck('user_id')
                        ->push($user->id)
                        ->unique();

                    $tasksQuery->where(function ($q) use ($scopeUserIds) {
                        $q->whereIn('assigned_by', $scopeUserIds)
                            ->orWhereIn('assigned_to', $scopeUserIds)
                            ->orWhereHas('assignees', fn ($aq) => $aq->whereIn('users.id', $scopeUserIds));
                    });
                } else {
                    // No teams — only own tasks
                    $tasksQuery->where(function ($q) use ($user) {
                        $q->where('assigned_by', $user->id)
                            ->orWhere('assigned_to', $user->id)
                            ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
                    });
                }
                break;

            case 'guest':
                // Guests cannot access All Tasks
                return response()->json(['data' => collect(), 'total' => 0]);

            default:
                // Member: only tasks directly assigned to or created by the member
                // 1. Tasks where assigned_by = member (member created/assigned the task)
                // 2. Tasks where assigned_to = member (task directly assigned to member)
                // 3. Tasks where member is in the assignees pivot (many-to-many assignment)
                $tasksQuery->where(function ($q) use ($user) {
                    $q->where('assigned_by', $user->id)
                        ->orWhere('assigned_to', $user->id)
                        ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
                });
                break;
        }

        // ── Apply filters ──
        $tasksQuery->when($isDueTodayFilter, fn ($q) => $this->applyDueTodayFilter($q, $user->id))
            ->when($isPendingFilter, fn ($q) => $q->whereIn('status', $this->pendingTaskStatuses()))
            ->when($isInProgressFilter, fn ($q) => $q->whereIn('status', $this->inProgressTaskStatuses()))
            ->when($isPausedFilter, fn ($q) => $q->whereIn('status', $this->pausedTaskStatuses()))
            ->when($search, fn ($q) => $q->where(function ($sq) use ($search) {
                $sq->where('title', 'like', '%'.$search.'%')
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('users.name', 'like', '%'.$search.'%'))
                    ->orWhereHas('assigner', fn ($aq) => $aq->where('users.name', 'like', '%'.$search.'%'))
                    ->orWhereHas('project', fn ($pq) => $pq->where('title', 'like', '%'.$search.'%'));
            }))
            ->when($statusFilter && ! $isDueTodayFilter && ! $isPendingFilter && ! $isInProgressFilter && ! $isPausedFilter, fn ($q) => $q->where('status', $statusFilter))
            ->when($timeFilter, fn ($q) => $q->where('updated_at', '>=', now()->subDays((int) $timeFilter)));

        $tasks = $tasksQuery
            ->with([
                'project:id,title,team_id',
                'assignees:id,name,email,role',
                'assigner:id,name,email,role',
                'approvedBy:id,name,role',
                'rejectedBy:id,name,role',
                'reopenedBy:id,name,role',
                'updatedBy:id,name,role',
            ])
            ->orderBy('sort_order')
            ->latest('updated_at')
            ->limit(200)
            ->get();

        // ── Bulk load deliverable counts ──
        $taskIds = $tasks->pluck('id');
        $dlvStats = collect();
        if ($taskIds->isNotEmpty()) {
            $dlvStats = Deliverable::selectRaw('task_id, COUNT(*) as total, SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending')
                ->whereIn('task_id', $taskIds)
                ->groupBy('task_id')
                ->get()->keyBy('task_id');
        }

        $tasks->transform(function ($task) use ($dlvStats, $user) {
            $task->item_type = 'task';
            $stats = $dlvStats->get($task->id);
            $total = $stats ? (int) $stats->total : 0;
            $completed = $stats ? (int) $stats->completed : 0;
            $pending = $stats ? (int) $stats->pending : 0;
            $task->total_deliverables = $total;
            $task->completed_deliverables = $completed;
            $task->pending_deliverables_count = $pending;
            $task->deliverables_progress = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

            // Transferor flag for list views
            $isTransferor = false;
            $chain = $task->delegation_chain ?? [];
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $isTransferor = true;
                    break;
                }
            }
            $task->is_transferor = $isTransferor;
            $task->transferor_return_to_self = true;
            $task->transferor_has_approved = false;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferor_return_to_self = $entry['return_to_transferor'] ?? true;
                    break;
                }
            }
            $approvalChain = $task->approval_chain ?? [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                    $task->transferor_has_approved = true;
                    break;
                }
            }

            // Set transferred_by_name for the transferee
            $task->transferred_by_name = null;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $task->transferred_by_name = $entry['delegated_by_name'];
                }
            }

            return $task;
        });

        $allItems = $tasks->sortBy('sort_order')->values();

        return response()->json([
            'data' => $allItems,
            'total' => $allItems->count(),
        ]);
    }

    /**
     * Get the list of statuses considered as pending (not yet acknowledged).
     *
     * @return array Array of status strings.
     */
    private function pendingTaskStatuses(): array
    {
        return ['pending', 'planned', 'Planning', 'Planned'];
    }

    /**
     * Get the list of statuses considered as in-progress (acknowledged, being worked on).
     *
     * @return array Array of status strings.
     */
    private function inProgressTaskStatuses(): array
    {
        return ['in_progress', 'In Progress', 'In-progress'];
    }

    /**
     * Get the list of statuses considered as paused.
     *
     * @return array Array of status strings.
     */
    private function pausedTaskStatuses(): array
    {
        return ['paused'];
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

    /**
     * Standard query builder pipeline:
     * 1. Apply WHERE filters (search, user_id/assigned_to, project_id, status, start_date, end_date)
     * 2. Apply ORDER BY (sort_by, sort_dir/sort_order)
     * 3. Apply LIMIT/OFFSET (per_page)
     */
    private function applyQueryFiltersSortingPagination(Request $request, $query)
    {
        // 1. WHERE filters
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($sq) use ($search) {
                $sq->where('tasks.title', 'like', '%'.$search.'%')
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('users.name', 'like', '%'.$search.'%'))
                    ->orWhereHas('assigner', fn ($aq) => $aq->where('users.name', 'like', '%'.$search.'%'))
                    ->orWhereHas('project', fn ($pq) => $pq->where('projects.title', 'like', '%'.$search.'%'));
            });
        }

        $userId = $request->input('user_id') ?: $request->input('assigned_to');
        if ($userId) {
            $query->where(function ($q) use ($userId) {
                $q->where('tasks.assigned_to', $userId)
                    ->orWhere('tasks.assigned_by', $userId)
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $userId));
            });
        }

        if ($request->filled('project_id')) {
            $query->where('tasks.project_id', $request->input('project_id'));
        }

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $isInProgressFilter = $request->input('status') === 'in_progress';
        $isPausedFilter = $request->input('status') === 'paused';
        $statusFilter = $request->input('status');

        if ($isDueTodayFilter) {
            $this->applyDueTodayFilter($query);
        } elseif ($isPendingFilter) {
            $query->whereIn('tasks.status', $this->pendingTaskStatuses());
        } elseif ($isInProgressFilter) {
            $query->whereIn('tasks.status', $this->inProgressTaskStatuses());
        } elseif ($isPausedFilter) {
            $query->whereIn('tasks.status', $this->pausedTaskStatuses());
        } elseif ($statusFilter) {
            $query->where('tasks.status', $statusFilter);
        }

        if ($request->filled('start_date')) {
            $query->whereDate('tasks.start_date', '>=', $request->input('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('tasks.end_date', '<=', $request->input('end_date'));
        }

        // 2. ORDER BY
        $sortBy = $request->input('sort_by') ?: $request->input('sort_field');
        $sortDir = strtolower($request->input('sort_dir') ?: $request->input('sort_order', 'desc')) === 'asc' ? 'asc' : 'desc';

        if ($sortBy && in_array($sortBy, ['created_at', 'due_date', 'start_date', 'end_date', 'title', 'status', 'updated_at'])) {
            $field = $sortBy === 'due_date' ? 'tasks.end_date' : 'tasks.'.$sortBy;
            $query->orderBy($field, $sortDir);
        } else {
            $query->orderBy('tasks.sort_order', 'asc')->orderBy('tasks.updated_at', 'desc');
        }

        // 3. LIMIT / OFFSET
        $perPage = (int) ($request->input('per_page') ?: $request->input('limit', 100));
        $perPage = max(1, min(100, $perPage));
        $query->limit($perPage);

        return $query;
    }

    /**
     * Attach computed timer data to a task payload array.
     */
    private function taskWithTimer(array $payload): array
    {
        if (isset($payload['timer'])) {
            return $payload;
        }

        $task = Task::with([])->find($payload['id'] ?? 0);
        if (! $task) {
            return $payload;
        }

        $workSeconds = $task->getCurrentWorkSeconds();
        $elapsedSeconds = $task->getCurrentElapsedSeconds();

        $payload['timer'] = [
            'state' => $task->timer_state,
            'work_seconds' => $workSeconds,
            'work_formatted' => Task::formatDuration($workSeconds),
            'elapsed_seconds' => $elapsedSeconds,
            'elapsed_formatted' => Task::formatDuration($elapsedSeconds),
            'pause_count' => (int) ($task->pause_count ?? 0),
            'total_pause_seconds' => (int) ($task->total_pause_seconds ?? 0),
            'total_pause_formatted' => Task::formatDuration((int) ($task->total_pause_seconds ?? 0)),
            'resume_count' => (int) ($task->resume_count ?? 0),
            'work_started_at' => $task->work_started_at?->format('Y-m-d\TH:i:s'),
            'work_completed_at' => $task->work_completed_at?->format('Y-m-d\TH:i:s'),
            'last_timer_event_at' => $task->last_timer_event_at?->format('Y-m-d\TH:i:s'),
        ];

        return $payload;
    }

    /**
     * Delegate a task to another user.
     *
     * @param  Request  $request  Input: delegated_to, reason, reason_detail, notes
     * @param  Task  $task  The task to delegate.
     * @return JsonResponse JSON response with the delegation record.
     */
    public function delegate(Request $request, Task $task)
    {
        $user = $request->user();
        $isCreator = (int) $task->assigned_by === (int) $user->id;
        $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
        $isCurrentOwner = $this->delegationService->isCurrentOwner($task, $user);

        if (! $isCreator && ! $isAssignee && ! $isCurrentOwner && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if (in_array($task->status, ['approved', 'rejected', 'submitted'])) {
            return response()->json(['success' => false, 'message' => 'Cannot delegate a task that is already approved, rejected, or submitted'], 422);
        }

        if (! $task->allow_transfer) {
            return response()->json(['success' => false, 'message' => 'Transfers are not allowed for this task'], 422);
        }

        // User must acknowledge the task first before transferring
        if ($task->status === 'pending') {
            return response()->json(['success' => false, 'message' => 'You must acknowledge this task first before transferring it'], 422);
        }

        $validated = $request->validate([
            'delegated_to' => 'required|exists:users,id',
            'reason' => 'required|string|max:500',
            'reason_detail' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
            'return_to_transferor' => 'nullable|boolean',
        ]);

        if ((int) $validated['delegated_to'] === (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Cannot delegate a task to yourself'], 422);
        }

        $delegatedTo = User::find($validated['delegated_to']);

        try {
            $delegation = $this->delegationService->delegateTask(
                $task,
                $user,
                $delegatedTo,
                $validated['reason'],
                $validated['reason_detail'] ?? null,
                $validated['notes'] ?? null,
                $validated['return_to_transferor'] ?? true
            );

            return response()->json([
                'success' => true,
                'message' => 'Task delegated successfully',
                'delegation' => $delegation->load(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role']),
                'task' => $this->taskWithTimer($task->fresh()->load([
                    'assignees:id,name,email,role', 'assigner:id,name',
                    'currentOwner:id,name,email,role',
                    'delegations' => fn ($q) => $q->with(['delegatedBy:id,name,role', 'delegatedTo:id,name,role'])->latest(),
                    'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                    'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                    'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                    'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
                ])->toArray()),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Accept a pending delegation.
     *
     * @param  Task  $task  The task.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function acceptDelegation(Request $request, Task $task)
    {
        $user = $request->user();

        $delegation = TaskDelegation::where('task_id', $task->id)
            ->where('delegated_to', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->first();

        if (! $delegation) {
            return response()->json(['success' => false, 'message' => 'No pending delegation found for you'], 404);
        }

        try {
            $delegation = $this->delegationService->acceptDelegation($delegation, $user);

            return response()->json([
                'success' => true,
                'message' => 'Delegation accepted',
                'delegation' => $delegation->load(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role']),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Reject a pending delegation.
     *
     * @param  Task  $task  The task.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function rejectDelegation(Request $request, Task $task)
    {
        $user = $request->user();

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $delegation = TaskDelegation::where('task_id', $task->id)
            ->where('delegated_to', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->first();

        if (! $delegation) {
            return response()->json(['success' => false, 'message' => 'No pending delegation found for you'], 404);
        }

        try {
            $delegation = $this->delegationService->rejectDelegation($delegation, $user, $validated['reason'] ?? null);

            return response()->json([
                'success' => true,
                'message' => 'Delegation rejected',
                'delegation' => $delegation->load(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role']),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Revoke a delegation (by the delegator or admin/manager).
     *
     * @param  Task  $task  The task.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function revokeDelegation(Request $request, Task $task)
    {
        $user = $request->user();

        $validated = $request->validate([
            'delegation_id' => 'required|exists:task_delegations,id',
        ]);

        $delegation = TaskDelegation::findOrFail($validated['delegation_id']);

        if ((int) $delegation->task_id !== (int) $task->id) {
            return response()->json(['success' => false, 'message' => 'Delegation does not belong to this task'], 422);
        }

        try {
            $delegation = $this->delegationService->revokeDelegation($delegation, $user);

            return response()->json([
                'success' => true,
                'message' => 'Delegation revoked',
                'delegation' => $delegation->load(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role']),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Get delegation chain details for a task.
     *
     * @param  Task  $task  The task.
     * @return JsonResponse JSON response with the delegation chain.
     */
    public function delegationChain(Task $task)
    {
        $chain = $this->delegationService->getChainDetails($task);

        return response()->json([
            'success' => true,
            'chain' => $chain,
            'approval_chain' => $task->approval_chain ?? [],
        ]);
    }

    /**
     * Request to abandon a task (Members, Team Leads, Managers, Admins).
     */
    public function requestAbandon(Request $request, Task $task)
    {
        $user = $request->user();
        if ($task->status === 'abandoned') {
            return response()->json(['success' => false, 'message' => 'Task is already abandoned'], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $task->update([
            'previous_status' => $task->status,
            'status' => 'abandon_requested',
            'abandon_requested_by' => $user->id,
            'abandon_requested_at' => now(),
            'abandon_reason' => $validated['reason'] ?? null,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'task_abandon_requested', 'Requested to abandon task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Abandon request submitted successfully',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name'])->toArray()),
        ]);
    }

    /**
     * Approve abandon request (Admins & Managers ONLY).
     */
    public function approveAbandon(Request $request, Task $task)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can approve abandon requests'], 403);
        }

        $task->update([
            'status' => 'abandoned',
            'abandoned_by' => $user->id,
            'abandoned_at' => now(),
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'task_abandon_approved', 'Approved abandon request for task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Task abandon approved successfully',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name'])->toArray()),
        ]);
    }

    /**
     * Decline abandon request (Admins & Managers ONLY).
     */
    public function declineAbandon(Request $request, Task $task)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can decline abandon requests'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $revertStatus = $task->previous_status ?: 'in_progress';

        $task->update([
            'status' => $revertStatus,
            'abandon_declined_by' => $user->id,
            'abandon_declined_at' => now(),
            'abandon_decline_reason' => $validated['reason'] ?? null,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'task_abandon_declined', 'Declined abandon request for task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Task abandon request declined',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name'])->toArray()),
        ]);
    }

    /**
     * Directly abandon a task (Admins & Managers ONLY).
     */
    public function abandon(Request $request, Task $task)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can directly abandon tasks'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $task->update([
            'previous_status' => $task->status,
            'status' => 'abandoned',
            'abandoned_by' => $user->id,
            'abandoned_at' => now(),
            'abandon_reason' => $validated['reason'] ?? $task->abandon_reason,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'task_abandoned', 'Abandoned task "'.$task->title.'"', 'task', $task->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Task abandoned successfully',
            'task' => $this->taskWithTimer($task->fresh()->load(['assignees:id,name,email,role', 'assigner:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name'])->toArray()),
        ]);
    }
}