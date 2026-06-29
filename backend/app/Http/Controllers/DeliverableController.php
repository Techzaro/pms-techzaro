<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\DeliverableWorkflowEvent;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SubmissionAttachment;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Controller for managing deliverables within projects.
 * Handles CRUD operations, submission/approval workflows, file management,
 * reordering, and notifications for deliverables.
 */
class DeliverableController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService
    ) {}

    /**
     * List deliverables assigned to or created by the authenticated user.
     *
     * Supports filtering by 'assignee' or 'creator' view, status filtering
     * (including a special 'due_today' filter), and bulk submission status checks.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: 'view' (assignee|creator), 'status', and other filter params.
     * @return \Illuminate\Http\JsonResponse  JSON response with deliverable list.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $view = $request->query('view', 'assignee');
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) unset($filters['status']);

        $query = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title', 'latestSubmission',
        ]);

        if ($view === 'assignee') {
            $query->where('assigned_to', $user->id)->where('created_by', '!=', $user->id);
        } else {
            $query->where('created_by', $user->id);
        }

        $query->when($isDueTodayFilter, fn ($q) => $q->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses()));

        $deliverables = $query->orderBy('sort_order', 'asc')->filter($filters)->get();

        // Bulk has_submitted query
        $deliverableIds = $deliverables->pluck('id');
        $submittedIds = [];
        if ($deliverableIds->isNotEmpty()) {
            $submittedIds = DeliverableSubmission::where('submitted_by', $user->id)
                ->whereIn('deliverable_id', $deliverableIds)
                ->pluck('deliverable_id')
                ->toArray();
        }

        $deliverables->transform(function ($deliverable) use ($submittedIds) {
            $deliverable->has_submitted = in_array($deliverable->id, $submittedIds);
            return $deliverable;
        });

        return response()->json(['success' => true, 'data' => $deliverables]);
    }

    /**
     * List deliverables created by the authenticated user (or by all admin/manager users for admin/manager roles).
     * Excludes self-assigned deliverables.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters for filtering.
     * @return \Illuminate\Http\JsonResponse  JSON response with deliverable list.
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) unset($filters['status']);

        $query = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email',
            'latestSubmission.attachments', 'reopenedBy:id,name',
        ]);

        if ($isAdminOrManager) {
            $adminManagerIds = Cache::remember('admin_manager_ids', 3600, fn () =>
                User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray()
            );
            $query->whereIn('created_by', $adminManagerIds);
        } else {
            $query->where('created_by', $user->id);
        }

        $query->whereColumn('created_by', '!=', 'assigned_to');
        $query->when($isDueTodayFilter, fn ($q) => $q->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses()));

        return response()->json(['success' => true, 'data' => $query->orderBy('sort_order')->orderBy('id')->filter($filters)->get()]);
    }

    /**
     * List deliverables that are both assigned to and created by the authenticated user (self-created deliverables).
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters for filtering.
     * @return \Illuminate\Http\JsonResponse  JSON response with self-created deliverable list.
     */
    public function mySelfDeliverables(Request $request)
    {
        $user = $request->user();
        $isDueTodayFilter = $request->input('status') === 'due_today';
        $filters = $request->query();
        if ($isDueTodayFilter) unset($filters['status']);

        $deliverables = Deliverable::with([
            'project:id,title', 'assignee:id,name,email,role',
            'creator:id,name,role', 'task:id,title',
            'latestSubmission', 'latestSubmission.submittedBy:id,name,email', 'latestSubmission.attachments',
        ])
            ->where('assigned_to', $user->id)
            ->where('created_by', $user->id)
            ->when($isDueTodayFilter, fn ($q) => $q->whereDate('due_date', today())->whereNotIn('status', $this->dueTodayExcludedStatuses()))
            ->orderBy('sort_order')->orderBy('id')
            ->filter($filters)
            ->get();

        return response()->json(['success' => true, 'data' => $deliverables]);
    }

    /**
     * Retrieve a single deliverable with all related data (submissions, workflow events, changes).
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  int  $id  The ID of the deliverable to retrieve.
     * @return \Illuminate\Http\JsonResponse  JSON response with full deliverable details or 403 unauthorized.
     */
    public function show(Request $request, $id)
    {
        $deliverable = Deliverable::findOrFail($id);
        $user = request()->user();
        $isCreator = $deliverable->created_by === $user->id;
        $isAssignee = $deliverable->assigned_to === $user->id;

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $deliverable->load([
            'project:id,title', 'assignee:id,name,email,role', 'creator:id,name,email',
            'task:id,title,assigned_by', 'task.assigner:id,name,email',
            'submissions' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
            'latestSubmission' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            'workflowEvents' => fn($q) => $q->with('user:id,name,email'),
            'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ]);

        $payload = $deliverable->toArray();
        $payload['unviewed_changes'] = $deliverable->unviewedChanges;
        $payload['unviewed_changes_count'] = $deliverable->unviewedChanges->count();

        return response()->json(['success' => true, 'deliverable' => $payload]);
    }

    /**
     * Create a new deliverable within a project.
     *
     * Creates workflow events for creation and assignment, and sends a notification
     * to the assignee if the deliverable is assigned to a different user.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input: title, description, status, priority, due_date, assigned_to, task_id.
     * @param  \App\Models\Project  $project  The parent project.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created deliverable.
     */
    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'status' => 'nullable|string|max:64', 'priority' => 'nullable|string|max:32',
            'due_date' => 'nullable|date', 'assigned_to' => 'nullable|exists:users,id|required_without:task_id',
            'task_id' => 'nullable|exists:tasks,id',
        ]);

        $user = $request->user();

        $deliverable = $project->deliverables()->create([
            'title' => $validated['title'], 'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending', 'priority' => $validated['priority'] ?? 'Medium',
            'due_date' => $validated['due_date'] ?? null, 'assigned_to' => $validated['assigned_to'] ?? null,
            'task_id' => $validated['task_id'] ?? null, 'created_by' => $user->id,
        ]);

        // Create workflow event for deliverable creation
        $assigneeName = $deliverable->assigned_to ? (User::find($deliverable->assigned_to)?->name ?? '') : '';
        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'user_id' => $user->id,
            'event_type' => 'created',
            'comment' => $assigneeName ? 'Assigned to ' . $assigneeName : null,
        ]);

        // Create separate assignment event for the assignee's activity feed
        if ($deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $user->id) {
            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'user_id' => $user->id,
                'event_type' => 'assigned',
                'comment' => 'Assigned to ' . $assigneeName,
            ]);
        }

        if ($deliverable->assigned_to && $deliverable->assigned_to !== $user->id) {
            $this->sendDeliverableNotification($deliverable, $user, 'deliverable_assigned', 'Deliverable Assigned');
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
     * @param  \Illuminate\Http\Request  $request  Validated input for updatable fields.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated deliverable and change count.
     */
    public function update(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;
        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255', 'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|string|max:64', 'priority' => 'sometimes|string|max:32',
            'due_date' => 'sometimes|nullable|date', 'assigned_to' => 'sometimes|nullable|exists:users,id',
        ]);

        $oldValues = [];
        foreach (['title', 'description', 'priority', 'due_date', 'status'] as $f) {
            if (array_key_exists($f, $validated)) $oldValues[$f] = $deliverable->{$f};
        }
        $oldAssignedTo = $deliverable->assigned_to;
        $deliverable->update($validated);

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $deliverable->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) $changes[] = ['field_name' => $f, 'label' => ucfirst(str_replace('_', ' ', $f)), 'old_value' => $oldStr, 'new_value' => $newStr];
        }

        if (array_key_exists('assigned_to', $validated) && (int) $validated['assigned_to'] !== (int) $oldAssignedTo) {
            $oldName = $oldAssignedTo ? User::find($oldAssignedTo)?->name : 'None';
            $newName = $validated['assigned_to'] ? User::find($validated['assigned_to'])?->name : 'None';
            $changes[] = ['field_name' => 'assigned_to', 'label' => 'Assignee', 'old_value' => $oldName ?? 'None', 'new_value' => $newName ?? 'None'];
        }

        if (!empty($changes)) {
            $deliverable->changes()->createMany(
                array_map(fn ($c) => [
                    'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
                    'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
                ], $changes)
            );
            DeliverableWorkflowEvent::insert(
                array_map(fn ($c) => [
                    'deliverable_id' => $deliverable->id, 'event_type' => 'field_changed',
                    'user_id' => $user->id, 'comment' => $c['label'] . ': ' . $c['old_value'] . ' → ' . $c['new_value'],
                ], $changes)
            );
        }

        $this->sendDeliverableUpdateNotification($deliverable, $user, $changes);

        return response()->json([
            'success' => true,
            'message' => count($changes) > 0 ? 'Deliverable updated — ' . count($changes) . ' change(s) made' : 'Deliverable updated successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
            'changes_count' => count($changes),
        ]);
    }

    /**
     * Delete a deliverable. Only the creator or admin/manager can delete.
     *
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function destroy(Deliverable $deliverable)
    {
        $user = request()->user();
        $isCreator = $deliverable->created_by === $user->id;
        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        $deliverable->delete();
        return response()->json(['success' => true, 'message' => 'Deliverable deleted successfully']);
    }

    /**
     * Submit a deliverable for review by its creator.
     *
     * Handles file uploads (single and multiple), link attachments, and determines
     * whether this is a first submission or a resubmission. Creates workflow events
     * and notifications for the creator.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, file, files[], links[].
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to submit.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated deliverable.
     */
    public function submit(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ($deliverable->assigned_to !== $user->id) return response()->json(['success' => false, 'message' => 'Only the assignee can submit this deliverable'], 403);
        if (!in_array($deliverable->status, ['pending', 'rejected', 'reopened', 'rework_required'])) return response()->json(['success' => false, 'message' => 'This deliverable cannot be submitted in its current status'], 422);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'file' => 'nullable|file|max:51200',
            'files' => 'nullable|array', 'files.*' => 'file|max:51200',
            'links' => 'nullable|array', 'links.*' => 'string|max:2048',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('deliverable-submissions/' . $deliverable->id, 'public');
        }

        $submission = DeliverableSubmission::create([
            'deliverable_id' => $deliverable->id, 'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        if ($request->hasFile('files')) {
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(fn ($file) => [
                    'submission_type' => 'deliverable',
                    'file_name' => basename($path = $file->store('deliverable-submissions/' . $deliverable->id, 'public')),
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
                    'submission_type' => 'deliverable', 'file_name' => $url,
                    'original_name' => $url, 'attachment_type' => 'link', 'url' => $url,
                ])->toArray()
            );
        }

        $isResubmit = in_array($deliverable->status, ['rejected', 'reopened', 'rework_required']);

        $updateData = ['status' => 'submitted', 'submitted_at' => now()];
        if (in_array($deliverable->status, ['rejected', 'reopened'])) {
            foreach (['rejected_at','rejected_by','rejection_comment','reopened_at','reopened_by','reopen_comment','reopen_instructions','reopen_new_deadline'] as $f) $updateData[$f] = null;
        }
        if ($deliverable->status === 'rework_required') {
            foreach (['rework_comment','rework_instructions','rework_new_deadline','rework_file_path','rework_file_name'] as $f) $updateData[$f] = null;
        }
        $deliverable->update($updateData);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'user_id' => $user->id,
            'event_type' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $creatorId = $deliverable->created_by;
        if ($creatorId && $creatorId !== $user->id) {
            $this->notificationService->notify(
                $creatorId,
                $user->id,
                'deliverable_submitted',
                'deliverable',
                $deliverable->id,
                'Deliverable Submitted',
                $user->name . ' has submitted the deliverable "' . $deliverable->title . '" for your review.',
                '/deliveries-by-you?selectedDeliverable=' . $deliverable->id
            );
        }

        // Log activity
        $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
        $this->activityService->log($user->id, 'deliverable_' . $isResubmitLabel, 'You ' . $isResubmitLabel . ' deliverable "' . $deliverable->title . '" for review', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable submitted successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role', 'creator:id,name',
                'submissions' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            ]),
        ]);
    }

    /**
     * Approve a submitted deliverable. Only the creator or admin/manager can approve.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to approve (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the approved deliverable.
     */
    public function approve(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;
        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($deliverable->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only approve submitted deliverables'], 422);

        $deliverable->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id]);

        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'approval', 'user_id' => $user->id]);

        if ($deliverable->assigned_to) {
            $this->notificationService->notify(
                $deliverable->assigned_to,
                $user->id,
                'deliverable_approved',
                'deliverable',
                $deliverable->id,
                'Deliverable Approved',
                'Your deliverable "' . $deliverable->title . '" has been approved.',
                '/deliveries?selectedDeliverable=' . $deliverable->id
            );
        }

        // Log activity
        $this->activityService->log($user->id, 'deliverable_approved', 'You approved deliverable "' . $deliverable->title . '"', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name']),
        ]);
    }

    /**
     * Reject a submitted deliverable with an optional comment.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment (optional).
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to reject (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the rejected deliverable.
     */
    public function reject(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;
        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($deliverable->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only reject submitted deliverables'], 422);

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $deliverable->update([
            'status' => 'rejected', 'rejected_at' => now(), 'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
        ]);

        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'rejected', 'user_id' => $user->id, 'comment' => $validated['comment'] ?? null]);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "' . $deliverable->title . '" has been rejected. Please review and resubmit.';
            if (!empty($validated['comment'])) $msg .= ' Reason: ' . $validated['comment'];
            $this->notificationService->notify(
                $deliverable->assigned_to,
                $user->id,
                'deliverable_rejected',
                'deliverable',
                $deliverable->id,
                'Deliverable Rejected',
                $msg,
                '/deliveries?selectedDeliverable=' . $deliverable->id
            );
        }

        // Log activity
        $this->activityService->log($user->id, 'deliverable_rejected', 'You rejected deliverable "' . $deliverable->title . '"', 'deliverable', $deliverable->id);

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
     * @param  \Illuminate\Http\Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to reopen.
     * @return \Illuminate\Http\JsonResponse  JSON response with the reopened deliverable.
     */
    public function reopen(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;
        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($deliverable->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only reopen submitted deliverables'], 422);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000', 'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date', 'file' => 'nullable|file|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file'); $fileName = $file->getClientOriginalName();
            $filePath = $file->store('deliverable-reopen/' . $deliverable->id, 'public');
        }

        $updateData = [
            'status' => 'reopened', 'reopened_at' => now(), 'reopened_by' => $user->id,
            'reopen_comment' => $validated['comment'] ?? null, 'reopen_instructions' => $validated['instructions'] ?? null,
        ];
        if (!empty($validated['new_deadline'])) $updateData['reopen_new_deadline'] = $validated['new_deadline'];
        if (!empty($filePath)) { $updateData['reopen_file_path'] = $filePath; $updateData['reopen_file_name'] = $fileName; }

        $deliverable->update($updateData);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'event_type' => 'reopened', 'user_id' => $user->id,
            'comment' => $validated['comment'] ?? null, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "' . $deliverable->title . '" has been reopened for revision.';
            if (!empty($validated['comment'])) $msg .= ' Comment: ' . $validated['comment'];
            if (!empty($validated['instructions'])) $msg .= ' Instructions: ' . $validated['instructions'];
            $this->notificationService->notify(
                $deliverable->assigned_to,
                $user->id,
                'deliverable_reopened',
                'deliverable',
                $deliverable->id,
                'Deliverable Reopened',
                $msg,
                '/deliveries?selectedDeliverable=' . $deliverable->id
            );
        }

        // Log activity
        $this->activityService->log($user->id, 'deliverable_reopened', 'You reopened deliverable "' . $deliverable->title . '" for revision', 'deliverable', $deliverable->id);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable reopened successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'reopenedBy:id,name']),
        ]);
    }

    /**
     * Self-approve a deliverable (user is both creator and assignee).
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to approve.
     * @return \Illuminate\Http\JsonResponse  JSON response with the approved deliverable.
     */
    public function selfApprove(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ($deliverable->created_by !== $user->id || $deliverable->assigned_to !== $user->id) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($deliverable->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only approve submitted deliverables'], 422);

        $deliverable->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id]);
        DeliverableWorkflowEvent::create(['deliverable_id' => $deliverable->id, 'event_type' => 'approval', 'user_id' => $user->id]);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name', 'approvedBy:id,name']),
        ]);
    }

    /**
     * Mark a self-created deliverable for rework (user is both creator and assignee).
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to mark for rework.
     * @return \Illuminate\Http\JsonResponse  JSON response with the rework-updated deliverable.
     */
    public function selfRework(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        if ($deliverable->created_by !== $user->id || $deliverable->assigned_to !== $user->id) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if ($deliverable->status !== 'submitted') return response()->json(['success' => false, 'message' => 'Can only rework submitted deliverables'], 422);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000', 'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date', 'file' => 'nullable|file|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file'); $fileName = $file->getClientOriginalName();
            $filePath = $file->store('deliverable-rework/' . $deliverable->id, 'public');
        }

        $updateData = [
            'status' => 'rework_required', 'rework_comment' => $validated['comment'] ?? null,
            'rework_instructions' => $validated['instructions'] ?? null,
        ];
        if (!empty($validated['new_deadline'])) $updateData['rework_new_deadline'] = $validated['new_deadline'];
        if (!empty($filePath)) { $updateData['rework_file_path'] = $filePath; $updateData['rework_file_name'] = $fileName; }

        $deliverable->update($updateData);
        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id, 'event_type' => 'rework', 'user_id' => $user->id,
            'comment' => $validated['comment'] ?? null, 'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Deliverable marked for rework',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
        ]);
    }

    /**
     * Download the file attached to a deliverable submission.
     *
     * @param  \App\Models\DeliverableSubmission  $submission  The submission containing the file.
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\JsonResponse  File download or error.
     */
    public function downloadSubmissionFile(DeliverableSubmission $submission)
    {
        $user = request()->user();
        $deliverable = $submission->deliverable;
        $isCreator = $deliverable->created_by === $user->id;
        $isAssignee = $deliverable->assigned_to === $user->id;

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) return response()->json(['success' => false, 'message' => 'File not found'], 404);

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    /**
     * Get the most recent submission for a deliverable.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable to get the latest submission for.
     * @return \Illuminate\Http\JsonResponse  JSON response with the latest submission.
     */
    public function latestSubmission(Request $request, Deliverable $deliverable)
    {
        $submission = DeliverableSubmission::where('deliverable_id', $deliverable->id)
            ->with(['submittedBy:id,name,email', 'attachments'])->latest()->first();
        return response()->json(['success' => true, 'submission' => $submission]);
    }

    /**
     * Mark all unviewed changes on a deliverable as read.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Deliverable  $deliverable  The deliverable whose changes to mark.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming changes marked.
     */
    public function markChangesRead(Request $request, Deliverable $deliverable)
    {
        $deliverable->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    /**
     * Download or view an attachment from a submission. Supports both file and link types.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameter 'action' can be 'download' to force download.
     * @param  \App\Models\SubmissionAttachment  $attachment  The attachment to retrieve.
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\RedirectResponse|\Illuminate\Http\JsonResponse  File, redirect, or error.
     */
    public function downloadAttachment(Request $request, SubmissionAttachment $attachment)
    {
        $user = $this->resolveDocAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        if ($attachment->attachment_type === 'link') return redirect($attachment->url);
        if (!$attachment->file_path) return response()->json(['success' => false, 'message' => 'File not found'], 404);

        $fullPath = storage_path('app/public/' . $attachment->file_path);
        if (!file_exists($fullPath)) return response()->json(['success' => false, 'message' => 'File not found on disk'], 404);

        $filename = $attachment->original_name ?? basename($attachment->file_path);

        if ($request->query('action') === 'download') {
            return response()->download($fullPath, $filename);
        }

        return response()->file($fullPath, ['Cache-Control' => 'public, max-age=3600']);
    }

    /**
     * Reorder deliverables by updating their sort_order values in bulk.
     *
     * @param  \Illuminate\Http\Request  $request  Input: items[] with id and sort_order.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming reorder.
     */
    public function reorder(Request $request)
    {
        $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer|exists:deliverables,id', 'items.*.sort_order' => 'required|integer|min:0']);
        $ids = []; $cases = []; $bindings = [];
        foreach ($request->items as $i => $item) {
            $ids[] = $item['id'];
            $cases[] = "WHEN ? THEN ?";
            $bindings[] = $item['id'];
            $bindings[] = $item['sort_order'];
        }
        if (!empty($ids)) {
            $placeholders = implode(', ', array_fill(0, count($ids), '?'));
            DB::statement("UPDATE deliverables SET sort_order = CASE id " . implode(' ', $cases) . " END WHERE id IN ($placeholders)", [...$bindings, ...$ids]);
        }
        return response()->json(['success' => true, 'message' => 'Deliverables reordered successfully']);
    }

    /**
     * Send a notification to the deliverable assignee about assignment.
     *
     * @param  \App\Models\Deliverable  $deliverable  The deliverable being assigned.
     * @param  \App\Models\User  $sender  The user who assigned the deliverable.
     * @param  string  $type  The notification type identifier.
     * @param  string  $title  The notification title.
     * @return void
     */
    private function sendDeliverableNotification(Deliverable $deliverable, User $sender, string $type, string $title): void
    {
        $deliverable->loadMissing('task:id,title');
        $taskTitle = $deliverable->task->title ?? '';
        $dueDate = $deliverable->due_date ? $deliverable->due_date->format('d-M-Y') : '';
        $message = 'A new deliverable "' . $deliverable->title . '" has been assigned to you.';
        if ($sender->name) $message .= ' by ' . $sender->name . '.';
        if ($taskTitle) $message .= ' Task: ' . $taskTitle . '.';
        if ($dueDate) $message .= ' Due Date: ' . $dueDate . '.';

        $this->notificationService->notify(
            $deliverable->assigned_to,
            $sender->id,
            $type,
            'deliverable',
            $deliverable->id,
            $title,
            $message,
            '/deliveries?selectedDeliverable=' . $deliverable->id
        );
    }

    /**
     * Send a notification about deliverable updates, or an assignment notification if assignee changed.
     *
     * @param  \App\Models\Deliverable  $deliverable  The updated deliverable.
     * @param  \App\Models\User  $updater  The user who made the update.
     * @param  array  $changes  Array of changes made to the deliverable.
     * @return void
     */
    private function sendDeliverableUpdateNotification(Deliverable $deliverable, User $updater, array $changes): void
    {
        if (isset($changes[0]) && $changes[0]['field_name'] === 'assigned_to') {
            $this->sendDeliverableNotification($deliverable, $updater, 'deliverable_assigned', 'Deliverable Assigned');
        } elseif ($deliverable->assigned_to && $deliverable->assigned_to !== $updater->id) {
            $changeMsg = 'The deliverable "' . $deliverable->title . '" has been updated by ' . $updater->name . '.';
            if (count($changes) > 0) $changeMsg .= ' ' . count($changes) . ' change(s) were made. Click to review changes.';
            $this->notificationService->notify(
                $deliverable->assigned_to,
                $updater->id,
                'deliverable_updated',
                'deliverable',
                $deliverable->id,
                'Deliverable Updated',
                $changeMsg,
                '/deliveries?selectedDeliverable=' . $deliverable->id
            );
        }
    }

    /**
     * Get the list of statuses to exclude when filtering deliverables due today.
     *
     * @return array  Array of status strings to exclude.
     */
    private function dueTodayExcludedStatuses(): array { return ['approved']; }

    /**
     * Resolve the authenticated user from the request or a query parameter token.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \App\Models\User|null  The authenticated user or null if not found.
     */
    private function resolveDocAuth(Request $request): ?User
    {
        if ($request->user()) return $request->user();

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
}
