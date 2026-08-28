<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableFile;
use App\Models\DeliverableSubmission;
use App\Models\DeliverableUserNote;
use App\Models\DeliverableWorkflowEvent;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SubmissionAttachment;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\DelegationService;
use App\Services\NotificationService;
use App\Services\StorageDiskResolver;
use App\Traits\HasStorageEnforcement;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Controller for managing deliverables within projects.
 * Handles CRUD operations, submission/approval workflows, file management,
 * reordering, and notifications for deliverables.
 */
class DeliverableController extends Controller
{
    use HasStorageEnforcement;
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService,
        private DelegationService $delegationService
    ) {}

    /**
     * List deliverables assigned to or created by the authenticated user.
     *
     * Supports filtering by 'assignee' or 'creator' view, status filtering
     * (including a special 'due_today' filter), and bulk submission status checks.
     *
     * @param  Request  $request  Query parameters: 'view' (assignee|creator), 'status', and other filter params.
     * @return JsonResponse JSON response with deliverable list.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Guests only see deliverables inside project details, not in standalone lists
        if ($user->role === 'guest') {
            return response()->json(['success' => true, 'data' => collect()]);
        }

        $view = $request->query('view', 'assignee');
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) {
            unset($filters['status']);
        }

        $query = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title', 'latestSubmission',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role',
        ]);

        if ($view === 'assignee') {
            $query->where('assigned_to', $user->id)->where('created_by', '!=', $user->id);
        } else {
            $query->where('created_by', $user->id);
        }

        $query->orderBy('created_at', 'desc')->orderBy('id', 'desc')->filter($filters);
        if ($request->filled('per_page') || $request->filled('limit')) {
            $query->limit((int) ($request->input('per_page') ?: $request->input('limit')));
        }
        $deliverables = $query->get();

        // Ensure project_id is populated for old subtasks that may lack it
        foreach ($deliverables as $deliverable) {
            if (empty($deliverable->project_id) && $deliverable->task && $deliverable->task->project_id) {
                $deliverable->project_id = $deliverable->task->project_id;
            }
        }

        // Bulk has_submitted query
        $deliverableIds = $deliverables->pluck('id');
        $submittedIds = [];
        if ($deliverableIds->isNotEmpty()) {
            $submittedIds = DeliverableSubmission::where('submitted_by', $user->id)
                ->whereIn('deliverable_id', $deliverableIds)
                ->pluck('deliverable_id')
                ->toArray();
        }

        $deliverables = $deliverables->filter(function ($deliverable) {
            $chain = $deliverable->delegation_chain ?? [];
            if (! empty($chain)) {
                $latest = end($chain);
                if (in_array($latest['status'], ['pending', 'accepted']) && ($latest['return_to_transferor'] ?? true)) {
                    return false;
                }
            }

            return true;
        });

        $deliverables->transform(function ($deliverable) use ($submittedIds, $user) {
            $deliverable->has_submitted = in_array($deliverable->id, $submittedIds);

            // Transferor flag for list views
            $isTransferor = false;
            $chain = $deliverable->delegation_chain ?? [];
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $isTransferor = true;
                    break;
                }
            }
            $deliverable->is_transferor = $isTransferor;
            $deliverable->transferor_return_to_self = true;
            $deliverable->transferor_has_approved = false;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $deliverable->transferor_return_to_self = $entry['return_to_transferor'] ?? true;
                    break;
                }
            }
            $approvalChain = $deliverable->approval_chain ?? [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                    $deliverable->transferor_has_approved = true;
                    break;
                }
            }

            // Set transferred_by_name for the transferee
            $deliverable->transferred_by_name = null;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $deliverable->transferred_by_name = $entry['delegated_by_name'];
                }
            }

            return $deliverable;
        })->values();

        return response()->json(['success' => true, 'data' => $deliverables]);
    }

    /**
     * List deliverables created by the authenticated user (or by all admin/manager users for admin/manager roles).
     * Excludes self-assigned deliverables.
     *
     * @param  Request  $request  Query parameters for filtering.
     * @return JsonResponse JSON response with deliverable list.
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();

        // Guests only see deliverables inside project details
        if ($user->role === 'guest') {
            return response()->json(['success' => true, 'data' => collect()]);
        }

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) {
            unset($filters['status']);
        }

        $query = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'latestSubmission.attachments', 'reopenedBy:id,name,role',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'updatedBy:id,name,role',
            'currentOwner:id,name',
        ]);

        $query->where('created_by', $user->id);

        $query->orderBy('created_at', 'desc')->orderBy('id', 'desc')->filter($filters);
        if ($request->filled('per_page') || $request->filled('limit')) {
            $query->limit((int) ($request->input('per_page') ?: $request->input('limit')));
        }
        $deliverables = $query->get();

        // Process delegation chain for OA visibility
        $deliverables = $deliverables->map(function ($d) use ($user) {
            $chain = $d->delegation_chain ?? [];
            $latestDelegation = null;
            if (! empty($chain)) {
                $latestDelegation = end($chain);
            }
            $hasActiveDelegation = $latestDelegation && in_array($latestDelegation['status'], ['pending', 'accepted']);
            $delegationReturnToTransferor = $hasActiveDelegation ? ($latestDelegation['return_to_transferor'] ?? true) : true;

            $d->has_direct_to_oa_delegation = false;
            $d->delegator_name = null;
            $d->is_transferee = false;
            if ($hasActiveDelegation && ! $delegationReturnToTransferor) {
                $d->has_direct_to_oa_delegation = true;
                $d->delegator_name = $latestDelegation['delegated_by_name'] ?? null;
                $d->is_transferee = true;
            }
            $d->current_owner_id = $d->current_owner;
            $d->current_owner_name = $d->currentOwner?->name;

            // Set transferred_by_name for the transferee
            $d->transferred_by_name = null;
            foreach ($chain as $entry) {
                if ((int) $entry['delegated_to'] === (int) $user->id && $entry['status'] === 'accepted') {
                    $d->transferred_by_name = $entry['delegated_by_name'];
                }
            }

            return $d;
        })->values();

        return response()->json(['success' => true, 'data' => $deliverables]);
    }

    /**
     * List deliverables that are both assigned to and created by the authenticated user (self-created deliverables).
     *
     * @param  Request  $request  Query parameters for filtering.
     * @return JsonResponse JSON response with self-created deliverable list.
     */
    public function mySelfDeliverables(Request $request)
    {
        $user = $request->user();

        // Guests only see deliverables inside project details
        if ($user->role === 'guest') {
            return response()->json(['success' => true, 'data' => collect()]);
        }

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) {
            unset($filters['status']);
        }

        $query = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email', 'latestSubmission.attachments',
        ])
            ->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                    ->orWhere(function ($sq) use ($user) {
                        $sq->where('created_by', $user->id)->whereNull('assigned_to');
                    });
            })
            ->when($isDueTodayFilter, fn ($q) => $q->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses()))
            ->orderBy('created_at', 'desc')->orderBy('id', 'desc')
            ->filter($filters);

        if ($request->filled('per_page') || $request->filled('limit')) {
            $query->limit((int) ($request->input('per_page') ?: $request->input('limit')));
        }
        $deliverables = $query->get();

        return response()->json(['success' => true, 'data' => $deliverables]);
    }

    /**
     * Retrieve a single deliverable with all related data (submissions, workflow events, changes).
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  int  $id  The ID of the deliverable to retrieve.
     * @return JsonResponse JSON response with full deliverable details or 403 unauthorized.
     */
    public function show(Request $request, $id)
    {
        $deliverable = Deliverable::findOrFail($id);
        $user = request()->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        $isAssignee = (int) $deliverable->assigned_to === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        $isGuestOfProject = false;
        if ($user->role === 'guest') {
            $project = $deliverable->project ?? ($deliverable->task ? $deliverable->task->project : null);
            $isGuestOfProject = $project && $project->isAccessibleByGuest($user);
        }

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager && ! $isGuestOfProject) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Ensure project_id is inferred from task for old subtasks
        if (empty($deliverable->project_id) && $deliverable->task_id && $deliverable->task) {
            $deliverable->project_id = $deliverable->task->project_id;
            $deliverable->saveQuietly();
        }

        $deliverable->load([
            'project:id,title', 'assignee:id,name,email,role', 'creator:id,name,email',
            'task:id,title,assigned_by', 'task.assigner:id,name,email',
            'files',
            'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments', 'approvedBy:id,name', 'reopenedBy:id,name'])->latest(),
            'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments', 'approvedBy:id,name', 'reopenedBy:id,name']),
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email'),
            'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ]);

        $org = request()->attributes->get('currentOrganization');
        if ($org) {
            if ($deliverable->files) StorageDiskResolver::resolveFileUrls($deliverable->files, $org);
            if (!empty($deliverable->reopen_file_path)) {
                $deliverable->reopen_file_path = collect(explode(',', $deliverable->reopen_file_path))
                    ->filter()->map(fn($p) => StorageDiskResolver::resolveUrl($org, trim($p)))->implode(',');
            }
            if (!empty($deliverable->rework_file_path)) {
                $deliverable->rework_file_path = collect(explode(',', $deliverable->rework_file_path))
                    ->filter()->map(fn($p) => StorageDiskResolver::resolveUrl($org, trim($p)))->implode(',');
            }
            if ($deliverable->submissions) {
                $deliverable->submissions->each(function ($sub) use ($org) {
                    if (!empty($sub->file_path) && !str_starts_with($sub->file_path, 'http') && !str_starts_with($sub->file_path, '/storage/')) {
                        $sub->file_path = StorageDiskResolver::resolveUrl($org, $sub->file_path);
                    }
                    if ($sub->attachments) {
                        StorageDiskResolver::resolveFileUrls($sub->attachments, $org);
                    }
                });
            }
            if ($deliverable->latestSubmission && !isset($deliverable->submissions)) {
                $sub = $deliverable->latestSubmission;
                if (!empty($sub->file_path) && !str_starts_with($sub->file_path, 'http') && !str_starts_with($sub->file_path, '/storage/')) {
                    $sub->file_path = StorageDiskResolver::resolveUrl($org, $sub->file_path);
                }
                if ($sub->attachments) {
                    StorageDiskResolver::resolveFileUrls($sub->attachments, $org);
                }
            }
        }

        $payload = $deliverable->toArray();

        // When return_to_transferor=true, only the transferor should see the transferee's submissions
        // The OA and other viewers should NOT see them until the transferor submits
        $delChain = $deliverable->delegation_chain ?? [];
        if (! empty($delChain)) {
            $lastAccepted = null;
            foreach ($delChain as $entry) {
                if ($entry['status'] === 'accepted') {
                    $lastAccepted = $entry;
                }
            }
            if ($lastAccepted && ($lastAccepted['return_to_transferor'] ?? true)) {
                $transferorId = (int) $lastAccepted['delegated_by'];
                $transfereeId = (int) $lastAccepted['delegated_to'];
                // Only transferor and transferee should see the transferee's submissions
                if ((int) $user->id !== $transferorId && (int) $user->id !== $transfereeId) {
                    $allSubs = $payload['submissions'] ?? [];
                    $payload['submissions'] = array_values(array_filter($allSubs, function ($s) use ($transfereeId) {
                        return (int) ($s['submitted_by'] ?? 0) !== $transfereeId;
                    }));
                    foreach (['latest_submission', 'latestSubmission'] as $key) {
                        $latestSub = $payload[$key] ?? null;
                        if ($latestSub && (int) ($latestSub['submitted_by'] ?? 0) === $transfereeId) {
                            $payload[$key] = null;
                        }
                    }
                }
            }
        }

        $payload['unviewed_changes'] = $deliverable->unviewedChanges;
        $payload['unviewed_changes_count'] = $deliverable->unviewedChanges->count();

        // Delegation flags
        $payload['has_delegation_chain'] = ! empty($deliverable->delegation_chain);
        $payload['delegation_chain'] = $deliverable->delegation_chain ?? [];
        $payload['approval_chain'] = $deliverable->approval_chain ?? [];
        $isCurrentOwner = $this->delegationService->isCurrentOwnerDeliverable($deliverable, $user);
        $payload['is_current_owner'] = $isCurrentOwner;
        $isTransferor = false;
        $transferorReturnToSelf = true;
        $transferorHasApproved = false;
        $chain = $deliverable->delegation_chain ?? [];
        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                $isTransferor = true;
                $transferorReturnToSelf = $entry['return_to_transferor'] ?? true;
                break;
            }
        }
        $approvalChain = $deliverable->approval_chain ?? [];
        foreach ($approvalChain as $aEntry) {
            if ((int) $aEntry['approver_id'] === (int) $user->id && $aEntry['status'] === 'approved') {
                $transferorHasApproved = true;
                break;
            }
        }
        // Fallback: if approval_chain is empty/stale but the transferor is the current owner
        // and the deliverable is in_progress after a submitted status, they must have approved
        if (! $transferorHasApproved && $isTransferor && $transferorReturnToSelf) {
            if ((int) ($deliverable->current_owner ?? 0) === (int) $user->id && $deliverable->status === 'in_progress') {
                $transferorHasApproved = true;
            }
        }
        $payload['is_transferor'] = $isTransferor;
        $payload['transferor_return_to_self'] = $transferorReturnToSelf;
        $payload['transferor_has_approved'] = $transferorHasApproved;

        $activeOutgoingDelegation = TaskDelegation::where('deliverable_id', $deliverable->id)
            ->where('delegated_by', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->first();
        $payload['active_outgoing_delegation'] = $activeOutgoingDelegation ? true : false;
        $payload['active_outgoing_delegation_id'] = $activeOutgoingDelegation?->id;
        $payload['can_revoke_delegation'] = $activeOutgoingDelegation && $activeOutgoingDelegation->status === 'pending';

        $pendingStatuses = ['pending', 'in_progress', 'reopened', 'paused', 'rework_required'];
        $isAlreadySubmittedOrClosed = in_array($deliverable->status, ['submitted', 'submitted_late', 'approved']);
        $payload['can_submit'] = ! $isAlreadySubmittedOrClosed && ($isAssignee || $isCurrentOwner) && in_array($deliverable->status, ['in_progress', 'reopened', 'paused', 'rework_required']);
        if ($isTransferor && ! $transferorHasApproved) {
            $payload['can_submit'] = false;
            if (! $transferorReturnToSelf) {
                $payload['is_assignee'] = false;
            }
        }
        // Transferor has approved — force allow submit so they can forward to OA
        if ($isTransferor && $transferorHasApproved && $transferorReturnToSelf && ! $isAlreadySubmittedOrClosed) {
            $payload['can_submit'] = true;
            $payload['is_assignee'] = true;
            $payload['is_current_owner'] = true;
        }
        $payload['can_delegate'] = ($isAssignee || $isCurrentOwner)
            && ! in_array($deliverable->status, ['approved', 'rejected', 'submitted'])
            && $deliverable->allow_transfer;
        if ($isTransferor) {
            $payload['can_delegate'] = false;
        }
        $nextApprover = $this->delegationService->getDeliverableApprover($deliverable);
        $payload['next_approver_id'] = $nextApprover;
        $payload['is_next_approver'] = ($nextApprover && (int) $nextApprover === (int) $user->id)
            || ($nextApprover === null && !empty($deliverable->delegation_chain) && (int) $deliverable->created_by === (int) $user->id);
        $payload['pending_delegation'] = $deliverable->delegations()->where('delegated_to', $user->id)->where('status', 'pending')->first();
        $payload['current_owner_name'] = $deliverable->currentOwner?->name ?? $deliverable->assignee?->name ?? null;
        $payload['original_assigner_name'] = $deliverable->originalAssigner?->name ?? $deliverable->creator?->name ?? null;
        $payload['is_delegatee'] = $deliverable->current_owner && (int) $deliverable->current_owner === (int) $user->id
            && ($deliverable->delegation_count > 0 || ! empty($deliverable->delegation_chain));
        $payload['allow_transfer'] = $deliverable->allow_transfer ?? true;

        return response()->json(['success' => true, 'deliverable' => $payload]);
    }

    /**
     * Create a new deliverable within a project.
     *
     * Creates workflow events for creation and assignment, and sends a notification
     * to the assignee if the deliverable is assigned to a different user.
     *
     * @param  Request  $request  Validated input: title, description, status, priority, due_date, assigned_to, task_id.
     * @param  Project  $project  The parent project.
     * @return JsonResponse JSON response with the created deliverable.
     */
    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'status' => 'nullable|string|max:64', 'priority' => 'nullable|string|max:32',
            'start_date' => 'nullable|date', 'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id|required_without:task_id',
            'task_id' => 'nullable|exists:tasks,id',
            'estimated_hours' => 'nullable|integer|min:0',
            'estimated_minutes' => 'nullable|integer|min:0|max:59',
            'labels' => 'nullable|array', 'labels.*' => 'string|max:100',
            'tags' => 'nullable|array', 'tags.*' => 'string|max:100',
            'followers' => 'nullable|array', 'followers.*' => 'exists:users,id',
            'dependencies' => 'nullable|array', 'dependencies.*' => 'exists:deliverables,id',
            'assignees' => 'nullable|array', 'assignees.*' => 'exists:users,id',
            'allow_transfer' => 'nullable|boolean',
        ]);

        if (empty($request->input('assignees')) && empty($request->input('assigned_to'))) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Please select at least one person to assign this subtask to.'],
            ]);
        }

        // Validate deliverable due_date does not exceed parent task end_date
        if (! empty($validated['due_date']) && ! empty($validated['task_id'])) {
            $task = Task::find($validated['task_id']);
            if ($task && $task->end_date) {
                $deliverableDate = Carbon::parse($validated['due_date']);
                $taskEnd = Carbon::parse($task->end_date);
                if ($deliverableDate->gt($taskEnd)) {
                    throw ValidationException::withMessages([
                        'due_date' => 'Subtask deadline cannot exceed the task deadline ('.$taskEnd->format('d M Y h:i A').').',
                    ]);
                }
            }
        }

        // Validate parent task belongs to the selected project
        if (! empty($validated['task_id'])) {
            $task = Task::find($validated['task_id']);
            if (! $task || (int) $task->project_id !== (int) $project->id) {
                throw ValidationException::withMessages([
                    'task_id' => 'The selected parent task does not belong to this project.',
                ]);
            }
        }

        // Validate assignee(s) are project members
        $allAssigneeIds = array_filter(array_unique(array_merge(
            $validated['assignees'] ?? [],
            $validated['assigned_to'] ? [$validated['assigned_to']] : [],
        )));
        if (! empty($allAssigneeIds)) {
            $projectMemberIds = $project->getMembers()->pluck('id')->map(fn ($id) => (int) $id)->toArray();
            $adminManagerIds = User::whereIn('id', $allAssigneeIds)->whereIn('role', ['admin', 'manager'])->pluck('id')->map(fn ($id) => (int) $id)->toArray();
            $allowedIds = array_unique(array_merge($projectMemberIds, $adminManagerIds));
            $invalidIds = array_diff(array_map('intval', $allAssigneeIds), $allowedIds);
            if (! empty($invalidIds)) {
                throw ValidationException::withMessages([
                    'assigned_to' => 'One or more selected users are not members of this project. Please select only project members.',
                ]);
            }
        }

        $user = $request->user();

        // Extract assignees before creating deliverable
        $assigneeIds = $validated['assignees'] ?? ($validated['assigned_to'] ? [$validated['assigned_to']] : []);
        unset($validated['assignees'], $validated['dependencies'], $validated['followers']);

        $deliverable = $project->deliverables()->create([
            'title' => $validated['title'], 'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending', 'priority' => $validated['priority'] ?? 'Medium',
            'start_date' => $validated['start_date'] ?? null,
            'due_date' => $validated['due_date'] ?? null, 'assigned_to' => $validated['assigned_to'] ?? null,
            'task_id' => $validated['task_id'] ?? null, 'created_by' => $user->id,
            'updated_by' => $user->id,
            'estimated_hours' => $validated['estimated_hours'] ?? null,
            'allow_transfer' => $validated['allow_transfer'] ?? true,
            'estimated_minutes' => $validated['estimated_minutes'] ?? null,
            'labels' => $validated['labels'] ?? null,
            'tags' => $validated['tags'] ?? null,
            'followers' => $request->input('followers') ?? null,
            'dependencies' => $request->input('dependencies') ?? null,
        ]);

        // Sync multi-assignees
        if (! empty($assigneeIds)) {
            $deliverable->assignees()->sync($assigneeIds);
        }

        // Create workflow event for deliverable creation
        $assigneeName = $deliverable->assigned_to ? (User::find($deliverable->assigned_to)?->name ?? '') : '';
        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'created',
            'comment' => $assigneeName ? 'Assigned to '.$assigneeName : null,
        ]);

        // Create separate assignment event for the assignee's activity feed
        if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'user_id' => $user->id,
                'event_type' => 'assigned',
                'comment' => 'Assigned to '.$assigneeName,
            ]);
        }

        if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
            $this->sendDeliverableNotification($deliverable, $user, 'deliverable_assigned', 'Deliverable Assigned');
        }

        // Notify project assignees about new deliverable
        if ($deliverable->project_id) {
            $projectAssignees = $project->assigned_users ?? [];
            if (! empty($projectAssignees)) {
                $this->notificationService->notifyDeliverableAdded($deliverable, $user, $projectAssignees, 'project');
            }
        }

        // Notify task assignees about new deliverable (if assigned to a task)
        if ($deliverable->task_id) {
            $task = Task::with('assignees:id')->find($deliverable->task_id);
            if ($task) {
                $taskAssigneeIds = $task->assignees->pluck('id')->toArray();
                $this->notificationService->notifyDeliverableAdded($deliverable, $user, $taskAssigneeIds, 'task');
            }
        }

        $deliverable->load('task:id,title,business_id');

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Created', 'deliverable', $deliverable->title, [
            'Project' => $project->title,
            'Task' => $deliverable->task_id ? ($deliverable->task->title ?? 'N/A') : 'N/A',
            'Task ID' => $deliverable->task?->business_id ?? 'N/A',
            'Assigned To' => $deliverable->assignee?->name ?? 'N/A',
        ]);

        try {
            $this->activityService->log(
                $user->id,
                'deliverable_created',
                'Created subtask "'.$deliverable->title.'"',
                'deliverable',
                $deliverable->id,
                'create'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log activity for deliverable create', ['error' => $e->getMessage()]);
        }

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'create',
                description: "Created deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable created successfully',
            'deliverable' => $deliverable->load(['assignee:id,name,email,role', 'creator:id,name']),
        ], 201);
    }

    /**
     * Store a deliverable without a project in the URL (task_id required).
     * Infers project_id from the parent task.
     */
    public function storeStandalone(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'status' => 'nullable|string|max:64', 'priority' => 'nullable|string|max:32',
            'start_date' => 'nullable|date', 'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id',
            'task_id' => 'nullable|exists:tasks,id',
            'project_id' => 'nullable|exists:projects,id',
            'estimated_hours' => 'nullable|integer|min:0',
            'estimated_minutes' => 'nullable|integer|min:0|max:59',
            'labels' => 'nullable|array', 'labels.*' => 'string|max:100',
            'tags' => 'nullable|array', 'tags.*' => 'string|max:100',
            'followers' => 'nullable|array', 'followers.*' => 'exists:users,id',
            'dependencies' => 'nullable|array', 'dependencies.*' => 'exists:deliverables,id',
            'assignees' => 'nullable|array', 'assignees.*' => 'exists:users,id',
            'allow_transfer' => 'nullable|boolean',
        ]);

        if (empty($request->input('assignees')) && empty($request->input('assigned_to'))) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Please select at least one person to assign this subtask to.'],
            ]);
        }

        // Resolve project: from task, from body, or null
        $project = null;
        $task = null;
        if (! empty($validated['task_id'])) {
            $task = Task::find($validated['task_id']);
            $project = $task?->project;
        } elseif (! empty($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
        }

        // Validate due_date against task if present
        if (! empty($validated['due_date']) && $task && $task->end_date) {
            $deliverableDate = Carbon::parse($validated['due_date']);
            $taskEnd = Carbon::parse($task->end_date);
            if ($deliverableDate->gt($taskEnd)) {
                throw ValidationException::withMessages([
                    'due_date' => 'Subtask deadline cannot exceed the task deadline ('.$taskEnd->format('d M Y h:i A').').',
                ]);
            }
        }

        // Validate assignee membership if project exists
        $allAssigneeIds = array_filter(array_unique(array_merge(
            $validated['assignees'] ?? [],
            $validated['assigned_to'] ? [$validated['assigned_to']] : [],
        )));
        if (! empty($allAssigneeIds) && $project) {
            $projectMemberIds = $project->getMembers()->pluck('id')->map(fn ($id) => (int) $id)->toArray();
            $adminManagerIds = User::whereIn('id', $allAssigneeIds)->whereIn('role', ['admin', 'manager'])->pluck('id')->map(fn ($id) => (int) $id)->toArray();
            $allowedIds = array_unique(array_merge($projectMemberIds, $adminManagerIds));
            $invalidIds = array_diff(array_map('intval', $allAssigneeIds), $allowedIds);
            if (! empty($invalidIds)) {
                throw ValidationException::withMessages([
                    'assigned_to' => 'One or more selected users are not members of this project.',
                ]);
            }
        }

        $user = $request->user();
        $assigneeIds = $validated['assignees'] ?? ($validated['assigned_to'] ? [$validated['assigned_to']] : []);
        unset($validated['assignees'], $validated['dependencies'], $validated['followers']);

        $data = [
            'title' => $validated['title'], 'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending', 'priority' => $validated['priority'] ?? 'Medium',
            'start_date' => $validated['start_date'] ?? null,
            'due_date' => $validated['due_date'] ?? null, 'assigned_to' => $validated['assigned_to'] ?? null,
            'project_id' => $project?->id, 'task_id' => $validated['task_id'] ?? null,
            'created_by' => $user->id, 'updated_by' => $user->id,
            'estimated_hours' => $validated['estimated_hours'] ?? null,
            'estimated_minutes' => $validated['estimated_minutes'] ?? null,
            'labels' => $validated['labels'] ?? null,
            'tags' => $validated['tags'] ?? null,
            'followers' => $request->input('followers') ?? null,
            'dependencies' => $request->input('dependencies') ?? null,
            'allow_transfer' => $validated['allow_transfer'] ?? true,
        ];

        $deliverable = $project
            ? $project->deliverables()->create($data)
            : Deliverable::create($data);

        if (! empty($assigneeIds)) {
            $deliverable->assignees()->sync($assigneeIds);
        }

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'created',
        ]);

        if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
            $this->sendDeliverableNotification($deliverable, $user, 'deliverable_assigned', 'Deliverable Assigned');
        }

        if ($deliverable->task_id && $task) {
            $taskAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
            if (! empty($taskAssigneeIds)) {
                $this->notificationService->notifyDeliverableAdded($deliverable, $user, $taskAssigneeIds, 'task');
            }
        }

        $deliverable->load('task:id,title,business_id');

        try {
            $this->activityService->log(
                $user->id,
                'deliverable_created',
                'Created subtask "'.$deliverable->title.'"',
                'deliverable',
                $deliverable->id,
                'create'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log activity for deliverable create standalone', ['error' => $e->getMessage()]);
        }

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'create',
                description: "Created deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit for deliverable create standalone', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable created successfully',
            'deliverable' => $deliverable->load(['assignee:id,name,email,role', 'creator:id,name']),
        ], 201);
    }

    /**
     * Update an existing deliverable's properties and track field changes.
     *
     * Records field changes for audit trail, creates workflow events,
     * and sends notifications to the assignee when updates are made.
     *
     * @param  Request  $request  Validated input for updatable fields.
     * @param  Deliverable  $deliverable  The deliverable to update.
     * @return JsonResponse JSON response with the updated deliverable and change count.
     */
    public function update(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $deliverable->load('project:id,title', 'task:id,title');

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255', 'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|string|max:64', 'priority' => 'sometimes|string|max:32',
            'start_date' => 'sometimes|nullable|date',
            'due_date' => 'sometimes|nullable|date', 'assigned_to' => 'sometimes|nullable|exists:users,id',
            'estimated_hours' => 'sometimes|nullable|integer|min:0',
            'estimated_minutes' => 'sometimes|nullable|integer|min:0|max:59',
            'labels' => 'sometimes|nullable|array', 'labels.*' => 'string|max:100',
            'tags' => 'sometimes|nullable|array', 'tags.*' => 'string|max:100',
            'followers' => 'sometimes|nullable|array', 'followers.*' => 'exists:users,id',
            'dependencies' => 'sometimes|nullable|array', 'dependencies.*' => 'exists:deliverables,id',
            'assignees' => 'sometimes|nullable|array', 'assignees.*' => 'exists:users,id',
            'allow_transfer' => 'sometimes|boolean',
        ]);

        if ($request->has('assigned_to') || $request->has('assignees')) {
            $assignees = $request->input('assignees') ?? ($request->input('assigned_to') ? [$request->input('assigned_to')] : []);
            if (empty($assignees)) {
                throw ValidationException::withMessages([
                    'assigned_to' => ['Please select at least one person to assign this subtask to.'],
                ]);
            }
        }

        // Validate deliverable due_date does not exceed parent task end_date
        if (! empty($validated['due_date']) && $deliverable->task_id) {
            $task = Task::find($deliverable->task_id);
            if ($task && $task->end_date) {
                $deliverableDate = Carbon::parse($validated['due_date']);
                $taskEnd = Carbon::parse($task->end_date);
                if ($deliverableDate->gt($taskEnd)) {
                    throw ValidationException::withMessages([
                        'due_date' => 'Subtask deadline cannot exceed the task deadline ('.$taskEnd->format('d M Y h:i A').').',
                    ]);
                }
            }
        }

        $oldValues = [];
        foreach (['title', 'description', 'priority', 'due_date', 'start_date', 'status', 'estimated_hours', 'estimated_minutes'] as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $deliverable->{$f};
            }
        }
        $oldAssignedTo = $deliverable->assigned_to;

        // Extract assignees and dependencies before update
        $assigneeIds = $validated['assignees'] ?? null;
        unset($validated['assignees'], $validated['dependencies'], $validated['followers']);

        $validated['updated_by'] = $user->id;
        $deliverable->update($validated);

        // Sync multi-assignees if provided
        if ($assigneeIds !== null) {
            $deliverable->assignees()->sync($assigneeIds);
        }

        // Update labels, tags, followers, dependencies if provided
        if ($request->has('labels')) {
            $deliverable->update(['labels' => $request->input('labels')]);
        }
        if ($request->has('tags')) {
            $deliverable->update(['tags' => $request->input('tags')]);
        }
        if ($request->has('followers')) {
            $deliverable->update(['followers' => $request->input('followers')]);
        }
        if ($request->has('dependencies')) {
            $deliverable->update(['dependencies' => $request->input('dependencies')]);
        }

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $deliverable->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = ['field_name' => $f, 'label' => ucfirst(str_replace('_', ' ', $f)), 'old_value' => $oldStr, 'new_value' => $newStr];
            }
        }

        if (array_key_exists('assigned_to', $validated) && (int) $validated['assigned_to'] !== (int) $oldAssignedTo) {
            $oldName = $oldAssignedTo ? User::find($oldAssignedTo)?->name : 'None';
            $newName = $validated['assigned_to'] ? User::find($validated['assigned_to'])?->name : 'None';
            $changes[] = ['field_name' => 'assigned_to', 'label' => 'Assignee', 'old_value' => $oldName ?? 'None', 'new_value' => $newName ?? 'None'];
        }

        if (! empty($changes)) {
            $deliverable->changes()->createMany(
                array_map(fn ($c) => [
                    'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
                    'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
                ], $changes)
            );
            DeliverableWorkflowEvent::insert(
                array_map(fn ($c) => [
                    'deliverable_id' => $deliverable->id, 'event_type' => 'field_changed',
                    'user_id' => $user->id, 'comment' => $c['label'].': '.$c['old_value'].' → '.$c['new_value'],
                ], $changes)
            );
        }

        $this->sendDeliverableUpdateNotification($deliverable, $user, $changes);

        // Send confirmation email to performer
        if (count($changes) > 0) {
            $fieldNames = array_column($changes, 'label');
            $this->notificationService->confirmAction($user, 'Updated', 'deliverable', $deliverable->title, [
                'Project' => $deliverable->project?->title ?? 'N/A',
                'Task' => $deliverable->task?->title ?? 'N/A',
                'Changes Made' => implode(', ', array_slice($fieldNames, 0, 5)).(count($fieldNames) > 5 ? ' and more' : ''),
            ]);
        }

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'update',
                description: "Updated deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                oldValues: $oldValues,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => count($changes) > 0 ? 'Deliverable updated — '.count($changes).' change(s) made' : 'Deliverable updated successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
            'changes_count' => count($changes),
        ]);
    }

    /**
     * Delete a deliverable. Only the creator or admin/manager can delete.
     *
     * @param  Deliverable  $deliverable  The deliverable to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function destroy(Deliverable $deliverable)
    {
        $user = request()->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if (in_array($deliverable->status, ['approved', 'submitted'])) {
            return response()->json(['success' => false, 'message' => 'Cannot delete a subtask that is '.$deliverable->status], 422);
        }

        $deliverable->delete();

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'delete',
                description: "Deleted deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'Deliverable deleted successfully']);
    }

    private function cleanupDeliverableFiles(Deliverable $deliverable, $org): void
    {
        try {
            foreach ($deliverable->files as $file) {
                if (!empty($file->url)) {
                    StorageDiskResolver::delete($org, $file->url);
                }
            }
            foreach ($deliverable->submissions as $submission) {
                if (!empty($submission->file_path)) {
                    StorageDiskResolver::delete($org, $submission->file_path);
                }
                foreach ($submission->attachments as $att) {
                    if (!empty($att->file_path)) {
                        StorageDiskResolver::delete($org, $att->file_path);
                    }
                }
            }
        } catch (\Throwable $e) {
            \Log::error('Failed to cleanup deliverable files: ' . $e->getMessage());
        }
    }

    /**
     * Submit a deliverable for review by its creator.
     *
     * Handles file uploads (single and multiple), link attachments, and determines
     * whether this is a first submission or a resubmission. Creates workflow events
     * and notifications for the creator.
     *
     * @param  Request  $request  Input: comment, file, files[], links[].
     * @param  Deliverable  $deliverable  The deliverable to submit.
     * @return JsonResponse JSON response with the updated deliverable.
     */
    public function submit(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isCurrentOwner = $this->delegationService->isCurrentOwnerDeliverable($deliverable, $user);
        $isAuthorizedRole = in_array($user->role, ['admin', 'manager', 'team_lead']);
        if (! $isAssignee && ! $isCurrentOwner && ! $isAuthorizedRole) {
            return response()->json(['success' => false, 'message' => 'Only the assignee or current owner can submit this deliverable'], 403);
        }
        $currentStatus = strtolower(trim((string) $deliverable->status));

        if (in_array($currentStatus, ['submitted', 'submitted_late'])) {
            return response()->json([
                'success' => true,
                'message' => 'Deliverable is already submitted',
                'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
            ], 200);
        }

        $allowedSubmitStatuses = [
            'pending', 'not_started', 'assigned', 'planned', 'planning',
            'in_progress', 'in-progress', 'acknowledged',
            'reopened', 'rework_required',
            'paused',
            'rejected', 'declined',
        ];
        if (! in_array($currentStatus, $allowedSubmitStatuses)) {
            return response()->json(['success' => false, 'message' => 'This deliverable cannot be submitted in its current status (' . $deliverable->status . ')'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|max:51200',
            'files' => 'nullable|array', 'files.*' => 'file|max:51200',
            'links' => 'nullable|array', 'links.*' => 'string|max:2048',
        ]);

        $filePath = $fileName = $fileUrl = null;
        $fileSkipped = false;
        $filesSkipped = false;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $storageCheck = $this->checkStorageLimit($request, $file);
            if ($storageCheck && !$storageCheck['allowed']) {
                $fileSkipped = true;
            } else {
                $fileName = $file->getClientOriginalName();
                $org = $request->attributes->get('currentOrganization');
                if ($org) {
                    $filePath = StorageDiskResolver::store($org, $file, 'deliverable-submissions/'.$deliverable->id);
                    $fileUrl = StorageDiskResolver::isS3($org) ? $filePath : '/storage/'.$filePath;
                } else {
                    $filePath = $file->store('deliverable-submissions/'.$deliverable->id, 'public');
                    $fileUrl = '/storage/'.$filePath;
                }
            }
        }

        $storedFiles = [];
        if ($request->hasFile('files')) {
            foreach ($request->file('files') as $f) {
                $sc = $this->checkStorageLimit($request, $f);
                if ($sc && !$sc['allowed']) {
                    $filesSkipped = true;
                } else {
                    $storedFiles[] = $f;
                }
            }
        }

        $submission = DeliverableSubmission::create([
            'deliverable_id' => $deliverable->id, 'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
            'version_number' => ($deliverable->submission_count ?? 0) + 1,
            'status' => 'pending',
        ]);

        if (!empty($storedFiles)) {
            $org = $request->attributes->get('currentOrganization');
            $submission->attachments()->createMany(
                collect($storedFiles)->map(function ($file) use ($deliverable, $org) {
                    if ($org) {
                        $path = StorageDiskResolver::store($org, $file, 'deliverable-submissions/'.$deliverable->id);
                        $url = StorageDiskResolver::isS3($org) ? $path : '/storage/'.$path;
                    } else {
                        $path = $file->store('deliverable-submissions/'.$deliverable->id, 'public');
                        $url = '/storage/'.$path;
                    }

                    return [
                        'submission_type' => 'deliverable',
                        'file_name' => basename($path),
                        'original_name' => $file->getClientOriginalName(), 'file_path' => $path,
                        'file_type' => $file->getMimeType(), 'file_size' => $file->getSize(),
                        'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                        'url' => $url,
                    ];
                })->toArray()
            );
        }

        if (! empty($validated['links'])) {
            $submission->attachments()->createMany(
                collect($validated['links'])->map(fn ($url) => [
                    'submission_type' => 'deliverable', 'file_name' => $url,
                    'original_name' => $url, 'attachment_type' => 'link', 'url' => $url,
                ])->toArray()
            );
        }

        $isResubmit = in_array($deliverable->status, ['rejected', 'reopened', 'rework_required']);

        $updateData = ['status' => 'submitted', 'submitted_at' => now()];
        if (in_array($deliverable->status, ['rejected', 'reopened'])) {
            foreach (['rejected_at', 'rejected_by', 'rejection_comment', 'reopened_at', 'reopened_by', 'reopen_comment', 'reopen_instructions', 'reopen_new_deadline'] as $f) {
                $updateData[$f] = null;
            }
        }
        if ($deliverable->status === 'rework_required') {
            foreach (['rework_comment', 'rework_instructions', 'rework_new_deadline', 'rework_file_path', 'rework_file_name'] as $f) {
                $updateData[$f] = null;
            }
        }
        $deliverable->stopTimer();
        $deliverable->update($updateData);

        // Increment submission count
        $deliverable->increment('submission_count');

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'user_id' => $user->id,
            'event_type' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        // Determine who to notify about the submission
        $notifyUserId = null;
        $task = $deliverable->task;
        $chain = $deliverable->delegation_chain ?? [];
        $isTransferor = false;

        foreach ($chain as $entry) {
            if ((int) $entry['delegated_by'] === (int) $user->id && $entry['status'] === 'accepted') {
                $isTransferor = true;
                break;
            }
        }

        if ($isTransferor) {
            // Transferor is submitting → notify task creator (original assigner of the parent task)
            $notifyUserId = $task?->assigned_by;
        } elseif (! empty($chain)) {
            $lastAccepted = null;
            foreach ($chain as $entry) {
                if ($entry['status'] === 'accepted') {
                    $lastAccepted = $entry;
                }
            }
            if ($lastAccepted) {
                $returnToTransferor = $lastAccepted['return_to_transferor'] ?? true;
                if ($returnToTransferor) {
                    $notifyUserId = (int) $lastAccepted['delegated_by'];
                } else {
                    $notifyUserId = $deliverable->created_by;
                }
            }
        } else {
            $creatorId = $deliverable->created_by;
            if ($creatorId && $creatorId !== $user->id) {
                $notifyUserId = $creatorId;
            }
        }

        if ($notifyUserId && (int) $notifyUserId !== (int) $user->id) {
            $this->notificationService->notify(
                (int) $notifyUserId,
                (int) $user->id,
                'deliverable_submitted',
                'deliverable',
                (int) $deliverable->id,
                'Deliverable Submitted',
                $user->name.' has submitted the deliverable "'.$deliverable->title.'" for your review.',
                '/deliveries-by-you?selectedDeliverable='.$deliverable->id
            );
        }

        // Send confirmation email to performer
        $submittedToName = User::find($notifyUserId)?->name ?? 'N/A';
        $this->notificationService->confirmAction($user, $isResubmit ? 'Resubmitted' : 'Submitted', 'deliverable', $deliverable->title, [
            'Project' => $deliverable->project?->title ?? 'N/A',
            'Task' => $deliverable->task?->title ?? 'N/A',
            'Subtask ID' => $deliverable->business_id,
            'Submitted To' => $submittedToName,
        ]);

        // Log activity
        $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
        $this->activityService->log($user->id, 'deliverable_'.$isResubmitLabel, 'You '.$isResubmitLabel.' deliverable "'.$deliverable->title.'" for review', 'deliverable', $deliverable->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'submit',
                description: ($isResubmit ? 'Resubmitted' : 'Submitted')." deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $responseMessage = 'Deliverable submitted successfully';
        if ($fileSkipped || $filesSkipped) {
            $responseMessage = $this->buildFileSkippedMessage('deliverable');
        }

        return response()->json([
            'success' => true,
            'message' => $responseMessage,
            'file_skipped' => $fileSkipped || $filesSkipped,
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role', 'creator:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            ]),
        ]);
    }

    /**
     * Approve a submitted deliverable. Only the creator or admin/manager can approve.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Deliverable  $deliverable  The deliverable to approve (must be in 'submitted' status).
     * @return JsonResponse JSON response with the approved deliverable.
     */
    public function approve(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        $nextApprover = $this->delegationService->getDeliverableApprover($deliverable);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        if (! $isCreator && ! $isAdminOrManager && ! in_array($user->role, ['team_lead']) && ! $isDelegationChain && ! $isNextApprover) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($deliverable->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted deliverables'], 422);
        }

        // Check if user is a transferor (next_approver from delegation chain with return_to_transferor=true)
        $isNextApproverTransferor = $isNextApprover && ! $isCreator && ! $isAdminOrManager;
        if ($isNextApproverTransferor) {
            $approvalChain = $deliverable->approval_chain ?? [];
            // If approval_chain is empty (legacy data), rebuild it from the delegation chain first
            if (empty($approvalChain)) {
                $approvalChain = $this->delegationService->rebuildApprovalChainForDeliverable($deliverable);
            }
            $updatedApprovalChain = [];
            foreach ($approvalChain as $aEntry) {
                if ((int) $aEntry['approver_id'] === (int) $user->id) {
                    $aEntry['status'] = 'approved';
                    $aEntry['approved_at'] = now()->toISOString();
                }
                $updatedApprovalChain[] = $aEntry;
            }

            $deliverable->update([
                'approval_chain' => $updatedApprovalChain,
                'status' => 'in_progress',
                'current_owner' => $user->id,
                'updated_by' => $user->id,
            ]);

            $this->notificationService->notify(
                (int) $user->id,
                (int) $user->id,
                'deliverable_ready_to_forward',
                'deliverable',
                (int) $deliverable->id,
                'Ready to Forward',
                'You have approved the delegated subtask "'.$deliverable->title.'". You can now submit it to the original assigner for final approval.',
                '/deliveries?selectedDeliverable='.$deliverable->id
            );

            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'event_type' => 'transferor_approved',
                'user_id' => $user->id,
                'comment' => $user->name.' (transferor) approved the submission. Sub-task is now with the transferor ready to forward to original assigner.',
            ]);

            $this->activityService->log($user->id, 'deliverable_transferor_approved', 'You approved the delegated subtask "'.$deliverable->title.'" – you can now submit it to the original assigner', 'deliverable', $deliverable->id);

            $deliverable->fresh();

            $dlvData = $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name'])->toArray();
            $dlvData['transferor_has_approved'] = true;
            $dlvData['is_assignee'] = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
            $dlvData['is_current_owner'] = true;
            $dlvData['active_outgoing_delegation'] = false;
            $dlvData['active_outgoing_delegation_id'] = null;
            $dlvData['can_submit'] = true;
            $dlvData['status'] = 'in_progress';

            return response()->json([
                'success' => true,
                'message' => 'Approved – you can now submit to the original assigner',
                'deliverable' => $dlvData,
            ]);
        }

        $deliverable->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id, 'updated_by' => $user->id]);

        // Mark the latest submission as approved
        $latestSubmission = DeliverableSubmission::where('deliverable_id', $deliverable->id)->latest()->first();
        if ($latestSubmission) {
            $latestSubmission->update([
                'status' => 'approved',
                'approved_by' => $user->id,
                'approved_at' => now(),
            ]);
        }

        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'approval', 'user_id' => $user->id]);

        if ($deliverable->assigned_to) {
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                (int) $user->id,
                'deliverable_approved',
                'deliverable',
                (int) $deliverable->id,
                'Deliverable Approved',
                'Your deliverable "'.$deliverable->title.'" has been approved.',
                '/deliveries?selectedDeliverable='.$deliverable->id
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Approved', 'deliverable', $deliverable->title, [
            'Project' => $deliverable->project?->title ?? 'N/A',
            'Task' => $deliverable->task?->title ?? 'N/A',
            'Subtask ID' => $deliverable->business_id,
            'Assigned To' => $deliverable->assignee?->name ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'deliverable_approved', 'You approved deliverable "'.$deliverable->title.'"', 'deliverable', $deliverable->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'approve',
                description: "Approved deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name']),
        ]);
    }

    /**
     * Reject a submitted deliverable with an optional comment.
     *
     * @param  Request  $request  Input: comment (optional).
     * @param  Deliverable  $deliverable  The deliverable to reject (must be in 'submitted' status).
     * @return JsonResponse JSON response with the rejected deliverable.
     */
    public function reject(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        $nextApprover = $this->delegationService->getDeliverableApprover($deliverable);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager', 'team_lead']) && ! $isDelegationChain && ! $isNextApprover) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($deliverable->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reject submitted deliverables'], 422);
        }

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $deliverable->update([
            'status' => 'rejected', 'rejected_at' => now(), 'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
            'updated_by' => $user->id,
        ]);

        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'rejected', 'user_id' => $user->id, 'comment' => $validated['comment'] ?? null]);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "'.$deliverable->title.'" has been rejected. Please review and resubmit.';
            if (! empty($validated['comment'])) {
                $msg .= ' Reason: '.$validated['comment'];
            }
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                (int) $user->id,
                'deliverable_rejected',
                'deliverable',
                (int) $deliverable->id,
                'Deliverable Rejected',
                $msg,
                '/deliveries?selectedDeliverable='.$deliverable->id
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Rejected', 'deliverable', $deliverable->title, [
            'Project' => $deliverable->project?->title ?? 'N/A',
            'Task' => $deliverable->task?->title ?? 'N/A',
            'Subtask ID' => $deliverable->business_id,
            'Assigned To' => $deliverable->assignee?->name ?? 'N/A',
            'Reason' => $validated['comment'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'deliverable_rejected', 'You rejected deliverable "'.$deliverable->title.'"', 'deliverable', $deliverable->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'reject',
                description: "Rejected deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable rejected',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'rejectedBy:id,name']),
        ]);
    }

    /**
     * Reopen a submitted deliverable for revision.
     *
     * Allows the creator or admin/manager to reopen a deliverable with revision instructions,
     * a new deadline, and an optional file attachment.
     *
     * @param  Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  Deliverable  $deliverable  The deliverable to reopen.
     * @return JsonResponse JSON response with the reopened deliverable.
     */
    public function reopen(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager', 'team_lead']) && ! $isDelegationChain) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (! in_array($deliverable->status, ['submitted', 'approved'])) {
            return response()->json(['success' => false, 'message' => 'Can only reopen submitted or approved deliverables'], 422);
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
        $fileSkipped = false;
        if ($request->hasFile('files')) {
            $uploadedFiles = $request->file('files');
        } elseif ($request->hasFile('file')) {
            $uploadedFiles = [$request->file('file')];
        }

        $org = $request->attributes->get('currentOrganization');
        foreach ($uploadedFiles as $uploadedFile) {
            if ($uploadedFile && $uploadedFile->isValid()) {
                $storageCheck = $this->checkStorageLimit($request, $uploadedFile);
                if ($storageCheck && !$storageCheck['allowed']) {
                    $fileSkipped = true;
                    continue;
                }
                $fileNames[] = $uploadedFile->getClientOriginalName();
                if ($org) {
                    $filePaths[] = StorageDiskResolver::store($org, $uploadedFile, 'deliverable-reopen/'.$deliverable->id);
                } else {
                    $filePaths[] = $uploadedFile->store('deliverable-reopen/'.$deliverable->id, 'public');
                }
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
        }
        if (! empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $deliverable->update($updateData);

        // Increment reopen count
        $deliverable->increment('reopen_count');

        // Update latest submission if reopening from approved
        if ($deliverable->submitted_at) {
            $latestSubmission = DeliverableSubmission::where('deliverable_id', $deliverable->id)->latest()->first();
            if ($latestSubmission && $latestSubmission->status !== 'reopened') {
                $latestSubmission->update([
                    'status' => 'reopened',
                    'reopened_by' => $user->id,
                    'reopened_at' => now(),
                    'reopen_reason' => $reopenComment,
                ]);
            }
        }

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'event_type' => 'reopened', 'user_id' => $user->id,
            'comment' => $reopenComment, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $reopenReasonText = $validated['reopen_reason'];
        if (! empty($validated['reopen_reason_detail']) && $validated['reopen_reason'] !== 'Other') {
            $reopenReasonText .= ': '.$validated['reopen_reason_detail'];
        }

        if ($deliverable->assigned_to) {
            $msg = 'Your subtask "'.$deliverable->title.'" has been reopened. Reason: '.$reopenReasonText;
            if (! empty($validated['instructions'])) {
                $msg .= ' Instructions: '.$validated['instructions'];
            }
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                (int) $user->id,
                'deliverable_reopened',
                'deliverable',
                (int) $deliverable->id,
                'Subtask Reopened',
                $msg,
                '/deliveries?selectedDeliverable='.$deliverable->id
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Reopened', 'deliverable', $deliverable->title, [
            'Project' => $deliverable->project?->title ?? 'N/A',
            'Task' => $deliverable->task?->title ?? 'N/A',
            'Subtask ID' => $deliverable->business_id,
            'Assigned To' => $deliverable->assignee?->name ?? 'N/A',
            'Reason' => $reopenReasonText,
            'Instructions' => $validated['instructions'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'deliverable_reopened', 'You reopened subtask "'.$deliverable->title.'". Reason: '.$reopenReasonText, 'deliverable', $deliverable->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'reopen',
                description: "Reopened subtask {$deliverable->title}. Reason: {$reopenReasonText}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $reopenMessage = 'Subtask reopened successfully';
        if ($fileSkipped) {
            $reopenMessage = $this->buildFileSkippedMessage('deliverable');
        }

        return response()->json([
            'success' => true,
            'message' => $reopenMessage,
            'file_skipped' => $fileSkipped,
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'approvedBy:id,name', 'reopenedBy:id,name'])->latest(),
            ]),
        ]);
    }

    /**
     * Self-approve a deliverable (user is both creator and assignee).
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Deliverable  $deliverable  The deliverable to approve.
     * @return JsonResponse JSON response with the approved deliverable.
     */
    public function selfApprove(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ((int) $deliverable->created_by !== (int) $user->id || (int) $deliverable->assigned_to !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($deliverable->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted deliverables'], 422);
        }

        $deliverable->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id]);
        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'approval', 'user_id' => $user->id]);

        try {
            $this->auditService->log(
                module: 'deliverable_management',
                action: 'self_approve',
                description: "Self-approved deliverable {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name']),
        ]);
    }

    /**
     * Mark a self-created deliverable for rework (user is both creator and assignee).
     *
     * @param  Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  Deliverable  $deliverable  The deliverable to mark for rework.
     * @return JsonResponse JSON response with the rework-updated deliverable.
     */
    public function selfRework(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ((int) $deliverable->created_by !== (int) $user->id || (int) $deliverable->assigned_to !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($deliverable->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only rework submitted deliverables'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
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
        $fileSkipped = false;
        if ($request->hasFile('files')) {
            $uploadedFiles = $request->file('files');
        } elseif ($request->hasFile('file')) {
            $uploadedFiles = [$request->file('file')];
        }

        $org = $request->attributes->get('currentOrganization');
        foreach ($uploadedFiles as $uploadedFile) {
            if ($uploadedFile && $uploadedFile->isValid()) {
                $storageCheck = $this->checkStorageLimit($request, $uploadedFile);
                if ($storageCheck && !$storageCheck['allowed']) {
                    $fileSkipped = true;
                    continue;
                }
                $fileNames[] = $uploadedFile->getClientOriginalName();
                if ($org) {
                    $filePaths[] = StorageDiskResolver::store($org, $uploadedFile, 'deliverable-rework/'.$deliverable->id);
                } else {
                    $filePaths[] = $uploadedFile->store('deliverable-rework/'.$deliverable->id, 'public');
                }
            }
        }

        $filePath = ! empty($filePaths) ? implode(',', $filePaths) : null;
        $fileName = ! empty($fileNames) ? implode(', ', $fileNames) : null;

        $updateData = [
            'status' => 'rework_required', 'rework_comment' => $validated['comment'] ?? null,
            'rework_instructions' => $validated['instructions'] ?? null,
            'rework_link' => $validated['link'] ?? null,
        ];
        if (! empty($validated['new_deadline'])) {
            $updateData['rework_new_deadline'] = $validated['new_deadline'];
        }
        if (! empty($filePath)) {
            $updateData['rework_file_path'] = $filePath;
            $updateData['rework_file_name'] = $fileName;
        }

        $deliverable->update($updateData);
        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'event_type' => 'rework', 'user_id' => $user->id,
            'comment' => $validated['comment'] ?? null, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $reworkMessage = 'Deliverable marked for rework';
        if ($fileSkipped) {
            $reworkMessage = $this->buildFileSkippedMessage('deliverable');
        }

        return response()->json([
            'success' => true,
            'message' => $reworkMessage,
            'file_skipped' => $fileSkipped,
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
        ]);
    }

    /**
     * Download the file attached to a deliverable submission.
     *
     * @param  DeliverableSubmission  $submission  The submission containing the file.
     * @return BinaryFileResponse|JsonResponse File download or error.
     */
    public function downloadSubmissionFile(DeliverableSubmission $submission)
    {
        $user = request()->user();
        if ($user) {
            $deliverable = $submission->deliverable;
            $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
            $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;

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
     * Get the most recent submission for a deliverable.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Deliverable  $deliverable  The deliverable to get the latest submission for.
     * @return JsonResponse JSON response with the latest submission.
     */
    public function latestSubmission(Request $request, Deliverable $deliverable)
    {
        $submission = DeliverableSubmission::where('deliverable_id', $deliverable->id)
            ->with(['submittedBy:id,name,email', 'attachments'])->latest()->first();

        return response()->json(['success' => true, 'submission' => $submission]);
    }

    /**
     * Update an existing deliverable submission (notes, files, links).
     */
    public function updateSubmission(Request $request, DeliverableSubmission $submission)
    {
        $user = $request->user();
        $deliverable = $submission->deliverable;

        $isSubmitter = (int) $submission->submitted_by === (int) $user->id;
        $isAuthorizedRole = in_array($user->role, ['admin', 'manager', 'team_lead']);

        if (! $isSubmitter && ! $isAuthorizedRole) {
            return response()->json(['success' => false, 'message' => 'Unauthorized to edit this submission.'], 403);
        }

        if ($deliverable->has_edited_submission) {
            return response()->json(['success' => false, 'message' => 'Submission can only be edited once.'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|max:51200',
            'files' => 'nullable|array',
            'files.*' => 'file|max:51200',
            'links' => 'nullable|array',
            'links.*' => 'string|max:2048',
        ]);

        if (array_key_exists('comment', $validated)) {
            $submission->comment = $validated['comment'];
        }

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $submission->file_name = $file->getClientOriginalName();
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $submission->file_path = StorageDiskResolver::store($org, $file, 'deliverable-submissions/'.$deliverable->id);
            } else {
                $submission->file_path = $file->store('deliverable-submissions/'.$deliverable->id, 'public');
            }
        }

        $submission->save();
        $deliverable->update(['has_edited_submission' => true]);

        if ($request->hasFile('files')) {
            $org = $request->attributes->get('currentOrganization');
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(function ($file) use ($deliverable, $org) {
                    if ($org) {
                        $path = StorageDiskResolver::store($org, $file, 'deliverable-submissions/'.$deliverable->id);
                        $url = StorageDiskResolver::isS3($org) ? $path : '/storage/'.$path;
                    } else {
                        $path = $file->store('deliverable-submissions/'.$deliverable->id, 'public');
                        $url = '/storage/'.$path;
                    }

                    return [
                        'submission_type' => 'deliverable',
                        'file_name' => basename($path),
                        'original_name' => $file->getClientOriginalName(),
                        'file_path' => $path,
                        'file_type' => $file->getMimeType(),
                        'file_size' => $file->getSize(),
                        'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                        'url' => $url,
                    ];
                })->toArray()
            );
        }

        if (! empty($validated['links'])) {
            $submission->attachments()->createMany(
                collect($validated['links'])->map(fn ($url) => [
                    'submission_type' => 'deliverable',
                    'file_name' => $url,
                    'original_name' => $url,
                    'attachment_type' => 'link',
                    'url' => $url,
                ])->toArray()
            );
        }

        // Trigger Notification to Stakeholders
        $stakeholderIds = array_unique(array_filter([
            $deliverable->assigned_to,
            $deliverable->created_by,
            $deliverable->task?->assigned_by,
        ]));

        foreach ($stakeholderIds as $targetUserId) {
            if ((int) $targetUserId !== (int) $user->id) {
                Notification::create([
                    'user_id' => $targetUserId,
                    'sender_user_id' => $user->id,
                    'type' => 'deliverable_updated',
                    'related_module' => 'deliverable',
                    'related_id' => $deliverable->id,
                    'title' => 'Delivery Submission Updated',
                    'message' => "{$user->name} updated the delivery submission for \"{$deliverable->title}\".",
                    'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
                ]);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Delivery submission updated successfully',
            'submission' => $submission->fresh(['submittedBy:id,name,email', 'attachments']),
        ]);
    }

    /**
     * Mark all unviewed changes on a deliverable as read.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Deliverable  $deliverable  The deliverable whose changes to mark.
     * @return JsonResponse JSON response confirming changes marked.
     */
    public function markChangesRead(Request $request, Deliverable $deliverable)
    {
        $deliverable->changes()->where('is_viewed', false)->update(['is_viewed' => true]);

        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    /**
     * Download or view an attachment from a submission. Supports both file and link types.
     *
     * @param  Request  $request  Query parameter 'action' can be 'download' to force download.
     * @param  SubmissionAttachment  $attachment  The attachment to retrieve.
     * @return BinaryFileResponse|RedirectResponse|JsonResponse File, redirect, or error.
     */
    public function downloadAttachment(Request $request, SubmissionAttachment $attachment)
    {
        $user = $this->resolveDocAuth($request);
        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }
        if ($attachment->attachment_type === 'link') {
            return redirect($attachment->url);
        }
        $resolved = \App\Services\FileStorageService::resolveFile($attachment->file_path);
        if (! $resolved) {
            \Log::error('Attachment file not found on disk', [
                'file_path' => $attachment->file_path,
                'disk_root' => storage_path('app/public'),
                'attachment_id' => $attachment->id,
            ]);

            return response()->json(['success' => false, 'message' => 'File not found on disk'], 404);
        }

        $filename = $attachment->original_name ?? basename($resolved['path']);

        if ($request->query('action') === 'download') {
            return Storage::disk($resolved['disk'])->download($resolved['path'], $filename);
        }

        return Storage::disk($resolved['disk'])->response($resolved['path'], ['Cache-Control' => 'public, max-age=3600']);
    }

    /**
     * Reorder deliverables by updating their sort_order values in bulk.
     *
     * @param  Request  $request  Input: items[] with id and sort_order.
     * @return JsonResponse JSON response confirming reorder.
     */
    public function reorder(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:deliverables,id', 'items.*.sort_order' => 'required|integer|min:0']);
        $ids = [];
        $cases = [];
        $bindings = [];
        foreach ($request->items as $i => $item) {
            $ids[] = $item['id'];
            $cases[] = 'WHEN ? THEN ?';
            $bindings[] = $item['id'];
            $bindings[] = $item['sort_order'];
        }
        if (! empty($ids)) {
            $placeholders = implode(', ', array_fill(0, count($ids), '?'));
            DB::statement('UPDATE deliverables SET sort_order = CASE id '.implode(' ', $cases)." END WHERE id IN ($placeholders)", [...$bindings, ...$ids]);
        }

        return response()->json(['success' => true, 'message' => 'Deliverables reordered successfully']);
    }

    // ─── Acknowledge ───────────────────────────────────────────

    /**
     * Acknowledge a deliverable assignment (pending → in_progress).
     */
    public function acknowledge(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isAuthorizedRole = in_array($user->role, ['admin', 'manager', 'team_lead']);
        if (! $isAssignee && ! $isAuthorizedRole) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (! in_array($deliverable->status, ['pending', 'reopened'])) {
            return response()->json(['success' => false, 'message' => 'Can only acknowledge pending or reopened deliverables'], 422);
        }

        $deliverable->update([
            'status' => 'in_progress',
            'acknowledged_at' => now(),
            'acknowledged_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        $deliverable->startTimer();

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'acknowledged',
            'user_id' => $user->id,
            'comment' => 'Acknowledged and started working',
        ]);

        $this->activityService->log($user->id, 'deliverable_acknowledged', 'You acknowledged deliverable "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable acknowledged',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
        ]);
    }

    // ─── Timer ─────────────────────────────────────────────────

    /**
     * Pause the deliverable timer.
     */
    public function pause(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);
        if (! $isAssignee && ! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to pause/resume this subtask.'], 403);
        }
        $validated = $request->validate([
            'reason' => 'nullable|string|max:64',
            'reason_detail' => 'nullable|string|max:500',
        ]);

        if ($deliverable->timer_state === 'running') {
            $deliverable->pauseTimer($validated['reason'] ?? null, $validated['reason_detail'] ?? null, false, $user->id);
        }
        $deliverable->update(['status' => 'paused', 'paused_by' => $user->id, 'paused_at' => now(), 'updated_by' => $user->id]);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'paused',
            'user_id' => $user->id,
            'comment' => 'Timer paused'.($validated['reason'] ? ' — '.$validated['reason'] : ''),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Timer paused',
            'deliverable' => $deliverable->fresh(),
        ]);
    }

    /**
     * Resume the deliverable timer.
     */
    public function continueTimer(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);
        if (! $isAssignee && ! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to pause/resume this subtask.'], 403);
        }
        if ($deliverable->timer_state !== 'paused') {
            return response()->json(['success' => false, 'message' => 'Timer is not paused'], 422);
        }

        $deliverable->resumeTimer($user->id);
        $deliverable->update(['status' => 'in_progress', 'updated_by' => $user->id]);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'resumed',
            'user_id' => $user->id,
            'comment' => 'Timer resumed',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Timer resumed',
            'deliverable' => $deliverable->fresh(),
        ]);
    }

    /**
     * Pause a deliverable as the assigner (creator/admin/manager).
     * Locks the assignee from resuming work.
     */
    public function assignerPause(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Only the assigner can pause this deliverable'], 403);
        }

        $updateData = [
            'assigner_paused' => true,
            'assigner_paused_at' => now(),
            'assigner_paused_by' => $user->id,
            'updated_by' => $user->id,
        ];

        if ($deliverable->timer_state === 'running') {
            $deliverable->pauseTimer('Other', null, false, $user->id);
            $updateData['paused_by'] = $user->id;
            $updateData['paused_at'] = now();
        }

        $deliverable->update($updateData);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'assigner_paused',
            'comment' => 'Assigner paused the deliverable',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable paused by assigner',
            'deliverable' => $deliverable->fresh(),
        ]);
    }

    /**
     * Resume a deliverable as the assigner (creator/admin/manager).
     * Unlocks the assignee to resume work.
     */
    public function assignerResume(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Only the assigner can resume this deliverable'], 403);
        }

        $deliverable->update([
            'assigner_paused' => false,
            'assigner_paused_at' => null,
            'assigner_paused_by' => null,
            'updated_by' => $user->id,
        ]);

        if ($deliverable->timer_state === 'paused') {
            $deliverable->resumeTimer($user->id);
        }

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'assigner_resumed',
            'comment' => 'Assigner resumed the deliverable',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable resumed by assigner',
            'deliverable' => $deliverable->fresh(),
        ]);
    }

    /**
     * Get live timer state for a deliverable.
     */
    public function timer(Request $request, Deliverable $deliverable)
    {
        return response()->json([
            'success' => true,
            'timer' => [
                'state' => $deliverable->timer_state,
                'work_started_at' => $deliverable->work_started_at?->format('Y-m-d\TH:i:s'),
                'total_work_seconds' => $deliverable->getCurrentWorkSeconds(),
                'elapsed_seconds' => $deliverable->getCurrentElapsedSeconds(),
                'pause_count' => $deliverable->pause_count ?? 0,
                'total_pause_seconds' => $deliverable->total_pause_seconds ?? 0,
                'resume_count' => $deliverable->resume_count ?? 0,
            ],
        ]);
    }

    /**
     * Get pause session history for a deliverable.
     */
    public function timerSessions(Request $request, Deliverable $deliverable)
    {
        $sessions = $deliverable->pauseSessions()
            ->with(['user:id,name', 'resumedByUser:id,name'])
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'reason' => $s->reason,
                'reason_label' => $s->reason_label,
                'reason_detail' => $s->reason_detail,
                'paused_at' => $s->paused_at?->format('Y-m-d\TH:i:s'),
                'resumed_at' => $s->resumed_at?->format('Y-m-d\TH:i:s'),
                'duration_seconds' => $s->duration_seconds,
                'formatted_duration' => $s->formatted_duration,
                'user' => $s->user ? ['id' => $s->user->id, 'name' => $s->user->name] : null,
                'resumed_by_user' => $s->resumedByUser ? ['id' => $s->resumedByUser->id, 'name' => $s->resumedByUser->name] : null,
                'is_auto_paused' => $s->is_auto_paused,
            ]);

        return response()->json(['success' => true, 'sessions' => $sessions]);
    }

    // ─── File Management ───────────────────────────────────────

    /**
     * Upload a file to a deliverable.
     */
    public function uploadFile(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        if (! $isCreator && ! $isAssignee && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'file' => 'required|file|max:51200',
            'name' => 'nullable|string|max:255',
        ]);

        $file = $request->file('file');

        $storageCheck = $this->checkStorageLimit($request, $file);
        if ($storageCheck && !$storageCheck['allowed']) {
            return response()->json([
                'success' => true,
                'message' => $this->buildFileSkippedMessage('deliverable'),
                'file' => null,
                'file_skipped' => true,
                'storage_warning' => $storageCheck['message'],
            ], 200);
        }

        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            $path = StorageDiskResolver::store($org, $file, 'deliverable-files/'.$deliverable->id);
            $fileUrl = StorageDiskResolver::isS3($org) ? $path : '/storage/'.$path;
        } else {
            $path = $file->store('deliverable-files/'.$deliverable->id, 'public');
            $fileUrl = '/storage/'.$path;
        }
        try { $this->trackFileUpload($request, 'attachments', $fileUrl, $file->getClientOriginalName(), $file->getMimeType(), $file->getSize()); } catch (\Throwable $e) { \Log::warning('trackFileUpload failed: '.$e->getMessage()); }

        $name = $request->input('name', $file->getClientOriginalName());

        $deliverableFile = $deliverable->files()->create([
            'name' => $name,
            'url' => $fileUrl,
        ]);

        if ($org) {
            $deliverableFile->url = StorageDiskResolver::resolveUrl($org, $deliverableFile->url);
        }

        $deliverable->update(['updated_by' => $user->id]);

        try {
            $this->auditService->log(
                module: 'project_management',
                action: 'create',
                description: "Uploaded file \"{$name}\" to subtask \"{$deliverable->title}\"",
                user: $user,
                entityType: 'DeliverableFile',
                entityId: $deliverableFile->id,
                newValues: ['file_name' => $name, 'file_url' => $fileUrl],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log deliverable file upload audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'File uploaded successfully',
            'file' => $deliverableFile,
        ], 201);
    }

    /**
     * Add a link to a deliverable.
     */
    public function addLink(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        if (! $isCreator && ! $isAssignee && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'name' => 'nullable|string|max:255',
        ]);

        $linkName = $validated['name'] ?? $validated['url'];
        $deliverableFile = $deliverable->files()->create([
            'name' => $linkName,
            'url' => $validated['url'],
        ]);

        $deliverable->update(['updated_by' => $user->id]);

        try {
            $this->auditService->log(
                module: 'project_management',
                action: 'create',
                description: "Added link \"{$linkName}\" to subtask \"{$deliverable->title}\"",
                user: $user,
                entityType: 'DeliverableFile',
                entityId: $deliverableFile->id,
                newValues: ['link_name' => $linkName, 'link_url' => $validated['url']],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log deliverable link add audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Link added successfully',
            'file' => $deliverableFile,
        ], 201);
    }

    /**
     * Rename a deliverable file/link.
     */
    public function renameFile(Request $request, Deliverable $deliverable, DeliverableFile $file)
    {
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate(['name' => 'required|string|max:255']);
        $file->update(['name' => $validated['name']]);

        return response()->json(['success' => true, 'message' => 'File renamed', 'file' => $file->fresh()]);
    }

    /**
     * Delete a deliverable file/link.
     */
    public function deleteFile(Request $request, Deliverable $deliverable, DeliverableFile $file)
    {
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id;
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $fileName = $file->name;
        $org = $request->attributes->get('currentOrganization');
        if ($org && $file->url) {
            StorageDiskResolver::delete($org, $file->url);
        } elseif ($file->url && str_starts_with($file->url, '/storage/') && Storage::disk('public')->exists(str_replace('/storage/', '', $file->url))) {
            Storage::disk('public')->delete(str_replace('/storage/', '', $file->url));
        }

        $file->delete();
        $deliverable->update(['updated_by' => $user->id]);

        $this->auditService->log(
            'deliverables', 'delete',
            "Deleted file \"{$fileName}\" from deliverable \"{$deliverable->title}\"",
            $user, 'deliverable_file', $file->id,
            ['file_name' => $fileName, 'deliverable_id' => $deliverable->id, 'deliverable_title' => $deliverable->title],
            null, 'success'
        );

        return response()->json(['success' => true, 'message' => 'File deleted']);
    }

    /**
     * Reorder deliverable files.
     */
    public function reorderFiles(Request $request, Deliverable $deliverable)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:deliverable_files,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        foreach ($request->items as $item) {
            DeliverableFile::where('id', $item['id'])->where('deliverable_id', $deliverable->id)
                ->update(['sort_order' => $item['sort_order']]);
        }

        return response()->json(['success' => true, 'message' => 'Files reordered']);
    }

    // ─── Notes ─────────────────────────────────────────────────

    /**
     * Get the current user's personal note on a deliverable.
     */
    public function myNote(Request $request, Deliverable $deliverable)
    {
        $note = DeliverableUserNote::where('deliverable_id', $deliverable->id)
            ->where('user_id', $request->user()->id)
            ->first();

        return response()->json([
            'success' => true,
            'note' => $note,
            'notes' => $note ? [$note] : [],
        ]);
    }

    /**
     * Create or update the current user's personal note on a deliverable.
     */
    public function storeNote(Request $request, Deliverable $deliverable)
    {
        $validated = $request->validate(['note' => 'nullable|string|max:5000']);

        $note = DeliverableUserNote::updateOrCreate(
            ['deliverable_id' => $deliverable->id, 'user_id' => $request->user()->id],
            ['note' => $validated['note'] ?? null]
        );

        return response()->json(['success' => true, 'message' => 'Note saved', 'note' => $note]);
    }

    /**
     * Delete the current user's personal note on a deliverable.
     */
    public function destroyNote(Request $request, Deliverable $deliverable, DeliverableUserNote $note)
    {
        if ((int) $note->user_id !== (int) $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $note->delete();

        return response()->json(['success' => true, 'message' => 'Note deleted']);
    }

    /**
     * Send a notification to the deliverable assignee about assignment.
     *
     * @param  Deliverable  $deliverable  The deliverable model.
     * @param  User  $sender  The user performing the action.
     * @param  string  $type  Notification type key.
     * @param  string  $title  Notification title.
     * @param  string|null  $customMessage  Optional custom message body.
     */
    private function sendDeliverableNotification(Deliverable $deliverable, User $sender, string $type, string $title, ?string $customMessage = null): void
    {
        if (! $deliverable->assigned_to || (int) $deliverable->assigned_to === (int) $sender->id) {
            return;
        }

        $taskTitle = $deliverable->task?->title ?? '';
        $taskCode = $deliverable->task?->business_id ?? '';
        $projectName = $deliverable->project?->title ?? '';
        $dueDate = $deliverable->end_date ? \Carbon\Carbon::parse($deliverable->end_date)->format('M d, Y H:i') : null;

        $message = $customMessage ?? $sender->name.' assigned a new subtask "'.$deliverable->title.'" to you.';
        if ($projectName) {
            $message .= ' Project: '.$projectName.'.';
        }
        if ($taskTitle) {
            $message .= ' Task: '.$taskTitle.'.';
        }
        if ($taskCode) {
            $message .= ' Task ID: '.$taskCode.'.';
        }
        if ($dueDate) {
            $message .= ' Due Date: '.$dueDate.'.';
        }

        $this->notificationService->notify(
            (int) $deliverable->assigned_to,
            (int) $sender->id,
            $type,
            'deliverable',
            (int) $deliverable->id,
            $title,
            $message,
            '/deliveries?selectedDeliverable='.$deliverable->id
        );
    }

    /**
     * Send a notification about deliverable updates, or an assignment notification if assignee changed.
     *
     * @param  Deliverable  $deliverable  The updated deliverable.
     * @param  User  $updater  The user who made the update.
     * @param  array  $changes  Array of changes made to the deliverable.
     */
    private function sendDeliverableUpdateNotification(Deliverable $deliverable, User $updater, array $changes): void
    {
        $formattedChanges = array_map(fn ($c) => [
            'field' => $c['label'] ?? ucwords(str_replace('_', ' ', $c['field_name'])),
            'old' => $c['old_value'] ?? '',
            'new' => $c['new_value'] ?? '',
        ], $changes);

        if (isset($changes[0]) && $changes[0]['field_name'] === 'assigned_to') {
            $this->sendDeliverableNotification($deliverable, $updater, 'deliverable_assigned', 'Deliverable Assigned');
        } elseif ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $updater->id) {
            $changeMsg = 'The deliverable "'.$deliverable->title.'" has been updated by '.$updater->name.'.';
            if (count($changes) > 0) {
                $changeMsg .= ' '.count($changes).' change(s) were made.';
            }
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                (int) $updater->id,
                'deliverable_updated',
                'deliverable',
                (int) $deliverable->id,
                'Deliverable Updated',
                $changeMsg,
                '/deliveries?selectedDeliverable='.$deliverable->id,
                ! empty($formattedChanges) ? $formattedChanges : null
            );
        }
    }

    /**
     * List all deliverables with role-based visibility (read-only).
     *
     * Similar to allTasks() but scoped to deliverables.
     * - Admin: All deliverables globally
     * - Manager: All deliverables where any participant (assignee/creator) is in the same team(s)
     * - Team Lead: All deliverables where assigned_to/created_by is in the team(s) they lead or are member of
     * - Member: All deliverables where assigned_to = user OR created_by = user
     * - Guest: Empty
     *
     * @param  Request  $request  Query parameters: search, status, time_filter, due_today.
     * @return JsonResponse JSON response with deliverable list.
     */
    public function allDeliverables(Request $request)
    {
        $user = $request->user();
        $role = $user->role;

        $isDueTodayFilter = $request->input('status') === 'due_today';
        $isPendingFilter = $request->input('status') === 'pending';
        $statusFilter = $request->input('status');
        $search = $request->input('search');
        $timeFilter = $request->input('time_filter');

        $query = Deliverable::query();

        // ── Role-based visibility ──
        switch ($role) {
            case 'admin':
            case 'manager':
                // Admin and Manager see everything — no scope filter
                break;

            case 'team_lead':
            case 'teamlead':
                // Team Lead sees deliverables within their team scope
                $ledTeamIds = $user->ledTeams()->pluck('teams.id');
                $memberTeamIds = $user->teams()->pluck('teams.id');
                $allTeamIds = $ledTeamIds->merge($memberTeamIds)->unique();

                if ($allTeamIds->isNotEmpty()) {
                    $scopeUserIds = DB::table('team_user')
                        ->whereIn('team_id', $allTeamIds)
                        ->pluck('user_id')
                        ->push($user->id)
                        ->unique();

                    $query->where(function ($q) use ($scopeUserIds) {
                        $q->whereIn('assigned_to', $scopeUserIds)
                            ->orWhereIn('created_by', $scopeUserIds);
                    });
                } else {
                    // No teams — only own deliverables
                    $query->where(function ($q) use ($user) {
                        $q->where('assigned_to', $user->id)
                            ->orWhere('created_by', $user->id);
                    });
                }
                break;

            case 'guest':
                // Guests cannot access All Sub-Tasks
                return response()->json(['data' => collect(), 'total' => 0]);

            default:
                // Member: only deliverables directly assigned to or created by the member
                $query->where(function ($q) use ($user) {
                    $q->where('assigned_to', $user->id)
                        ->orWhere('created_by', $user->id);
                });
                break;
        }

        // ── Apply filters ──
        $userIds = $request->input('user_id', $request->input('user_ids', $request->input('assigned_to', [])));
        if (is_string($userIds) && str_contains($userIds, ',')) {
            $userIds = explode(',', $userIds);
        }
        if (! is_array($userIds) && ! empty($userIds)) {
            $userIds = [$userIds];
        }
        if (! empty($userIds) && is_array($userIds)) {
            $userIds = array_values(array_filter(array_map('intval', $userIds)));
            if (! empty($userIds)) {
                $query->whereIn('assigned_to', $userIds);
            }
        }

        $projectIds = $request->input('project_id', $request->input('project_ids', []));
        if (is_string($projectIds) && str_contains($projectIds, ',')) {
            $projectIds = explode(',', $projectIds);
        }
        if (! is_array($projectIds) && ! empty($projectIds)) {
            $projectIds = [$projectIds];
        }
        if (! empty($projectIds) && is_array($projectIds)) {
            $projectIds = array_values(array_filter(array_map('intval', $projectIds)));
            if (! empty($projectIds)) {
                $query->whereIn('project_id', $projectIds);
            }
        }

        $rawStatuses = $request->input('status', $request->input('statuses', []));
        if (is_string($rawStatuses) && str_contains($rawStatuses, ',')) {
            $rawStatuses = explode(',', $rawStatuses);
        }
        if (! is_array($rawStatuses) && ! empty($rawStatuses)) {
            $rawStatuses = [$rawStatuses];
        }
        if (is_array($rawStatuses) && ! empty($rawStatuses)) {
            $expandedStatuses = [];
            $hasDueToday = false;
            $hasTransferred = false;
            foreach ($rawStatuses as $st) {
                $st = trim((string) $st);
                if ($st === 'due_today') {
                    $hasDueToday = true;
                } elseif ($st === 'transferred') {
                    $hasTransferred = true;
                } elseif ($st === 'pending') {
                    $expandedStatuses = array_merge($expandedStatuses, ['pending', 'planned', 'Planning', 'Planned']);
                } elseif ($st === 'in_progress') {
                    $expandedStatuses = array_merge($expandedStatuses, ['in_progress', 'In Progress', 'in-progress']);
                } elseif ($st === 'paused') {
                    $expandedStatuses = array_merge($expandedStatuses, ['paused', 'pause', 'Pause']);
                } elseif ($st === 'rejected' || $st === 'declined') {
                    $expandedStatuses[] = 'rejected';
                    $expandedStatuses[] = 'declined';
                } elseif ($st === 'abandoned') {
                    $expandedStatuses[] = 'abandoned';
                    $expandedStatuses[] = 'abandon_requested';
                } elseif ($st === 'approved') {
                    $expandedStatuses[] = 'approved';
                    $expandedStatuses[] = 'completed';
                } elseif (! empty($st)) {
                    $expandedStatuses[] = $st;
                }
            }
            $expandedStatuses = array_values(array_unique($expandedStatuses));
            $query->where(function ($sq) use ($expandedStatuses, $hasDueToday, $hasTransferred) {
                $hasCondition = false;
                if (! empty($expandedStatuses)) {
                    $sq->whereIn('status', $expandedStatuses);
                    $hasCondition = true;
                }
                if ($hasDueToday) {
                    if ($hasCondition) {
                        $sq->orWhere(function ($dq) {
                            $dq->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses());
                        });
                    } else {
                        $sq->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses());
                        $hasCondition = true;
                    }
                }
                if ($hasTransferred) {
                    if ($hasCondition) {
                        $sq->orWhere(function ($tq) {
                            $tq->whereNotNull('delegation_chain')->where('delegation_chain', '!=', '[]');
                        });
                    } else {
                        $sq->whereNotNull('delegation_chain')->where('delegation_chain', '!=', '[]');
                    }
                }
            });
        } elseif (is_string($rawStatuses) && ! empty($rawStatuses)) {
            if ($rawStatuses === 'due_today') {
                $query->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses());
            } elseif ($rawStatuses === 'transferred') {
                $query->whereNotNull('delegation_chain')->where('delegation_chain', '!=', '[]');
            } elseif ($rawStatuses === 'pending') {
                $query->whereIn('status', ['pending', 'planned', 'Planning', 'Planned']);
            } elseif ($rawStatuses === 'in_progress') {
                $query->whereIn('status', ['in_progress', 'In Progress', 'in-progress']);
            } elseif ($rawStatuses === 'paused') {
                $query->whereIn('status', ['paused', 'pause', 'Pause']);
            } elseif ($rawStatuses === 'rejected' || $rawStatuses === 'declined') {
                $query->whereIn('status', ['rejected', 'declined']);
            } elseif ($rawStatuses === 'abandoned') {
                $query->whereIn('status', ['abandoned', 'abandon_requested']);
            } elseif ($rawStatuses === 'approved') {
                $query->whereIn('status', ['approved', 'completed']);
            } else {
                $query->where('status', $rawStatuses);
            }
        }

        if ($search) {
            $query->where(function ($sq) use ($search) {
                $sq->where('title', 'like', '%'.$search.'%')
                    ->orWhereHas('assignee', fn ($aq) => $aq->where('name', 'like', '%'.$search.'%'))
                    ->orWhereHas('creator', fn ($cq) => $cq->where('name', 'like', '%'.$search.'%'))
                    ->orWhereHas('task', fn ($tq) => $tq->where('title', 'like', '%'.$search.'%'));
            });
        }

        if ($timeFilter) {
            $query->where('updated_at', '>=', now()->subDays((int) $timeFilter));
        }

        if ($request->filled('start_date')) {
            $query->whereDate('start_date', '>=', $request->input('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('end_date', '<=', $request->input('end_date'));
        }

        $query->with([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,role',
            'task:id,title,project_id',
            'task.project:id,title',
            'latestSubmission',
            'approvedBy:id,name,role',
            'rejectedBy:id,name,role',
            'reopenedBy:id,name,role',
            'updatedBy:id,name,role',
        ])
            ->orderBy('created_at', 'desc')
            ->orderBy('id', 'desc');

        if ($request->filled('per_page') || $request->filled('limit')) {
            $query->limit((int) ($request->input('per_page') ?: $request->input('limit')));
        }

        $deliverables = $query->get();

        // Transform to add submission_status field for frontend Progress column
        $deliverables->transform(function ($deliverable) {
            $deliverable->submission_status = $deliverable->status;

            return $deliverable;
        });

        return response()->json([
            'data' => $deliverables,
            'total' => $deliverables->count(),
        ]);
    }

    /**
     * Get the list of statuses to exclude when filtering deliverables due today.
     *
     * @return array Array of status strings to exclude.
     */
    private function dueTodayExcludedStatuses(): array
    {
        return ['approved'];
    }

    /**
     * Resolve the authenticated user from the request or a query parameter token.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @return User|null The authenticated user or null if not found.
     */
    private function resolveDocAuth(Request $request): ?User
    {
        if ($request->user()) {
            return $request->user();
        }

        $token = $request->query('token');
        if ($token) {
            $accessToken = PersonalAccessToken::findToken($token);
            if ($accessToken) {
                Auth::login($accessToken->tokenable);

                return $accessToken->tokenable;
            }
        }

        return null;
    }

    /**
     * Delegate a deliverable to another user.
     *
     * @param  Request  $request  Input: delegated_to, reason, reason_detail, notes
     * @param  Deliverable  $deliverable  The deliverable to delegate.
     * @return JsonResponse JSON response with the delegation record.
     */
    public function delegate(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isCurrentOwner = $this->delegationService->isCurrentOwnerDeliverable($deliverable, $user);

        if (! $isCreator && ! $isAssignee && ! $isCurrentOwner && ! in_array($user->role, ['admin', 'manager', 'team_lead'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if (in_array($deliverable->status, ['approved', 'rejected', 'submitted'])) {
            return response()->json(['success' => false, 'message' => 'Cannot delegate a deliverable that is already approved, rejected, or submitted'], 422);
        }

        if (! $deliverable->allow_transfer) {
            return response()->json(['success' => false, 'message' => 'Transfers are not allowed for this subtask'], 422);
        }

        if ($deliverable->status === 'pending') {
            return response()->json(['success' => false, 'message' => 'You must acknowledge this subtask first before transferring it'], 422);
        }

        $validated = $request->validate([
            'delegated_to' => 'required|exists:users,id',
            'reason' => 'required|string|max:500',
            'reason_detail' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
            'return_to_transferor' => 'nullable|boolean',
        ]);

        if ((int) $validated['delegated_to'] === (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'Cannot delegate a deliverable to yourself'], 422);
        }

        $delegatedTo = User::find($validated['delegated_to']);

        try {
            $delegation = $this->delegationService->delegateDeliverable(
                $deliverable,
                $user,
                $delegatedTo,
                $validated['reason'],
                $validated['reason_detail'] ?? null,
                $validated['notes'] ?? null,
                $validated['return_to_transferor'] ?? true
            );

            return response()->json([
                'success' => true,
                'message' => 'Deliverable delegated successfully',
                'delegation' => $delegation->load(['delegatedBy:id,name,email,role', 'delegatedTo:id,name,email,role']),
                'deliverable' => $deliverable->fresh()->load([
                    'assignee:id,name,email,role', 'creator:id,name,role',
                    'currentOwner:id,name,email,role',
                    'delegations' => fn ($q) => $q->with(['delegatedBy:id,name,role', 'delegatedTo:id,name,role'])->latest(),
                    'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                    'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                    'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                    'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
                ]),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Accept a pending delegation on a deliverable.
     *
     * @param  Deliverable  $deliverable  The deliverable.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function acceptDelegation(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        $delegation = TaskDelegation::where('deliverable_id', $deliverable->id)
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
     * Reject a pending delegation on a deliverable.
     *
     * @param  Deliverable  $deliverable  The deliverable.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function rejectDelegation(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $delegation = TaskDelegation::where('deliverable_id', $deliverable->id)
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
     * Revoke a delegation on a deliverable.
     *
     * @param  Deliverable  $deliverable  The deliverable.
     * @return JsonResponse JSON response with the updated delegation.
     */
    public function revokeDelegation(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        $validated = $request->validate([
            'delegation_id' => 'required|exists:task_delegations,id',
        ]);

        $delegation = TaskDelegation::findOrFail($validated['delegation_id']);

        if ((int) $delegation->deliverable_id !== (int) $deliverable->id) {
            return response()->json(['success' => false, 'message' => 'Delegation does not belong to this deliverable'], 422);
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
     * Get delegation chain details for a deliverable.
     *
     * @param  Deliverable  $deliverable  The deliverable.
     * @return JsonResponse JSON response with the delegation chain.
     */
    public function delegationChain(Deliverable $deliverable)
    {
        $chain = $this->delegationService->getDeliverableChainDetails($deliverable);

        return response()->json([
            'success' => true,
            'chain' => $chain,
            'approval_chain' => $deliverable->approval_chain ?? [],
        ]);
    }

    /**
     * Request to abandon a deliverable/subtask (Members, Team Leads, Managers, Admins).
     */
    public function requestAbandon(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ($deliverable->status === 'abandoned') {
            return response()->json(['success' => false, 'message' => 'Subtask is already abandoned'], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $deliverable->update([
            'previous_status' => $deliverable->status,
            'status' => 'abandon_requested',
            'abandon_requested_by' => $user->id,
            'abandon_requested_at' => now(),
            'abandon_reason' => $validated['reason'] ?? null,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'deliverable_abandon_requested', 'Requested to abandon subtask "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Abandon request submitted successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }

    /**
     * Approve abandon request (Admins & Managers ONLY).
     */
    public function approveAbandon(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can approve abandon requests'], 403);
        }

        $deliverable->update([
            'status' => 'abandoned',
            'abandoned_by' => $user->id,
            'abandoned_at' => now(),
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'deliverable_abandon_approved', 'Approved abandon request for subtask "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Subtask abandon approved successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }

    /**
     * Decline abandon request (Admins & Managers ONLY).
     */
    public function declineAbandon(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can decline abandon requests'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $revertStatus = $deliverable->previous_status ?: 'in_progress';

        $deliverable->update([
            'status' => $revertStatus,
            'abandon_declined_by' => $user->id,
            'abandon_declined_at' => now(),
            'abandon_decline_reason' => $validated['reason'] ?? null,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'deliverable_abandon_declined', 'Declined abandon request for subtask "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Subtask abandon request declined',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }

    /**
     * Directly abandon a deliverable/subtask (Admins & Managers ONLY).
     */
    public function abandon(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Admins and Managers can directly abandon subtasks'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $deliverable->update([
            'previous_status' => $deliverable->status,
            'status' => 'abandoned',
            'abandoned_by' => $user->id,
            'abandoned_at' => now(),
            'abandon_reason' => $validated['reason'] ?? $deliverable->abandon_reason,
            'updated_by' => $user->id,
        ]);

        $this->activityService->log($user->id, 'deliverable_abandoned', 'Abandoned subtask "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Subtask abandoned successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }
}
