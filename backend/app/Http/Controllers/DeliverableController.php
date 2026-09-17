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
use App\Models\Team;
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
            return response()->json(['success' => true, 'data' => collect(), 'deliverables' => collect(), 'total' => 0]);
        }

        $view = $request->query('view', 'assignee');
        $filters = $request->query();
        unset($filters['status'], $filters['statuses']);

        $query = Deliverable::query();

        if ($view === 'assignee') {
            $query->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                    ->orWhere('current_owner', $user->id)
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
                    ->orWhereHas('delegations', function ($dq) use ($user) {
                        $dq->where('delegated_to', $user->id)
                            ->whereIn('status', ['pending', 'accepted']);
                    });
            })
                ->where('created_by', '!=', $user->id)
                ->whereDoesntHave('delegations', function ($q) use ($user) {
                    $q->where('delegated_by', $user->id)
                        ->whereIn('status', ['pending', 'accepted']);
                });
        } else {
            $query->where(function ($q) use ($user) {
                $q->where('created_by', $user->id)
                    ->orWhereHas('delegations', function ($dq) use ($user) {
                        $dq->where('delegated_by', $user->id)
                            ->whereIn('status', ['pending', 'accepted']);
                    });
            });
        }

        // Apply non-status filters to base query
        $query->filter($filters);

        // SQL-level global counts computed before status filtering
        $countQuery = clone $query;
        $counts = $this->computeDeliverableStatusCountsFromQuery($countQuery);

        // Apply status filter at SQL level
        $statusInput = $request->input('statuses', $request->input('status'));
        if ($statusInput !== null && $statusInput !== '' && $statusInput !== 'all') {
            $query->filter(['status' => $statusInput]);
        }

        $query->with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title', 'latestSubmission',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'reopenedBy:id,name,role', 'updatedBy:id,name,role',
        ])->orderBy('created_at', 'desc')->orderBy('id', 'desc');

        $perPage = (int) ($request->input('per_page') ?: $request->input('limit', 0));
        if ($perPage > 0) {
            $paginated = $query->paginate($perPage);
            $deliverables = $paginated->getCollection();
            $total = $paginated->total();
            $pagination = [
                'current_page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'last_page' => $paginated->lastPage(),
            ];
        } else {
            $deliverables = $query->get();
            $total = $deliverables->count();
            $pagination = [
                'current_page' => 1,
                'per_page' => $total,
                'total' => $total,
                'last_page' => 1,
            ];
        }

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

        return response()->json([
            'success' => true,
            'data' => $deliverables,
            'deliverables' => $deliverables,
            'total' => $total,
            'pagination' => $pagination,
            'counts' => $counts,
        ]);
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
            return response()->json(['success' => true, 'data' => collect(), 'deliverables' => collect(), 'total' => 0]);
        }

        $filters = $request->query();
        unset($filters['status'], $filters['statuses']);

        $query = Deliverable::query();

        $query->where(function ($q) use ($user) {
            $q->where('created_by', $user->id)
                ->orWhereHas('delegations', function ($dq) use ($user) {
                    $dq->where('delegated_by', $user->id)
                        ->whereIn('status', ['pending', 'accepted', 'submitted']);
                });
        });

        // Apply non-status filters to base query
        $query->filter($filters);

        // SQL-level global counts computed before status filtering
        $countQuery = clone $query;
        $counts = $this->computeDeliverableStatusCountsFromQuery($countQuery);

        // Apply status filter at SQL level
        $statusInput = $request->input('statuses', $request->input('status'));
        if ($statusInput !== null && $statusInput !== '' && $statusInput !== 'all') {
            $query->filter(['status' => $statusInput]);
        }

        $query->with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'latestSubmission.attachments', 'reopenedBy:id,name,role',
            'approvedBy:id,name,role', 'rejectedBy:id,name,role', 'updatedBy:id,name,role',
            'currentOwner:id,name',
        ])->orderBy('created_at', 'desc')->orderBy('id', 'desc');

        $perPage = (int) ($request->input('per_page') ?: $request->input('limit', 0));
        if ($perPage > 0) {
            $paginated = $query->paginate($perPage);
            $deliverables = $paginated->getCollection();
            $total = $paginated->total();
            $pagination = [
                'current_page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'last_page' => $paginated->lastPage(),
            ];
        } else {
            $deliverables = $query->get();
            $total = $deliverables->count();
            $pagination = [
                'current_page' => 1,
                'per_page' => $total,
                'total' => $total,
                'last_page' => 1,
            ];
        }

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

        return response()->json([
            'success' => true,
            'data' => $deliverables,
            'deliverables' => $deliverables,
            'total' => $total,
            'pagination' => $pagination,
            'counts' => $counts,
        ]);
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
            return response()->json(['success' => true, 'data' => collect(), 'deliverables' => collect(), 'total' => 0]);
        }

        $filters = $request->query();
        unset($filters['status'], $filters['statuses']);

        $query = Deliverable::query();

        $query->where(function ($q) use ($user) {
            $q->where('assigned_to', $user->id)
                ->orWhere(function ($sq) use ($user) {
                    $sq->where('created_by', $user->id)->whereNull('assigned_to');
                });
        });

        // Apply non-status filters to base query
        $query->filter($filters);

        // SQL-level global counts computed before status filtering
        $countQuery = clone $query;
        $counts = $this->computeDeliverableStatusCountsFromQuery($countQuery);

        // Apply status filter at SQL level
        $statusInput = $request->input('statuses', $request->input('status'));
        if ($statusInput !== null && $statusInput !== '' && $statusInput !== 'all') {
            $query->filter(['status' => $statusInput]);
        }

        $query->with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title,project_id', 'task.project:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email', 'latestSubmission.attachments',
        ])->orderBy('created_at', 'desc')->orderBy('id', 'desc');

        $perPage = (int) ($request->input('per_page') ?: $request->input('limit', 0));
        if ($perPage > 0) {
            $paginated = $query->paginate($perPage);
            $deliverables = $paginated->getCollection();
            $total = $paginated->total();
            $pagination = [
                'current_page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'last_page' => $paginated->lastPage(),
            ];
        } else {
            $deliverables = $query->get();
            $total = $deliverables->count();
            $pagination = [
                'current_page' => 1,
                'per_page' => $total,
                'total' => $total,
                'last_page' => 1,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => $deliverables,
            'deliverables' => $deliverables,
            'total' => $total,
            'pagination' => $pagination,
            'counts' => $counts,
        ]);
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
        $this->authorize('view', $deliverable);
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) ($user?->id ?? 0);
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) ($user?->id ?? 0);

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
            if ((int) $entry['delegated_by'] === (int) $user->id && in_array(strtolower((string) ($entry['status'] ?? '')), ['accepted', 'submitted', 'approved'])) {
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
        // Fallback: check workflow events if approval_chain was somehow missing
        if (! $transferorHasApproved && $isTransferor && $transferorReturnToSelf) {
            $hasApprovedEvent = DeliverableWorkflowEvent::where('deliverable_id', $deliverable->id)
                ->where('user_id', $user->id)
                ->where('event_type', 'transferor_approved')
                ->exists();
            if ($hasApprovedEvent) {
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
        $taskAssignedBy = (int) ($deliverable->task?->assigned_by ?? ($deliverable->task?->creator_id ?? 0));
        $payload['is_next_approver'] = ($nextApprover && (int) $nextApprover === (int) $user->id)
            || ($nextApprover === null && !empty($deliverable->delegation_chain) && ((int) $deliverable->created_by === (int) $user->id || ($taskAssignedBy && $taskAssignedBy === (int) $user->id)));
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
        $this->authorize('create', [Deliverable::class, $project]);
        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'status' => 'nullable|string|max:64', 'priority' => 'nullable|string|max:32',
            'start_date' => 'nullable|date', 'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id|required_without:task_id',
            'task_id' => 'nullable|exists:tasks,id',
            'parent_deliverable_id' => 'nullable|exists:deliverables,id',
            'estimated_hours' => 'nullable|integer|min:0',
            'estimated_minutes' => 'nullable|integer|min:0|max:59',
            'labels' => 'nullable|array', 'labels.*' => 'string|max:100',
            'tags' => 'nullable|array', 'tags.*' => 'string|max:100',
            'followers' => 'nullable|array', 'followers.*' => 'exists:users,id',
            'dependencies' => 'nullable|array', 'dependencies.*' => 'exists:deliverables,id',
            'assignees' => 'nullable|array', 'assignees.*' => 'exists:users,id',
            'allow_transfer' => 'nullable|boolean',
            'kb_ids' => 'nullable|array',
            'kb_ids.*' => 'nullable|integer',
            'event_ids' => 'nullable|array',
            'event_ids.*' => 'nullable|integer',
        ]);

        if (empty($request->input('assignees')) && empty($request->input('assigned_to'))) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Please select at least one person to assign this subtask to.'],
            ]);
        }

        // Infer task_id from parent_deliverable_id if missing
        if (! empty($validated['parent_deliverable_id']) && empty($validated['task_id'])) {
            $parentDel = Deliverable::find($validated['parent_deliverable_id']);
            if ($parentDel) {
                $validated['task_id'] = $parentDel->task_id;
            }
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
            'task_id' => $validated['task_id'] ?? null,
            'parent_deliverable_id' => $validated['parent_deliverable_id'] ?? null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
            'estimated_hours' => $validated['estimated_hours'] ?? null,
            'allow_transfer' => $validated['allow_transfer'] ?? true,
            'estimated_minutes' => $validated['estimated_minutes'] ?? null,
            'labels' => $validated['labels'] ?? null,
            'tags' => $validated['tags'] ?? null,
            'followers' => $request->input('followers') ?? null,
            'dependencies' => $request->input('dependencies') ?? null,
            'kb_ids' => $validated['kb_ids'] ?? null,
            'event_ids' => $validated['event_ids'] ?? null,
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
                module: 'Subtask Management',
                action: 'Subtask Created',
                description: "Created subtask {$deliverable->title}",
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
        $this->authorize('create', Deliverable::class);
        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'status' => 'nullable|string|max:64', 'priority' => 'nullable|string|max:32',
            'start_date' => 'nullable|date', 'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id',
            'task_id' => 'nullable|exists:tasks,id',
            'parent_deliverable_id' => 'nullable|exists:deliverables,id',
            'project_id' => 'nullable|exists:projects,id',
            'estimated_hours' => 'nullable|integer|min:0',
            'estimated_minutes' => 'nullable|integer|min:0|max:59',
            'labels' => 'nullable|array', 'labels.*' => 'string|max:100',
            'tags' => 'nullable|array', 'tags.*' => 'string|max:100',
            'followers' => 'nullable|array', 'followers.*' => 'exists:users,id',
            'dependencies' => 'nullable|array', 'dependencies.*' => 'exists:deliverables,id',
            'assignees' => 'nullable|array', 'assignees.*' => 'exists:users,id',
            'allow_transfer' => 'nullable|boolean',
            'kb_ids' => 'nullable|array',
            'kb_ids.*' => 'nullable|integer',
            'event_ids' => 'nullable|array',
            'event_ids.*' => 'nullable|integer',
        ]);

        if (empty($request->input('assignees')) && empty($request->input('assigned_to'))) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Please select at least one person to assign this subtask to.'],
            ]);
        }

        // Resolve parent deliverable if nested
        if (! empty($validated['parent_deliverable_id'])) {
            $parentDel = Deliverable::find($validated['parent_deliverable_id']);
            if ($parentDel) {
                if (empty($validated['task_id'])) {
                    $validated['task_id'] = $parentDel->task_id;
                }
                if (empty($validated['project_id']) && ! empty($parentDel->project_id)) {
                    $validated['project_id'] = $parentDel->project_id;
                }
            }
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
            'parent_deliverable_id' => $validated['parent_deliverable_id'] ?? null,
            'created_by' => $user->id, 'updated_by' => $user->id,
            'estimated_hours' => $validated['estimated_hours'] ?? null,
            'estimated_minutes' => $validated['estimated_minutes'] ?? null,
            'labels' => $validated['labels'] ?? null,
            'tags' => $validated['tags'] ?? null,
            'followers' => $request->input('followers') ?? null,
            'dependencies' => $request->input('dependencies') ?? null,
            'allow_transfer' => $validated['allow_transfer'] ?? true,
            'kb_ids' => $validated['kb_ids'] ?? null,
            'event_ids' => $validated['event_ids'] ?? null,
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
                module: 'Subtask Management',
                action: 'Subtask Created',
                description: "Created subtask {$deliverable->title}",
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
     * Bulk store multiple deliverables at once within a single task or parent deliverable.
     *
     * @param  Request  $request  Validated payload with 'subtasks' array and shared metadata.
     * @return JsonResponse JSON response with the list of created deliverables.
     */
    public function bulkStore(Request $request)
    {
        $this->authorize('create', Deliverable::class);
        $validated = $request->validate([
            'subtasks' => 'required|array|min:1',
            'subtasks.*.title' => 'required|string|max:255',
            'subtasks.*.description' => 'nullable|string',
            'subtasks.*.estimated_hours' => 'nullable|integer|min:0',
            'subtasks.*.estimated_minutes' => 'nullable|integer|min:0|max:59',
            'task_id' => 'nullable|exists:tasks,id',
            'parent_deliverable_id' => 'nullable|exists:deliverables,id',
            'project_id' => 'nullable|exists:projects,id',
            'status' => 'nullable|string|max:64',
            'priority' => 'nullable|string|max:32',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id',
            'assignees' => 'nullable|array',
            'assignees.*' => 'exists:users,id',
            'followers' => 'nullable|array',
            'followers.*' => 'exists:users,id',
            'dependencies' => 'nullable|array',
            'dependencies.*' => 'exists:deliverables,id',
            'allow_transfer' => 'nullable|boolean',
            'kb_ids' => 'nullable|array',
            'kb_ids.*' => 'nullable|integer',
            'event_ids' => 'nullable|array',
            'event_ids.*' => 'nullable|integer',
        ]);

        if (empty($request->input('assignees')) && empty($request->input('assigned_to'))) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Please select at least one person to assign these subtasks to.'],
            ]);
        }

        // Resolve parent deliverable if nested
        if (! empty($validated['parent_deliverable_id'])) {
            $parentDel = Deliverable::find($validated['parent_deliverable_id']);
            if ($parentDel) {
                if (empty($validated['task_id'])) {
                    $validated['task_id'] = $parentDel->task_id;
                }
                if (empty($validated['project_id']) && ! empty($parentDel->project_id)) {
                    $validated['project_id'] = $parentDel->project_id;
                }
            }
        }

        $project = null;
        $task = null;
        if (! empty($validated['task_id'])) {
            $task = Task::find($validated['task_id']);
            $project = $task?->project;
        } elseif (! empty($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
        }

        if (! empty($validated['due_date']) && $task && $task->end_date) {
            $deliverableDate = Carbon::parse($validated['due_date']);
            $taskEnd = Carbon::parse($task->end_date);
            if ($deliverableDate->gt($taskEnd)) {
                throw ValidationException::withMessages([
                    'due_date' => 'Subtask deadline cannot exceed the task deadline ('.$taskEnd->format('d M Y h:i A').').',
                ]);
            }
        }

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
        $createdDeliverables = [];

        DB::transaction(function () use ($validated, $user, $project, $task, $assigneeIds, $request, &$createdDeliverables) {
            foreach ($validated['subtasks'] as $item) {
                $itemTitle = trim($item['title'] ?? '');
                if (empty($itemTitle)) {
                    continue;
                }

                $data = [
                    'title' => $itemTitle,
                    'description' => $item['description'] ?? ($validated['description'] ?? null),
                    'status' => $validated['status'] ?? 'pending',
                    'priority' => $validated['priority'] ?? 'Medium',
                    'start_date' => $validated['start_date'] ?? null,
                    'due_date' => $validated['due_date'] ?? null,
                    'assigned_to' => $validated['assigned_to'] ?? null,
                    'project_id' => $project?->id ?? ($validated['project_id'] ?? null),
                    'task_id' => $validated['task_id'] ?? null,
                    'parent_deliverable_id' => $validated['parent_deliverable_id'] ?? null,
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                    'estimated_hours' => $item['estimated_hours'] ?? ($validated['estimated_hours'] ?? null),
                    'estimated_minutes' => $item['estimated_minutes'] ?? ($validated['estimated_minutes'] ?? null),
                    'labels' => $validated['labels'] ?? null,
                    'tags' => $validated['tags'] ?? null,
                    'followers' => $request->input('followers') ?? null,
                    'dependencies' => $request->input('dependencies') ?? null,
                    'allow_transfer' => $validated['allow_transfer'] ?? true,
                    'kb_ids' => $validated['kb_ids'] ?? null,
                    'event_ids' => $validated['event_ids'] ?? null,
                ];

                $del = $project
                    ? $project->deliverables()->create($data)
                    : Deliverable::create($data);

                if (! empty($assigneeIds)) {
                    $del->assignees()->sync($assigneeIds);
                }

                DeliverableWorkflowEvent::create([
                    'deliverable_id' => $del->id,
                    'user_id' => $user->id,
                    'event_type' => 'created',
                ]);

                if ($del->assigned_to && (int) $del->assigned_to !== (int) $user->id) {
                    $this->sendDeliverableNotification($del, $user, 'deliverable_assigned', 'Deliverable Assigned');
                }

                if ($del->task_id && $task) {
                    $taskAssigneeIds = $task->assignees()->pluck('users.id')->toArray();
                    if (! empty($taskAssigneeIds)) {
                        $this->notificationService->notifyDeliverableAdded($del, $user, $taskAssigneeIds, 'task');
                    }
                }

                try {
                    $this->activityService->log(
                        $user->id,
                        'deliverable_created',
                        'Created subtask "'.$del->title.'"',
                        'deliverable',
                        $del->id,
                        'create'
                    );
                } catch (\Throwable $e) {}

                $createdDeliverables[] = $del->load(['assignee:id,name,email,role', 'creator:id,name']);
            }
        });

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Created',
                description: 'Bulk created ' . count($createdDeliverables) . ' subtasks',
                user: $user,
                entityType: 'Deliverable',
                status: 'success'
            );
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => count($createdDeliverables) . ' subtasks created successfully',
            'deliverables' => $createdDeliverables,
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
        $this->authorize('update', $deliverable);
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id || ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead']);
        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the creator, task assigner, manager, or admin can edit this subtask'], 403);
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
            'kb_ids' => 'sometimes|nullable|array',
            'kb_ids.*' => 'nullable|integer',
            'event_ids' => 'sometimes|nullable|array',
            'event_ids.*' => 'nullable|integer',
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

        $changeSummary = count($changes) > 0
            ? 'Updated subtask "'.$deliverable->title.'" ('.implode(', ', array_column($changes, 'label')).')'
            : 'Updated subtask details for "'.$deliverable->title.'"';
        $this->activityService->log($user->id, 'deliverable_updated', $changeSummary, 'deliverable', $deliverable->id);

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Edited',
                description: "Updated subtask {$deliverable->title}",
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
        $this->authorize('delete', $deliverable);
        $user = request()->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id
            || ($deliverable->task && ((int) $deliverable->task->assigned_by === (int) $user->id || (int) ($deliverable->task->creator_id ?? 0) === (int) $user->id));
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized — only the creator, task assigner, manager, or admin can delete this subtask'], 403);
        }

        if (in_array($deliverable->status, ['approved', 'submitted'])) {
            return response()->json(['success' => false, 'message' => 'Cannot delete a subtask that is '.$deliverable->status], 422);
        }

        $this->activityService->log($user->id, 'deliverable_deleted', 'Deleted subtask "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        $deliverable->delete();

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Deleted',
                description: "Deleted subtask {$deliverable->title}",
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
        try {
            $this->authorize('submit', $deliverable);
            $user = $request->user();
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
            }

            $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
            $isCurrentOwner = $this->delegationService?->isCurrentOwnerDeliverable($deliverable, $user) ?? false;
            $isAuthorizedRole = in_array($user->role, ['admin', 'manager', 'team_lead', 'super_admin']);
            $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id || ($deliverable->task && ((int) ($deliverable->task->assigned_by ?? 0) === (int) $user->id || (int) ($deliverable->task->creator_id ?? 0) === (int) $user->id));
            
            $isDelegate = false;
            try {
                $isDelegate = TaskDelegation::where('deliverable_id', $deliverable->id)
                    ->where('delegated_to', $user->id)
                    ->whereIn('status', ['pending', 'in_progress', 'accepted', 'pending_submission'])
                    ->exists();
            } catch (\Throwable $e) {
                \Log::warning('Error checking TaskDelegation in deliverable submit: '.$e->getMessage());
            }

            $isPivotAssignee = false;
            try {
                $isPivotAssignee = $deliverable->assignees()->where('users.id', $user->id)->exists();
            } catch (\Throwable $e) {
            }

            if (! $isAssignee && ! $isCurrentOwner && ! $isDelegate && ! $isPivotAssignee && ! $isAuthorizedRole && ! $isCreator) {
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
                'deliverable_id' => $deliverable->id,
                'submitted_by' => $user->id,
                'comment' => $validated['comment'] ?? null,
                'file_path' => $filePath,
                'file_name' => $fileName,
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
                        $mime = (string) ($file->getMimeType() ?? '');

                        return [
                            'submission_type' => 'deliverable',
                            'file_name' => basename($path),
                            'original_name' => $file->getClientOriginalName(),
                            'file_path' => $path,
                            'file_type' => $mime,
                            'file_size' => (int) $file->getSize(),
                            'attachment_type' => str_starts_with($mime, 'image/') ? 'image' : 'file',
                            'url' => $url,
                        ];
                    })->toArray()
                );
            }

            if (! empty($validated['links'])) {
                $submission->attachments()->createMany(
                    collect($validated['links'])->map(fn ($url) => [
                        'submission_type' => 'deliverable',
                        'file_name' => (string) $url,
                        'original_name' => (string) $url,
                        'attachment_type' => 'link',
                        'url' => (string) $url,
                    ])->toArray()
                );
            }

            $isResubmit = in_array($deliverable->status, ['rejected', 'reopened', 'rework_required']);

            $creatorId = (int) ($deliverable->created_by ?? 0);
            $ownerId = (int) ($deliverable->current_owner ?: $deliverable->assigned_to ?: 0);
            $isSelf = ($creatorId > 0 && $creatorId === (int) $user->id && $ownerId === (int) $user->id);

            if ($isSelf) {
                $updateData = [
                    'status' => 'approved',
                    'submitted_at' => now(),
                    'approved_at' => now(),
                    'approved_by' => $user->id,
                    'updated_by' => $user->id,
                ];
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
                $deliverable->increment('submission_count');

                try {
                    DeliverableWorkflowEvent::create([
                        'deliverable_id' => $deliverable->id,
                        'user_id' => $user->id,
                        'event_type' => 'approved',
                        'comment' => $validated['comment'] ?? 'Self-deliverable completed',
                        'file_path' => $filePath,
                        'file_name' => $fileName,
                    ]);
                } catch (\Throwable $e) {
                    \Log::warning('Deliverable self-approved workflow event creation failed: '.$e->getMessage());
                }

                try {
                    $this->activityService->log($user->id, 'deliverable_completed', 'You completed self-deliverable "'.$deliverable->title.'"', 'deliverable', $deliverable->id);
                    $this->clearDashboardCache($user->id);
                } catch (\Throwable $e) {
                    \Log::warning('Activity log failed: '.$e->getMessage());
                }

                try {
                    $this->auditService->log(
                        module: 'Subtask Management',
                        action: 'Subtask Completed',
                        description: "Completed self-subtask {$deliverable->title}",
                        user: $user,
                        entityType: 'Deliverable',
                        entityId: $deliverable->id,
                        status: 'success'
                    );
                } catch (\Throwable $e) {
                    \Log::warning('Failed to log audit: '.$e->getMessage());
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Self-deliverable completed successfully',
                    'deliverable' => $deliverable->fresh()->load([
                        'assignee:id,name,email,role', 'creator:id,name',
                        'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                        'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
                    ]),
                ]);
            }

            // 1. Identify the absolute root assigner / creator
            $task = $deliverable->task;
            if (! $task && $deliverable->task_id) {
                $task = Task::find($deliverable->task_id);
            }
            $rootAssignerId = (int) ($task?->assigned_by ?: ($task?->creator_id ?: ($deliverable->created_by ?: 0)));

            // 2. Fetch delegation chain from model and fallback to task_delegations table
            $chain = $deliverable->delegation_chain ?? [];
            if (is_string($chain)) {
                $chain = json_decode($chain, true) ?? [];
            }
            if (! is_array($chain) || empty($chain)) {
                try {
                    $dbDelegations = TaskDelegation::where('deliverable_id', $deliverable->id)
                        ->orderBy('delegation_level')
                        ->get();
                    if ($dbDelegations->isNotEmpty()) {
                        $chain = $dbDelegations->map(fn ($d) => [
                            'id' => $d->id,
                            'delegated_by' => (int) $d->delegated_by,
                            'delegated_to' => (int) $d->delegated_to,
                            'level' => (int) $d->delegation_level,
                            'status' => $d->status,
                            'return_to_transferor' => (bool) $d->return_to_transferor,
                        ])->toArray();
                    } else {
                        $chain = [];
                    }
                } catch (\Throwable $e) {
                    $chain = [];
                }
            }

            // 3. Find if the submitting user was delegated this subtask by someone (incoming delegation)
            $myIncomingDelegation = null;
            if (is_iterable($chain)) {
                foreach ($chain as $entry) {
                    if (is_array($entry) && (int) ($entry['delegated_to'] ?? 0) === (int) $user->id && in_array(strtolower((string) ($entry['status'] ?? '')), ['accepted', 'pending', 'in_progress'])) {
                        $myIncomingDelegation = $entry;
                    }
                }
            }
            if (! $myIncomingDelegation) {
                try {
                    $dbDel = TaskDelegation::where('deliverable_id', $deliverable->id)
                        ->where('delegated_to', $user->id)
                        ->whereIn('status', ['accepted', 'pending', 'in_progress'])
                        ->latest()
                        ->first();
                    if ($dbDel) {
                        $myIncomingDelegation = [
                            'id' => $dbDel->id,
                            'delegated_by' => (int) $dbDel->delegated_by,
                            'delegated_to' => (int) $dbDel->delegated_to,
                            'level' => (int) $dbDel->delegation_level,
                            'status' => $dbDel->status,
                            'return_to_transferor' => (bool) $dbDel->return_to_transferor,
                        ];
                    }
                } catch (\Throwable $e) {
                }
            }

            // 4. Determine if the submitting user has a delegator above them
            $hasDelegatorAbove = false;
            $directDelegatorId = null;
            if ($myIncomingDelegation) {
                $directDelegatorId = (int) ($myIncomingDelegation['delegated_by'] ?? 0);
                $hasDelegatorAbove = $directDelegatorId > 0 && $directDelegatorId !== (int) $user->id;
            }

            // 5. Determine recipient ($notifyUserId) and whether submission is intermediate
            $notifyUserId = null;
            $isIntermediateSubmission = false;

            if ($hasDelegatorAbove) {
                $returnToTransferor = $myIncomingDelegation['return_to_transferor'] ?? true;
                if ($returnToTransferor && $directDelegatorId) {
                    $notifyUserId = $directDelegatorId;
                    // Submitting back to an intermediate delegator keeping global status in_progress
                    $isIntermediateSubmission = true;
                } else {
                    $notifyUserId = $rootAssignerId;
                    $isIntermediateSubmission = false;
                }
            } else {
                // Root submission (direct assignee or transferor submitting to root assigner)
                $notifyUserId = $rootAssignerId;
                $isIntermediateSubmission = false;
            }

            // Failsafe: If the recipient is not the root assigner and not the submitting user, it is intermediate
            if ($notifyUserId && $rootAssignerId && $notifyUserId !== $rootAssignerId && $notifyUserId !== (int) $user->id) {
                $isIntermediateSubmission = true;
            }

            $isLate = false;
            if ($deliverable->due_date) {
                try {
                    $isLate = now()->gt(\Carbon\Carbon::parse($deliverable->due_date));
                } catch (\Throwable $e) {
                    $isLate = false;
                }
            }
            $targetStatus = $isLate ? 'submitted_late' : 'submitted';

            $updateData = [
                'status' => $targetStatus,
                'submitted_at' => now(),
                'current_owner' => $notifyUserId ?: $rootAssignerId,
            ];

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

            // Update specific step in delegation_chain to reflect transfer step submission
            if (! empty($chain) && is_array($chain)) {
                $chainUpdated = false;
                foreach ($chain as &$entry) {
                    if (is_array($entry) && (int) ($entry['delegated_to'] ?? 0) === (int) $user->id && in_array(strtolower((string) ($entry['status'] ?? '')), ['accepted', 'pending', 'in_progress'])) {
                        $entry['status'] = 'submitted';
                        $entry['submission_status'] = 'submitted';
                        $entry['submitted_at'] = now()->toISOString();
                        $chainUpdated = true;
                    }
                }
                unset($entry);
                if ($chainUpdated) {
                    $updateData['delegation_chain'] = $chain;
                }
            }

            $deliverable->stopTimer();
            $deliverable->update($updateData);

            // Update the submitting user's pivot status for per-user tracking
            try {
                if ($deliverable->assignees()->where('users.id', $user->id)->exists()) {
                    $deliverable->assignees()->updateExistingPivot($user->id, [
                        'status' => 'submitted',
                        'submitted_at' => now(),
                    ]);
                }
            } catch (\Throwable $e) {
                \Log::warning('Error updating assignees pivot in deliverable submit: '.$e->getMessage());
            }

            try {
                TaskDelegation::where('deliverable_id', $deliverable->id)
                    ->where('delegated_to', $user->id)
                    ->whereIn('status', ['accepted', 'pending', 'in_progress'])
                    ->update([
                        'status' => 'submitted',
                    ]);
            } catch (\Throwable $e) {
                \Log::warning('Error updating delegation status in deliverable submit: '.$e->getMessage());
            }

            // Increment submission count
            $deliverable->increment('submission_count');

            try {
                DeliverableWorkflowEvent::create([
                    'deliverable_id' => $deliverable->id,
                    'user_id' => $user->id,
                    'event_type' => $isResubmit ? 'resubmitted' : 'submitted',
                    'comment' => $validated['comment'] ?? null,
                    'file_path' => $filePath,
                    'file_name' => $fileName,
                ]);
            } catch (\Throwable $e) {
                \Log::warning('Error creating DeliverableWorkflowEvent in deliverable submit: '.$e->getMessage());
            }

            if ($notifyUserId && (int) $notifyUserId !== (int) $user->id) {
                try {
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
                } catch (\Throwable $e) {
                    \Log::warning('Error sending notification in deliverable submit: '.$e->getMessage());
                }
            }

            // Send confirmation email to performer
            try {
                $submittedToName = $notifyUserId ? (User::find($notifyUserId)?->name ?? 'N/A') : 'N/A';
                $this->notificationService->confirmAction($user, $isResubmit ? 'Resubmitted' : 'Submitted', 'deliverable', (string) $deliverable->title, [
                    'Project' => $deliverable->project?->title ?? 'N/A',
                    'Task' => $deliverable->task?->title ?? 'N/A',
                    'Subtask ID' => $deliverable->business_id ?? ('SUB-'.$deliverable->id),
                    'Submitted To' => $submittedToName,
                ]);
            } catch (\Throwable $e) {
                \Log::warning('Error confirming action in deliverable submit: '.$e->getMessage());
            }

            // Log activity
            try {
                $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
                $this->activityService->log($user->id, 'deliverable_'.$isResubmitLabel, 'You '.$isResubmitLabel.' deliverable "'.$deliverable->title.'" for review', 'deliverable', $deliverable->id);
                $this->clearDashboardCache($user->id);
            } catch (\Throwable $e) {
                \Log::warning('Error logging activity in deliverable submit: '.$e->getMessage());
            }

            try {
                $this->auditService->log(
                    module: 'Subtask Management',
                    action: $isResubmit ? 'Subtask Resubmitted' : 'Subtask Submitted',
                    description: ($isResubmit ? 'Resubmitted' : 'Submitted')." subtask {$deliverable->title}",
                    user: $user,
                    entityType: 'Deliverable',
                    entityId: $deliverable->id,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::warning('Failed to log audit in deliverable submit: '.$e->getMessage());
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
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'You are not authorized to submit this deliverable',
            ], 403);
        } catch (\Throwable $e) {
            \Log::error('Deliverable submit fatal exception: '.$e->getMessage(), [
                'deliverable_id' => $deliverable->id ?? null,
                'user_id' => $request->user()?->id ?? null,
                'exception' => $e,
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to submit deliverable: '.$e->getMessage(),
            ], 500);
        }
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
        $this->authorize('approve', $deliverable);
        $user = $request->user();
        $task = $deliverable->relationLoaded('task') ? $deliverable->task : ($deliverable->task_id ? Task::find($deliverable->task_id) : null);
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id || ($task && ((int) $task->assigned_by === (int) $user->id || (int) ($task->creator_id ?? 0) === (int) $user->id));
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        $nextApprover = $this->delegationService->getDeliverableApprover($deliverable);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;
        $isCurrentOwnerOrReviewer = ((int) ($deliverable->current_owner ?? 0) === (int) $user->id) || ((int) ($deliverable->current_reviewer_id ?? 0) === (int) $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);
        if (! $isCreator && ! $isAdminOrManager && ! in_array($user->role, ['team_lead']) && ! $isDelegationChain && ! $isNextApprover && ! $isCurrentOwnerOrReviewer) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Check if user is a transferor (next_approver from delegation chain with return_to_transferor=true)
        $isNextApproverTransferor = $isNextApprover && ! $isCreator;

        if (! in_array($deliverable->status, ['submitted', 'submitted_late']) && ! $isNextApproverTransferor) {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted deliverables'], 422);
        }
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

            // Set Member A's (transferor's) pivot status to in_progress so they can work or submit upwards
            if ($deliverable->assignees()->where('users.id', $user->id)->exists()) {
                $deliverable->assignees()->updateExistingPivot($user->id, [
                    'status' => 'in_progress',
                    'submitted_at' => null,
                ]);
            } else {
                $deliverable->assignees()->syncWithoutDetaching([
                    $user->id => [
                        'status' => 'in_progress',
                        'assigned_at' => now(),
                    ],
                ]);
            }

            // Update TaskDelegation record from this transferor to approved
            TaskDelegation::where('deliverable_id', $deliverable->id)
                ->where('delegated_by', $user->id)
                ->whereIn('status', ['accepted', 'submitted'])
                ->update(['status' => 'approved']);

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
            $dlvData['is_assignee'] = true;
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
                module: 'Subtask Management',
                action: 'Subtask Approved',
                description: "Approved subtask {$deliverable->title}",
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
        $this->authorize('reject', $deliverable);
        $user = $request->user();
        $task = $deliverable->relationLoaded('task') ? $deliverable->task : ($deliverable->task_id ? Task::find($deliverable->task_id) : null);
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id || ($task && ((int) $task->assigned_by === (int) $user->id || (int) ($task->creator_id ?? 0) === (int) $user->id));
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        $nextApprover = $this->delegationService->getDeliverableApprover($deliverable);
        $isNextApprover = $nextApprover && (int) $nextApprover === (int) $user->id;
        $isCurrentOwnerOrReviewer = ((int) ($deliverable->current_owner ?? 0) === (int) $user->id) || ((int) ($deliverable->current_reviewer_id ?? 0) === (int) $user->id);
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);
        if (! $isCreator && ! $isAdminOrManager && ! in_array($user->role, ['team_lead']) && ! $isDelegationChain && ! $isNextApprover && ! $isCurrentOwnerOrReviewer) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $isNextApproverTransferor = $isNextApprover && ! $isCreator;
        if (! in_array($deliverable->status, ['submitted', 'submitted_late']) && ! $isNextApproverTransferor) {
            return response()->json(['success' => false, 'message' => 'Can only reject submitted deliverables'], 422);
        }

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $currentStates = is_array($deliverable->states) ? $deliverable->states : [];
        $filteredStates = array_values(array_filter($currentStates, fn ($s) => strtolower((string)$s) !== 'reopened'));

        $deliverable->update([
            'status' => 'declined',
            'is_reopened' => false,
            'rejected_at' => now(),
            'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
            'updated_by' => $user->id,
            'states' => $filteredStates,
        ]);

        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'rejected', 'user_id' => $user->id, 'comment' => $validated['comment'] ?? null]);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "'.$deliverable->title.'" has been declined.';
            if (! empty($validated['comment'])) {
                $msg .= ' Reason: '.$validated['comment'];
            }
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                (int) $user->id,
                'deliverable_rejected',
                'deliverable',
                (int) $deliverable->id,
                'Deliverable Declined',
                $msg,
                '/deliveries?selectedDeliverable='.$deliverable->id
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Declined', 'deliverable', $deliverable->title, [
            'Project' => $deliverable->project?->title ?? 'N/A',
            'Task' => $deliverable->task?->title ?? 'N/A',
            'Subtask ID' => $deliverable->business_id,
            'Assigned To' => $deliverable->assignee?->name ?? 'N/A',
            'Reason' => $validated['comment'] ?? 'N/A',
        ]);

        // Log activity: "Subtask declined. Reason: {comment}"
        $reasonText = ! empty($validated['comment']) ? $validated['comment'] : 'No reason provided';
        $this->activityService->log($user->id, 'deliverable_declined', 'Subtask declined. Reason: '.$reasonText, 'deliverable', $deliverable->id);
        $this->clearDashboardCache($user->id);

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Declined',
                description: "Declined subtask {$deliverable->title}".(! empty($validated['comment']) ? " Reason: {$validated['comment']}" : ''),
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
            'message' => 'Deliverable declined',
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
        $this->authorize('reopen', $deliverable);
        $user = $request->user();
        $task = $deliverable->relationLoaded('task') ? $deliverable->task : ($deliverable->task_id ? Task::find($deliverable->task_id) : null);
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id || ($task && ((int) $task->assigned_by === (int) $user->id || (int) ($task->creator_id ?? 0) === (int) $user->id));
        $isDelegationChain = $this->delegationService->isInDeliverableDelegationChain($deliverable, $user);
        $isCurrentOwnerOrReviewer = ((int) ($deliverable->current_owner ?? 0) === (int) $user->id) || ((int) ($deliverable->current_reviewer_id ?? 0) === (int) $user->id);
        if (! $isCreator && ! in_array($user->role, ['admin', 'manager', 'super_admin', 'team_lead']) && ! $isDelegationChain && ! $isCurrentOwnerOrReviewer) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (! in_array($deliverable->status, ['submitted', 'submitted_late', 'approved', 'completed', 'declined', 'rejected', 'abandoned'])) {
            return response()->json(['success' => false, 'message' => 'Can only reopen completed, submitted, approved, declined, or abandoned deliverables'], 422);
        }

        $validated = $request->validate([
            'assignee_id' => 'nullable|integer|exists:users,id',
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

        $targetAssigneeId = ! empty($validated['assignee_id'])
            ? (int) $validated['assignee_id']
            : (int) ($deliverable->current_owner ?: $deliverable->assigned_to);

        $updateData = [
            'status' => 'pending',
            'is_reopened' => true,
            'reopened_at' => now(),
            'reopened_by' => $user->id,
            'reopen_comment' => $reopenComment,
            'reopen_reason' => $validated['reopen_reason'],
            'reopen_instructions' => $validated['instructions'] ?? null,
            'reopen_link' => $validated['link'] ?? null,
            'updated_by' => $user->id,
            'assigned_to' => $targetAssigneeId ?: $deliverable->assigned_to,
            'current_owner' => $targetAssigneeId ?: $deliverable->current_owner,
        ];
        if (! empty($validated['new_deadline'])) {
            $updateData['reopen_new_deadline'] = $validated['new_deadline'];
            $updateData['due_date'] = $validated['new_deadline'];
        }
        if (! empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $deliverable->update($updateData);

        // Exclusively sync target assignee in pivot table so previous assignee is removed
        try {
            if ($targetAssigneeId && method_exists($deliverable, 'assignees')) {
                $deliverable->assignees()->sync([
                    $targetAssigneeId => [
                        'status' => 'pending',
                        'due_date' => $deliverable->due_date ?? null,
                        'submitted_at' => null,
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Deliverable assignees pivot update warning: '.$e->getMessage());
        }

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

        $notifyTarget = $targetAssigneeId ?: $deliverable->assigned_to;
        if ($notifyTarget && (int) $notifyTarget !== (int) $user->id) {
            $msg = 'Your subtask "'.$deliverable->title.'" has been reopened. Reason: '.$reopenReasonText;
            if (! empty($validated['instructions'])) {
                $msg .= ' Instructions: '.$validated['instructions'];
            }
            $this->notificationService->notify(
                (int) $notifyTarget,
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
                module: 'Subtask Management',
                action: 'Subtask Reopened',
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
     * Force mark a deliverable as completed by Assigner / Creator.
     */
    public function markAsCompleted(Request $request, Deliverable $deliverable): JsonResponse
    {
        $this->authorize('markAsCompleted', $deliverable);

        $currentStatus = strtolower(trim((string) $deliverable->status));
        $allowedStatuses = ['pending', 'not_started', 'assigned', 'planned', 'planning', 'in_progress', 'in-progress', 'acknowledged', 'paused', 'reopened', 'rework_required'];

        if (! in_array($currentStatus, $allowedStatuses, true)) {
            return response()->json([
                'success' => false,
                'message' => 'This deliverable cannot be marked as completed in its current status (' . $deliverable->status . ')',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
            'delivery_notes' => 'nullable|string|max:5000',
            'attachments' => 'nullable|array',
            'attachments.*' => 'file|max:51200',
            'files' => 'nullable|array',
            'files.*' => 'file|max:51200',
            'file' => 'nullable|file|max:51200',
        ]);

        $user = $request->user();
        $reason = trim($validated['reason']);
        $notes = isset($validated['delivery_notes']) ? trim($validated['delivery_notes']) : null;

        $uploadedFiles = [];
        if ($request->hasFile('attachments')) {
            $uploadedFiles = $request->file('attachments');
        } elseif ($request->hasFile('files')) {
            $uploadedFiles = $request->file('files');
        } elseif ($request->hasFile('file')) {
            $uploadedFiles = [$request->file('file')];
        }

        $fileSkipped = false;
        $org = $request->attributes->get('currentOrganization');
        foreach ($uploadedFiles as $uploadedFile) {
            if ($uploadedFile && $uploadedFile->isValid()) {
                $storageCheck = $this->checkStorageLimit($request, $uploadedFile);
                if ($storageCheck && ! $storageCheck['allowed']) {
                    $fileSkipped = true;
                    continue;
                }
                if ($org) {
                    $path = StorageDiskResolver::store($org, $uploadedFile, 'deliverable-files/'.$deliverable->id);
                    $fileUrl = StorageDiskResolver::isS3($org) ? $path : '/storage/'.$path;
                } else {
                    $path = $uploadedFile->store('deliverable-files/'.$deliverable->id, 'public');
                    $fileUrl = '/storage/'.$path;
                }
                $nextOrder = (int) $deliverable->files()->max('sort_order') + 1;
                $deliverable->files()->create([
                    'name' => $uploadedFile->getClientOriginalName(),
                    'url' => $fileUrl,
                    'sort_order' => $nextOrder,
                ]);
            }
        }

        $deliverable->update([
            'status' => 'approved',
            'completion_reason' => $reason,
            'completion_notes' => $notes,
            'approved_at' => now(),
            'approved_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        $deliverable->stopTimer();

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'marked_completed',
            'comment' => "{$user->name} marked the deliverable as completed. Reason: {$reason}",
        ]);

        $this->activityService->log($user->id, 'deliverable_completed', "{$user->name} marked the deliverable as completed. Reason: {$reason}", 'deliverable', $deliverable->id);

        if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
            $this->notificationService->notify(
                (int) $deliverable->assigned_to,
                $user->id,
                'deliverable_completed',
                'deliverable',
                $deliverable->id,
                'Deliverable Completed',
                "{$user->name} marked the deliverable \"{$deliverable->title}\" as completed. Reason: {$reason}",
                '/deliveries?selectedDeliverable='.$deliverable->id
            );
        }

        $this->clearDashboardCache($user->id);
        if ($deliverable->assigned_to) {
            $this->clearDashboardCache((int) $deliverable->assigned_to);
        }

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Completed',
                description: "{$user->name} marked subtask {$deliverable->title} as completed. Reason: {$reason}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable markAsCompleted', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Deliverable marked as completed successfully',
            'file_skipped' => $fileSkipped,
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
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
        $this->authorize('approve', $deliverable);
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
                module: 'Subtask Management',
                action: 'Subtask Approved',
                description: "Self-approved subtask {$deliverable->title}",
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
        $this->authorize('reopen', $deliverable);
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

        if ($resolved['disk'] === 's3') {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                try {
                    $temporaryUrl = \App\Services\StorageDiskResolver::getTemporaryUrl($org, $resolved['path'], 60);
                    $disposition = 'attachment; filename="' . $fileName . '"';
                    $temporaryUrl .= '&response-content-disposition=' . urlencode($disposition);
                    return redirect()->away($temporaryUrl);
                } catch (\Throwable $e) {
                    \Log::error('S3 redirect failed for deliverable submission', ['path' => $resolved['path'], 'error' => $e->getMessage()]);
                }
            }
        }

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
        $this->authorize('view', $deliverable);
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

        $isAlreadyEdited = $deliverable->has_edited_submission ||
            $submission->is_edited ||
            ((int) ($submission->edit_count ?? 0) > 0) ||
            ((int) ($submission->version_number ?? 1) > 1) ||
            ((int) ($submission->version ?? 1) > 1) ||
            ($submission->updated_at && $submission->created_at && $submission->updated_at->diffInSeconds($submission->created_at) > 2);

        if ($isAlreadyEdited) {
            return response()->json(['success' => false, 'message' => 'Submission can only be edited once.'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|max:51200',
            'files' => 'nullable|array',
            'files.*' => 'file|max:51200',
            'links' => 'nullable|array',
            'links.*' => 'nullable|string|max:2048',
            'deleted_attachment_ids' => 'nullable|array',
            'deleted_attachment_ids.*' => 'nullable',
            'remove_main_file' => 'nullable|boolean',
        ]);

        if (array_key_exists('comment', $validated)) {
            $submission->comment = $validated['comment'];
        }

        $deletedAttachmentIds = array_filter((array) $request->input('deleted_attachment_ids', []));
        if (!empty($deletedAttachmentIds)) {
            $numericIds = array_filter($deletedAttachmentIds, 'is_numeric');
            if (!empty($numericIds)) {
                $submission->attachments()->whereIn('id', $numericIds)->delete();
            }
        }

        if ($request->boolean('remove_main_file') || in_array('main_file', $deletedAttachmentIds, true)) {
            $submission->file_path = null;
            $submission->file_name = null;
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

        $submission->version_number = max((int) ($submission->version_number ?? 1), 2);
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

        if ($request->has('links')) {
            $newLinkUrls = collect($request->input('links', []))
                ->map(fn ($l) => is_array($l) ? ($l['url'] ?? '') : (is_string($l) ? $l : ''))
                ->map(fn ($l) => trim((string) $l))
                ->filter()
                ->unique()
                ->values();

            $submission->attachments()->where('attachment_type', 'link')->delete();

            if ($newLinkUrls->isNotEmpty()) {
                $submission->attachments()->createMany(
                    $newLinkUrls->map(fn ($url) => [
                        'submission_type' => 'deliverable',
                        'file_name' => $url,
                        'original_name' => $url,
                        'attachment_type' => 'link',
                        'url' => $url,
                    ])->toArray()
                );
            }
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
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role', 'creator:id,name,role',
                'latestSubmission', 'latestSubmission.submittedBy:id,name,email', 'latestSubmission.attachments',
                'reopenedBy:id,name',
            ]),
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

        if ($resolved['disk'] === 's3') {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                try {
                    $temporaryUrl = \App\Services\StorageDiskResolver::getTemporaryUrl($org, $resolved['path'], 60);
                    if ($request->query('action') === 'download') {
                        $disposition = 'attachment; filename="' . $filename . '"';
                        $temporaryUrl .= '&response-content-disposition=' . urlencode($disposition);
                    }
                    return redirect()->away($temporaryUrl);
                } catch (\Throwable $e) {
                    \Log::error('S3 redirect failed for deliverable attachment', ['path' => $resolved['path'], 'error' => $e->getMessage()]);
                }
            }
        }

        if ($request->query('action') === 'download') {
            return Storage::disk($resolved['disk'])->download($resolved['path'], $filename);
        }

        return Storage::disk($resolved['disk'])->response($resolved['path'], ['Cache-Control' => 'public, max-age=3600']);
    }

    /**
     * Reorder deliverables by updating sort_order values in bulk.
     *
     * @param  Request  $request  Input: items[] with id and sort_order.
     * @return JsonResponse JSON response confirming reorder.
     */
    public function reorder(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:deliverables,id', 'items.*.sort_order' => 'required|integer|min:0']);
        $ids = [];
        $bindings = [];
        foreach ($request->items as $item) {
            $ids[] = (int) $item['id'];
            $bindings[] = (int) $item['id'];
            $bindings[] = (int) $item['sort_order'];
        }
        if (! empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            DB::statement('UPDATE deliverables SET sort_order = CASE id '.implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?'))." END WHERE id IN ($ph)", [...$bindings, ...$ids]);
        }

        return response()->json(['success' => true, 'message' => 'Deliverables reordered successfully']);
    }

    // ─── Acknowledge ───────────────────────────────────────────

    /**
     * Acknowledge a deliverable assignment (pending → in_progress).
     */
    public function acknowledge(Request $request, Deliverable $deliverable)
    {
        $this->authorize('acknowledge', $deliverable);
        $user = $request->user();
        $userId = (int) $user->id;

        // Check if there is an active pending delegation for this user
        $pendingDelegation = TaskDelegation::where('deliverable_id', $deliverable->id)
            ->where('delegated_to', $userId)
            ->where('status', 'pending')
            ->latest()
            ->first();

        if ($pendingDelegation) {
            try {
                $this->delegationService->acceptDelegation($pendingDelegation, $user);

                return response()->json([
                    'success' => true,
                    'message' => 'Deliverable acknowledged',
                    'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
                ]);
            } catch (\Throwable $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
            }
        }

        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === $userId || (int) ($deliverable->current_owner ?? 0) === $userId;
        $isAuthorizedRole = in_array($user->role, ['admin', 'manager', 'team_lead', 'super_admin']);
        $isCreator = (int) ($deliverable->created_by ?? 0) === $userId || ($deliverable->task && ((int) ($deliverable->task->assigned_by ?? 0) === $userId || (int) ($deliverable->task->creator_id ?? 0) === $userId));

        if (! $isAssignee && ! $isAuthorizedRole && ! $isCreator) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $deliverable->update([
            'status' => 'in_progress',
            'current_owner' => $userId,
            'acknowledged_at' => now(),
            'acknowledged_by' => $userId,
            'updated_by' => $userId,
        ]);

        if ($deliverable->assignees()->where('users.id', $userId)->exists()) {
            $deliverable->assignees()->updateExistingPivot($userId, [
                'status' => 'in_progress',
            ]);
        } else {
            $deliverable->assignees()->syncWithoutDetaching([
                $userId => [
                    'status' => 'in_progress',
                    'assigned_at' => now(),
                ],
            ]);
        }

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'acknowledged',
            'user_id' => $userId,
            'comment' => 'Acknowledged deliverable',
        ]);

        $this->activityService->log($userId, 'deliverable_acknowledged', 'You acknowledged deliverable "'.$deliverable->title.'"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable acknowledged',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
        ]);
    }

    // ─── Timer ─────────────────────────────────────────────────

    /**
     * Start the deliverable timer explicitly.
     */
    public function startTimer(Request $request, Deliverable $deliverable)
    {
        $this->authorize('startTimer', $deliverable);
        $user = $request->user();
        $isAssignee = (int) ($deliverable->assigned_to ?? 0) === (int) $user->id;
        $isCreator = (int) ($deliverable->created_by ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);
        if (! $isAssignee && ! $isCreator && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to start this subtask timer.'], 403);
        }

        if (! in_array($deliverable->status, ['in_progress', 'paused', 'reopened'])) {
            return response()->json(['success' => false, 'message' => 'Subtask must be in progress to start timer. Please acknowledge it first.'], 422);
        }

        if ($deliverable->timer_state === 'running') {
            return response()->json([
                'success' => true,
                'message' => 'Timer is already running',
                'deliverable' => $deliverable->fresh(),
            ]);
        }

        $isResume = ($deliverable->timer_state === 'paused' || $deliverable->status === 'paused');
        if ($isResume) {
            $deliverable->resumeTimer($user->id);
            $deliverable->update(['status' => 'in_progress', 'paused_by' => null, 'paused_at' => null, 'updated_by' => $user->id]);

            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'event_type' => 'resumed',
                'user_id' => $user->id,
                'comment' => 'Timer resumed',
            ]);
        } else {
            $deliverable->startTimer();

            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'event_type' => 'timer_started',
                'user_id' => $user->id,
                'comment' => 'Work timer started',
            ]);
        }

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: $isResume ? 'Subtask Resumed' : 'Subtask Started',
                description: ($isResume ? 'Resumed' : 'Started')." subtask {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable startTimer', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Timer started',
            'deliverable' => $deliverable->fresh(),
        ]);
    }

    /**
     * Pause the deliverable timer.
     */
    public function pause(Request $request, Deliverable $deliverable)
    {
        $this->authorize('pause', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Paused',
                description: "Paused subtask {$deliverable->title}".($validated['reason'] ? " — {$validated['reason']}" : ''),
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable pause', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('continue', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Resumed',
                description: "Resumed subtask {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable continueTimer', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('assignerPause', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Paused',
                description: "Assigner paused subtask {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable assignerPause', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('assignerResume', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Resumed',
                description: "Assigner resumed subtask {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable assignerResume', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('view', $deliverable);
        return response()->json([
            'success' => true,
            'timer' => [
                'state' => $deliverable->timer_state,
                'work_started_at' => $deliverable->work_started_at?->toIso8601String(),
                'last_timer_event_at' => $deliverable->last_timer_event_at?->toIso8601String(),
                'work_completed_at' => $deliverable->work_completed_at?->toIso8601String(),
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
        $this->authorize('view', $deliverable);
        $sessions = $deliverable->pauseSessions()
            ->with(['user:id,name', 'resumedByUser:id,name'])
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'reason' => $s->reason,
                'reason_label' => $s->reason_label,
                'reason_detail' => $s->reason_detail,
                'paused_at' => $s->paused_at?->toIso8601String(),
                'resumed_at' => $s->resumed_at?->toIso8601String(),
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
        $this->authorize('manageFiles', $deliverable);
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
                module: 'Subtask Management',
                action: 'Attachment Added',
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
        $this->authorize('manageFiles', $deliverable);
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
                module: 'Subtask Management',
                action: 'Attachment Added',
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
        $this->authorize('manageFiles', $deliverable);
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
        $this->authorize('manageFiles', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Attachment Removed',
                description: "Deleted file \"{$fileName}\" from subtask \"{$deliverable->title}\"",
                user: $user,
                entityType: 'DeliverableFile',
                entityId: $file->id,
                oldValues: ['file_name' => $fileName, 'deliverable_id' => $deliverable->id, 'deliverable_title' => $deliverable->title],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log deliverable file delete audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'File deleted']);
    }

    /**
     * Reorder deliverable files.
     */
    public function reorderFiles(Request $request, Deliverable $deliverable)
    {
        $this->authorize('manageFiles', $deliverable);
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
        $this->authorize('manageNotes', $deliverable);
        $notes = DeliverableUserNote::where('deliverable_id', $deliverable->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'note' => $notes->first(),
            'notes' => $notes,
        ]);
    }

    /**
     * Create or update the current user's personal note on a deliverable.
     */
    public function storeNote(Request $request, Deliverable $deliverable)
    {
        $this->authorize('manageNotes', $deliverable);
        $validated = $request->validate(['note' => 'required|string|max:5000']);

        $note = DeliverableUserNote::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $request->user()->id,
            'note' => $validated['note'],
        ]);

        $notes = DeliverableUserNote::where('deliverable_id', $deliverable->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'message' => 'Note saved', 'note' => $note, 'notes' => $notes]);
    }

    /**
     * Update the current user's personal note on a deliverable.
     */
    public function updateNote(Request $request, Deliverable $deliverable, DeliverableUserNote $note)
    {
        $this->authorize('manageNotes', $deliverable);
        if ((int) $note->user_id !== (int) $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate(['note' => 'required|string|max:5000']);
        $note->update(['note' => $validated['note']]);

        $notes = DeliverableUserNote::where('deliverable_id', $deliverable->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'message' => 'Note updated', 'note' => $note, 'notes' => $notes]);
    }

    /**
     * Delete the current user's personal note on a deliverable.
     */
    public function destroyNote(Request $request, Deliverable $deliverable, DeliverableUserNote $note)
    {
        $this->authorize('manageNotes', $deliverable);
        if ((int) $note->user_id !== (int) $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $note->delete();

        $notes = DeliverableUserNote::where('deliverable_id', $deliverable->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'message' => 'Note deleted', 'notes' => $notes]);
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
        $permittedProjectIds = $this->getPermittedProjectIds($user);

        // ── Role-based visibility ──
        switch ($role) {
            case 'admin':
            case 'manager':
            case 'super_admin':
                // Admin and Manager see everything — no scope filter
                break;

            case 'team_lead':
            case 'teamlead':
                // Team Lead sees deliverables within their team scope + deliverables in permitted projects
                $ledTeamIds = $user->ledTeams()->pluck('teams.id');
                $memberTeamIds = $user->teams()->pluck('teams.id');
                $allTeamIds = $ledTeamIds->merge($memberTeamIds)->unique();

                $scopeUserIds = collect([$user->id]);
                if ($allTeamIds->isNotEmpty()) {
                    $teamUserIds = DB::table('team_user')
                        ->whereIn('team_id', $allTeamIds)
                        ->pluck('user_id');
                    $scopeUserIds = $scopeUserIds->merge($teamUserIds)->unique();
                }

                $query->where(function ($q) use ($scopeUserIds, $user, $permittedProjectIds) {
                    $q->whereIn('assigned_to', $scopeUserIds)
                        ->orWhereIn('created_by', $scopeUserIds);

                    if (!empty($permittedProjectIds)) {
                        $q->orWhereIn('project_id', $permittedProjectIds)
                            ->orWhereHas('task', fn ($tq) => $tq->whereIn('project_id', $permittedProjectIds));
                    }
                });
                break;

            case 'guest':
                if (empty($permittedProjectIds)) {
                    return response()->json(['data' => collect(), 'total' => 0]);
                }
                $query->where(function ($q) use ($user, $permittedProjectIds) {
                    $q->where('assigned_to', $user->id)
                        ->orWhere('created_by', $user->id)
                        ->orWhereIn('project_id', $permittedProjectIds)
                        ->orWhereHas('task', fn ($tq) => $tq->whereIn('project_id', $permittedProjectIds));
                });
                break;

            default:
                // Member: Deliverables directly assigned to or created by member + ALL deliverables within permitted projects
                $query->where(function ($q) use ($user, $permittedProjectIds) {
                    $q->where('assigned_to', $user->id)
                        ->orWhere('created_by', $user->id);

                    if (!empty($permittedProjectIds)) {
                        $q->orWhereIn('project_id', $permittedProjectIds)
                            ->orWhereHas('task', fn ($tq) => $tq->whereIn('project_id', $permittedProjectIds));
                    }
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
            $hasReopened = false;
            $includesPending = false;

            $statusGroups = [
                'pending' => [
                    'Pending', 'pending', 'planned', 'Planning', 'Planned', 'draft', 'Draft',
                    'todo', 'Todo', 'to_do', 'To_Do', 'to-do', 'To-Do', 'TODO', 'TO_DO', 'new', 'New', 'NEW',
                    'not_started', 'Not Started', 'not started', 'not-started', 'Not-Started', 'NOT_STARTED',
                    'unassigned', 'Unassigned', 'UNASSIGNED', 'reopened', 'Reopened', 'REOPENED',
                ],
                'in_progress' => [
                    'In Progress', 'in_progress', 'in progress', 'in-progress', 'In-Progress', 'IN_PROGRESS',
                    'doing', 'Doing', 'working', 'Working', 'underway', 'Underway', 'under_way', 'Under Way',
                    'acknowledged', 'Acknowledged', 'started', 'Started',
                ],
                'submitted' => [
                    'Submitted', 'submitted', 'review', 'Review', 'in_review', 'In Review', 'In_Review',
                    'under_review', 'Under Review', 'Under_Review', 'submitted_late', 'Submitted Late',
                    'awaiting_approval', 'Awaiting Approval', 'awaiting_checkpoint',
                ],
                'completed' => [
                    'Approved', 'approved', 'completed', 'Completed', 'done', 'Done', 'finished', 'Finished', 'closed', 'Closed',
                ],
                'paused' => [
                    'Paused', 'paused', 'pause', 'Pause', 'hold', 'Hold', 'on_hold', 'On Hold', 'on hold', 'on-hold', 'On-Hold',
                ],
                'declined' => [
                    'Declined', 'declined', 'rejected', 'Rejected', 'failed', 'Failed', 'rework_required', 'Rework Required',
                ],
                'abandoned' => [
                    'Abandoned', 'abandoned', 'abandon_requested', 'Abandon Requested', 'Abandon_Requested', 'cancelled', 'Cancelled', 'canceled', 'Canceled',
                ],
            ];

            foreach ($rawStatuses as $st) {
                $st = trim((string) $st);
                $stLower = strtolower($st);

                if ($stLower === 'due_today') {
                    $hasDueToday = true;
                } elseif ($stLower === 'transferred') {
                    $hasTransferred = true;
                } elseif ($stLower === 'reopened') {
                    $hasReopened = true;
                } elseif (in_array($stLower, ['pending', 'planned', 'planning', 'draft', 'todo', 'to_do', 'to-do', 'new', 'not_started', 'not started', 'not-started', 'unassigned'], true)) {
                    $includesPending = true;
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['pending']);
                } elseif (in_array($stLower, ['in_progress', 'in progress', 'in-progress', 'doing', 'working', 'underway', 'under_way', 'acknowledged', 'started'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['in_progress']);
                } elseif (in_array($stLower, ['submitted', 'review', 'in_review', 'under_review', 'submitted_late', 'awaiting_approval', 'awaiting_checkpoint'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['submitted']);
                } elseif (in_array($stLower, ['approved', 'completed', 'done', 'finished', 'closed'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['completed']);
                } elseif (in_array($stLower, ['paused', 'pause', 'hold', 'on_hold', 'on hold', 'on-hold'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['paused']);
                } elseif (in_array($stLower, ['declined', 'rejected', 'failed', 'rework_required'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['declined']);
                } elseif (in_array($stLower, ['abandoned', 'abandon_requested', 'cancelled', 'canceled'], true)) {
                    $expandedStatuses = array_merge($expandedStatuses, $statusGroups['abandoned']);
                } elseif (! empty($st)) {
                    $expandedStatuses[] = $st;
                }
            }

            $expandedStatuses = array_values(array_unique($expandedStatuses));
            $query->where(function ($sq) use ($expandedStatuses, $hasDueToday, $hasTransferred, $hasReopened, $includesPending) {
                $hasCondition = false;
                if (! empty($expandedStatuses)) {
                    if ($includesPending) {
                        $sq->where(function ($pq) use ($expandedStatuses) {
                            $pq->whereIn('status', $expandedStatuses)
                               ->orWhereNull('status')
                               ->orWhere('status', '');
                        });
                    } else {
                        $sq->whereIn('status', $expandedStatuses);
                    }
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
                        $hasCondition = true;
                    }
                }
                if ($hasReopened) {
                    $reopenedClause = function ($rq) {
                        $rq->where('is_reopened', true)
                           ->orWhere('status', 'reopened')
                           ->orWhere('status', 'Reopened')
                           ->orWhere('reopen_count', '>', 0)
                           ->orWhereNotNull('reopened_at');
                    };
                    if ($hasCondition) {
                        $sq->orWhere($reopenedClause);
                    } else {
                        $sq->where($reopenedClause);
                        $hasCondition = true;
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

        if ($timeFilter && $timeFilter !== 'custom' && $timeFilter !== 'all') {
            if ($timeFilter === 'today') {
                $query->whereDate('created_at', today());
            } elseif (is_numeric($timeFilter) && (int) $timeFilter > 0) {
                $query->where('created_at', '>=', now()->subDays((int) $timeFilter));
            }
        }

        if ($request->filled('start_date')) {
            $query->whereDate('start_date', '>=', $request->input('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('end_date', '<=', $request->input('end_date'));
        }

        // Priority filter
        $priorities = $request->input('priority', $request->input('priorities', []));
        if (is_string($priorities) && str_contains($priorities, ',')) {
            $priorities = explode(',', $priorities);
        }
        if (! is_array($priorities) && ! empty($priorities)) {
            $priorities = [$priorities];
        }
        if (! empty($priorities) && is_array($priorities)) {
            $priorities = array_values(array_filter(array_map('trim', $priorities)));
            if (! empty($priorities)) {
                $expandedPriorities = [];
                foreach ($priorities as $p) {
                    $expandedPriorities[] = $p;
                    $expandedPriorities[] = ucfirst(strtolower($p));
                    $expandedPriorities[] = strtolower($p);
                    $expandedPriorities[] = strtoupper($p);
                }
                $query->whereIn('priority', array_values(array_unique($expandedPriorities)));
            }
        }

        // Due date range
        $dueDateFrom = $request->input('due_date_from') ?: $request->input('end_date_from');
        $dueDateTo = $request->input('due_date_to') ?: $request->input('end_date_to');
        if ($dueDateFrom && $dueDateTo) {
            $query->whereDate('due_date', '>=', $dueDateFrom)->whereDate('due_date', '<=', $dueDateTo);
        } elseif ($dueDateFrom) {
            $query->whereDate('due_date', '>=', $dueDateFrom);
        } elseif ($dueDateTo) {
            $query->whereDate('due_date', '<=', $dueDateTo);
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
        $this->authorize('delegate', $deliverable);
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

        if ($deliverable->allow_transfer === false) {
            return response()->json(['success' => false, 'message' => 'Transfers are not allowed for this subtask'], 422);
        }

        if ($deliverable->status === 'pending') {
            return response()->json(['success' => false, 'message' => 'You must acknowledge this subtask first before transferring it'], 422);
        }

        if ($deliverable->pendingDelegations()->exists()) {
            return response()->json(['success' => false, 'message' => 'This subtask already has a pending transfer'], 422);
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
        if (! $delegatedTo || $delegatedTo->active === false || $delegatedTo->status === 'resigned') {
            return response()->json(['success' => false, 'message' => 'The selected user is not active'], 422);
        }

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
        $this->authorize('acceptDelegation', $deliverable);
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
        $this->authorize('rejectDelegation', $deliverable);
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
        $this->authorize('revokeDelegation', $deliverable);
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
        $this->authorize('view', $deliverable);
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
        $this->authorize('submit', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Abandon Requested',
                description: "Requested to abandon subtask {$deliverable->title}".(! empty($validated['reason']) ? " Reason: {$validated['reason']}" : ''),
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable requestAbandon', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('approve', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Abandoned',
                description: "Approved abandon request for subtask {$deliverable->title}",
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable approveAbandon', ['error' => $e->getMessage()]);
        }

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
        $this->authorize('approve', $deliverable);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Abandon Declined',
                description: "Declined abandon request for subtask {$deliverable->title}".(! empty($validated['reason']) ? " Reason: {$validated['reason']}" : ''),
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable declineAbandon', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Subtask abandon request declined',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }

    /**
     * Directly abandon a deliverable/subtask. Both relevant participants (Assigner and Assignee) may abandon.
     */
    public function abandon(Request $request, Deliverable $deliverable)
    {
        $this->authorize('abandon', $deliverable);
        $user = $request->user();
        $isCreator = (int) $deliverable->created_by === (int) $user->id || ($deliverable->task && (int) $deliverable->task->assigned_by === (int) $user->id);
        $isAssignee = (int) $deliverable->assigned_to === (int) $user->id || (int) ($deliverable->current_owner ?? 0) === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager', 'super_admin']);

        if (! $isCreator && ! $isAssignee && ! $isAdminOrManager) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only the creator, assignee, or Admin/Manager can abandon subtasks'], 403);
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

        try {
            $this->auditService->log(
                module: 'Subtask Management',
                action: 'Subtask Abandoned',
                description: "Abandoned subtask {$deliverable->title}".(! empty($validated['reason']) ? " Reason: {$validated['reason']}" : ''),
                user: $user,
                entityType: 'Deliverable',
                entityId: $deliverable->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit in deliverable abandon', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Subtask abandoned successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'abandonRequestedBy:id,name', 'abandonedBy:id,name', 'abandonDeclinedBy:id,name']),
        ]);
    }

    /**
     * Get IDs of all projects permitted/accessible to the given user based on their role,
     * team memberships/leadership, assigned_users, manual visibility, and guest access.
     */
    protected function getPermittedProjectIds(User $user): array
    {
        if (in_array($user->role, ['admin', 'manager', 'super_admin'])) {
            return Project::pluck('id')->toArray();
        }

        if ($user->role === 'guest') {
            return Project::where(function ($q) use ($user) {
                $q->whereJsonContains('guest_ids', (int) $user->id)
                    ->orWhereJsonContains('guest_ids', (string) $user->id);
            })->pluck('id')->toArray();
        }

        $userTeamIds = Team::where('leader_id', $user->id)
            ->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id))
            ->pluck('id')
            ->toArray();

        return Project::where(function ($q) use ($user, $userTeamIds) {
            $q->whereHas('manuallyVisibleTo', fn ($mq) => $mq->where('user_id', $user->id))
                ->orWhere(function ($sq) use ($user, $userTeamIds) {
                    $sq->where(function ($sub) use ($user, $userTeamIds) {
                        $sub->where('created_by', $user->id)
                            ->orWhereIn('team_id', $userTeamIds)
                            ->orWhereHas('team.members', fn ($tq) => $tq->where('users.id', $user->id))
                            ->orWhereHas('team', fn ($tq) => $tq->where('leader_id', $user->id));

                        if (!empty($userTeamIds)) {
                            foreach ($userTeamIds as $tid) {
                                $sub->orWhereJsonContains('team_ids', (int) $tid)
                                    ->orWhereJsonContains('team_ids', (string) $tid);
                            }
                        }
                    })->whereDoesntHave('visibility', fn ($vq) => $vq->where('user_id', $user->id)->where('is_visible', false));
                })
                ->orWhereJsonContains('assigned_users', (int) $user->id)
                ->orWhereJsonContains('assigned_users', (string) $user->id);
        })->pluck('id')->toArray();
    }

    /**
     * Get unified activity feed for a deliverable with date, user_id, and type filtering.
     *
     * @param Request $request
     * @param Deliverable $deliverable
     * @return JsonResponse
     */
    public function activities(Request $request, Deliverable $deliverable): JsonResponse
    {
        $startDate = $request->query('start_date') ?: $request->query('date_from');
        $endDate = $request->query('end_date') ?: $request->query('date_to');
        $dateFilter = $request->query('date');
        $userFilter = $request->query('user_id');
        $typeFilter = $request->query('type');

        $feed = collect();

        // 1. Deliverable Workflow Events (Timelines & Submissions)
        $events = DeliverableWorkflowEvent::with('user:id,name,email,role')
            ->where('deliverable_id', $deliverable->id)
            ->get();

        foreach ($events as $e) {
            $action = $e->event_type ?: 'updated';
            $category = in_array($action, ['submitted', 'resubmitted']) ? 'submissions' : 'timelines';
            $feed->push([
                'id' => 'evt-' . $e->id,
                'type' => $category,
                'category' => $category,
                'action' => $action,
                'title' => ucfirst(str_replace('_', ' ', $action)),
                'description' => $e->comment ?: "Subtask status changed to {$action}",
                'user_id' => $e->user_id,
                'user_name' => $e->user?->name ?? 'System',
                'created_at' => $e->created_at->toIso8601String(),
                'details' => ['comment' => $e->comment, 'instructions' => $e->instructions],
            ]);
        }

        // 2. Deliverable Changes (Field Changes)
        $changes = DeliverableChange::with('modifiedBy:id,name,email,role')
            ->where('deliverable_id', $deliverable->id)
            ->get();

        foreach ($changes as $c) {
            $feed->push([
                'id' => 'chg-' . $c->id,
                'type' => 'changes',
                'category' => 'changes',
                'action' => 'field_updated',
                'title' => 'Field Updated: ' . ucwords(str_replace('_', ' ', $c->field_name)),
                'description' => "Changed from '" . ($c->old_value ?? 'none') . "' to '" . ($c->new_value ?? 'none') . "'",
                'user_id' => $c->modified_by,
                'user_name' => $c->modifiedBy?->name ?? 'System',
                'created_at' => $c->created_at->toIso8601String(),
                'details' => ['field' => $c->field_name, 'old' => $c->old_value, 'new' => $c->new_value],
            ]);
        }

        // 3. Deliverable Submissions
        $submissions = DeliverableSubmission::with('submittedBy:id,name,email,role')
            ->where('deliverable_id', $deliverable->id)
            ->get();

        foreach ($submissions as $s) {
            $feed->push([
                'id' => 'sub-' . $s->id,
                'type' => 'submissions',
                'category' => 'submissions',
                'action' => 'submitted',
                'title' => 'Submission #' . ($s->version_number ?? 1),
                'description' => $s->comment ?: 'Subtask submission',
                'user_id' => $s->submitted_by,
                'user_name' => $s->submittedBy?->name ?? 'User',
                'created_at' => $s->created_at->toIso8601String(),
                'details' => ['reopen_reason' => $s->reopen_reason, 'status' => $s->status],
            ]);
        }

        // 4. Delegations / Transfers
        $delegations = TaskDelegation::with(['delegatedBy:id,name,role', 'delegatedTo:id,name,role'])
            ->where('deliverable_id', $deliverable->id)
            ->get();

        foreach ($delegations as $d) {
            $feed->push([
                'id' => 'dlg-' . $d->id,
                'type' => 'transfers',
                'category' => 'transfers',
                'action' => 'transferred',
                'title' => 'Subtask Transferred / Delegated',
                'description' => 'Transferred to ' . ($d->delegatedTo?->name ?? 'User') . ($d->reason ? ". Reason: {$d->reason}" : ''),
                'user_id' => $d->delegated_by,
                'user_name' => $d->delegatedBy?->name ?? 'User',
                'created_at' => $d->created_at->toIso8601String(),
                'details' => ['reason' => $d->reason, 'to' => $d->delegatedTo?->name],
            ]);
        }

        // 5. General Activity Logs for deliverable
        $activities = \App\Models\Activity::with('user:id,name,email,role')
            ->where('related_module', 'deliverable')
            ->where('related_id', $deliverable->id)
            ->get();

        foreach ($activities as $a) {
            $cat = str_contains($a->action, 'transfer') ? 'transfers' : (str_contains($a->action, 'submit') ? 'submissions' : 'timelines');
            $feed->push([
                'id' => 'act-' . $a->id,
                'type' => $cat,
                'category' => $cat,
                'action' => $a->action,
                'title' => ucfirst(str_replace('_', ' ', $a->action)),
                'description' => $a->description,
                'user_id' => $a->user_id,
                'user_name' => $a->user?->name ?? 'System',
                'created_at' => $a->created_at->toIso8601String(),
                'details' => [],
            ]);
        }

        // Filter by Date Range or Single Date
        if ($startDate) {
            $formattedStart = ActivityService::parseQueryDate($startDate);
            if ($formattedStart) {
                $feed = $feed->filter(function ($item) use ($formattedStart) {
                    $d = substr($item['created_at'], 0, 10);
                    return $d >= $formattedStart;
                });
            }
        }
        if ($endDate) {
            $formattedEnd = ActivityService::parseQueryDate($endDate);
            if ($formattedEnd) {
                $feed = $feed->filter(function ($item) use ($formattedEnd) {
                    $d = substr($item['created_at'], 0, 10);
                    return $d <= $formattedEnd;
                });
            }
        }
        if ($dateFilter && !$startDate && !$endDate) {
            $targetDate = ActivityService::parseQueryDate($dateFilter);
            if ($targetDate) {
                $feed = $feed->filter(function ($item) use ($targetDate) {
                    $d1 = substr($item['created_at'], 0, 10);
                    if ($d1 === $targetDate) return true;
                    $ts = strtotime($item['created_at']);
                    return $ts !== false && date('Y-m-d', $ts) === $targetDate;
                });
            }
        }

        // Filter by User / Person
        if ($userFilter) {
            $feed = $feed->filter(fn ($item) => (string) $item['user_id'] === (string) $userFilter);
        }

        // Filter by Type
        if ($typeFilter && $typeFilter !== 'all') {
            $feed = $feed->filter(fn ($item) => $item['type'] === $typeFilter);
        }

        // Sort DESC
        $sorted = $feed->sortByDesc('created_at')->values();

        // Extract list of unique users for dropdown
        $users = collect([$deliverable->assignee, $deliverable->creator, $deliverable->currentOwner])
            ->filter()
            ->unique('id')
            ->values()
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]);

        return response()->json([
            'success' => true,
            'data' => $sorted,
            'users' => $users,
        ]);
    }

    /**
     * Alias for activities feed.
     */
    public function unifiedActivity(Request $request, Deliverable $deliverable): JsonResponse
    {
        return $this->activities($request, $deliverable);
    }

    /**
     * Compute aggregate status counts directly at the database (SQL) level for deliverables.
     */
    private function computeDeliverableStatusCountsFromQuery($query): array
    {
        $today = Carbon::today()->toDateString();
        $countQuery = (clone $query)->setEagerLoads([])->reorder();

        // Status grouped counts
        $statusCounts = (clone $countQuery)
            ->select('deliverables.status', DB::raw('count(*) as aggregate'))
            ->groupBy('deliverables.status')
            ->pluck('aggregate', 'deliverables.status')
            ->toArray();

        // Due today count: due_date = today and status not in approved/completed/done/abandoned
        $dueTodayCount = (clone $countQuery)
            ->whereDate('deliverables.due_date', $today)
            ->whereNotIn('deliverables.status', ['approved', 'completed', 'done', 'abandoned', 'Approved', 'Completed', 'Done', 'Abandoned', 'closed', 'Closed'])
            ->count();

        // Reopened count (independent modifier metric)
        $reopenedCount = (clone $countQuery)
            ->where(function ($rq) {
                $rq->where('deliverables.is_reopened', true)
                   ->orWhere('deliverables.status', 'reopened')
                   ->orWhere('deliverables.status', 'Reopened')
                   ->orWhere('deliverables.reopen_count', '>', 0)
                   ->orWhereNotNull('deliverables.reopened_at');
            })
            ->count();

        // Transferred count (independent modifier metric)
        $transferredCount = (clone $countQuery)
            ->where(function ($tq) {
                $tq->where('deliverables.is_transferred', true)
                   ->orWhere(function ($dtq) {
                       $dtq->whereNotNull('deliverables.delegation_chain')->where('deliverables.delegation_chain', '!=', '[]');
                   });
            })
            ->count();

        $counts = [
            'all' => 0,
            'due_today' => $dueTodayCount,
            'dueToday' => $dueTodayCount,
            'pending' => 0,
            'in_progress' => 0,
            'inProgress' => 0,
            'paused' => 0,
            'submitted' => 0,
            'completed' => 0,
            'approved' => 0,
            'declined' => 0,
            'rejected' => 0,
            'abandoned' => 0,
            'reopened' => $reopenedCount,
            'transferred' => $transferredCount,
        ];

        $statusGroups = [
            'pending' => ['pending', 'planned', 'planning', 'draft', 'todo', 'to_do', 'to-do', 'new', 'not_started', 'not started', 'not-started', 'unassigned', 'reopened', ''],
            'in_progress' => ['in_progress', 'in progress', 'in-progress', 'doing', 'working', 'underway', 'under_way', 'acknowledged', 'started'],
            'paused' => ['paused', 'pause', 'hold', 'on_hold', 'on hold', 'on-hold'],
            'submitted' => ['submitted', 'review', 'in_review', 'under_review', 'submitted_late', 'awaiting_approval', 'awaiting_checkpoint'],
            'completed' => ['completed', 'approved', 'done', 'finished', 'closed'],
            'declined' => ['declined', 'rejected', 'failed', 'rework_required'],
            'abandoned' => ['abandoned', 'abandon_requested', 'cancelled', 'canceled'],
        ];

        foreach ($statusCounts as $rawStatus => $cnt) {
            $cnt = (int) $cnt;
            $counts['all'] += $cnt;
            $st = strtolower(trim((string) $rawStatus));

            if (in_array($st, $statusGroups['in_progress'], true)) {
                $counts['in_progress'] += $cnt;
                $counts['inProgress'] += $cnt;
            } elseif (in_array($st, $statusGroups['paused'], true)) {
                $counts['paused'] += $cnt;
            } elseif (in_array($st, $statusGroups['submitted'], true)) {
                $counts['submitted'] += $cnt;
            } elseif (in_array($st, $statusGroups['completed'], true)) {
                $counts['completed'] += $cnt;
                $counts['approved'] += $cnt;
            } elseif (in_array($st, $statusGroups['declined'], true)) {
                $counts['declined'] += $cnt;
                $counts['rejected'] += $cnt;
            } elseif (in_array($st, $statusGroups['abandoned'], true)) {
                $counts['abandoned'] += $cnt;
            } else {
                // Sums ALL pending variants, reopened, todo, draft, not_started, unassigned, and null/empty
                $counts['pending'] += $cnt;
            }
        }

        return $counts;
    }
}
