<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\DeliverableWorkflowEvent;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DeliverableController extends Controller
{
    /**
     * List deliverables assigned to the current user.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $view = $request->query('view', 'assignee');

        $query = Deliverable::with([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,role',
            'task:id,title',
            'latestSubmission',
        ]);

        if ($view === 'assignee') {
            $query->where('assigned_to', $user->id)
                  ->where('created_by', '!=', $user->id);
        } else {
            $query->where('created_by', $user->id);
        }

        $deliverables = $query->latest()
            ->filter($request->query())
            ->paginate(15);

        // Add has_submitted flag per user
        $deliverableIds = $deliverables->pluck('id')->toArray();
        $submittedIds = DeliverableSubmission::where('submitted_by', $user->id)
            ->whereIn('deliverable_id', $deliverableIds)
            ->pluck('deliverable_id')
            ->toArray();

        $deliverables->getCollection()->transform(function ($deliverable) use ($submittedIds) {
            $deliverable->has_submitted = in_array($deliverable->id, $submittedIds);
            return $deliverable;
        });

        return response()->json($deliverables);
    }

    /**
     * Deliverables assigned by the current user to others.
     */
    public function assignedByMe(Request $request)
    {
        $user = $request->user();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        $query = Deliverable::with([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,role',
            'task:id,title',
            'latestSubmission',
            'latestSubmission.submittedBy:id,name,email',
            'latestSubmission.attachments',
            'reopenedBy:id,name',
        ]);

        if ($isAdminOrManager) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();
            $query->whereIn('created_by', $adminManagerIds);
        } else {
            $query->where('created_by', $user->id);
        }

        $query->whereColumn('created_by', '!=', 'assigned_to');

        $deliverables = $query->orderBy('sort_order')->orderBy('id')
            ->filter($request->query())
            ->paginate(15);

        return response()->json($deliverables);
    }

    /**
     * Self deliverables: where user is both creator AND assignee.
     */
    public function mySelfDeliverables(Request $request)
    {
        $user = $request->user();

        $deliverables = Deliverable::with([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,role',
            'task:id,title',
            'latestSubmission',
            'latestSubmission.submittedBy:id,name,email',
            'latestSubmission.attachments',
        ])
            ->where('assigned_to', $user->id)
            ->where('created_by', $user->id)
            ->orderBy('sort_order')->orderBy('id')
            ->filter($request->query())
            ->paginate(15);

        return response()->json($deliverables);
    }

    /**
     * Show a single deliverable with full submission history.
     */
    public function show(Deliverable $deliverable)
    {
        $user = request()->user();
        $isCreator = $deliverable->created_by === $user->id;
        $isAssignee = $deliverable->assigned_to === $user->id;

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $deliverable->load([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,email',
            'task:id,title,assigned_by',
            'task.assigner:id,name,email',
            'submissions' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
            'latestSubmission' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            'workflowEvents' => fn($q) => $q->with('user:id,name,email'),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ]);

        $payload = $deliverable->toArray();
        $payload['unviewed_changes'] = $deliverable->unviewedChanges;
        $payload['unviewed_changes_count'] = $deliverable->unviewedChanges->count();

        return response()->json([
            'deliverable' => $payload,
        ]);
    }

    /**
     * Create a new deliverable under a project.
     */
    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|string|max:64',
            'priority' => 'nullable|string|max:32',
            'due_date' => 'nullable|date',
            'assigned_to' => 'nullable|exists:users,id|required_without:task_id',
            'task_id' => 'nullable|exists:tasks,id',
        ]);

        $user = $request->user();

        $deliverable = $project->deliverables()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending',
            'priority' => $validated['priority'] ?? 'Medium',
            'due_date' => $validated['due_date'] ?? null,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'task_id' => $validated['task_id'] ?? null,
            'created_by' => $user->id,
        ]);

        // Send assignment notification
        if ($deliverable->assigned_to && $deliverable->assigned_to !== $user->id) {
            $deliverable->loadMissing('task:id,title');
            $taskTitle = $deliverable->task->title ?? '';
            $dueDate = $deliverable->due_date ? $deliverable->due_date->format('d-M-Y') : '';

            $message = 'You have been assigned a new deliverable: "' . $deliverable->title . '"';
            if ($taskTitle) {
                $message .= "\n\nTask: " . $taskTitle;
            }
            if ($dueDate) {
                $message .= "\n\nDue Date: " . $dueDate;
            }

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_assigned',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Assigned',
                'message' => $message,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable created successfully',
            'deliverable' => $deliverable->load(['assignee:id,name,email,role', 'creator:id,name']),
        ], 201);
    }

    /**
     * Update a deliverable.
     */
    public function update(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|string|max:64',
            'priority' => 'sometimes|string|max:32',
            'due_date' => 'sometimes|nullable|date',
            'assigned_to' => 'sometimes|nullable|exists:users,id',
        ]);

        // Snapshot old values before update
        $oldValues = [];
        $fieldLabels = [
            'title' => 'Title',
            'description' => 'Description',
            'priority' => 'Priority',
            'due_date' => 'Due Date',
            'status' => 'Status',
        ];
        foreach (array_keys($fieldLabels) as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $deliverable->{$f};
            }
        }

        $oldAssignedTo = $deliverable->assigned_to;
        $deliverable->update($validated);

        // Track field changes
        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $deliverable->{$f};
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
        if (array_key_exists('assigned_to', $validated) && (int) $validated['assigned_to'] !== (int) $oldAssignedTo) {
            $oldName = $oldAssignedTo ? User::find($oldAssignedTo)?->name : 'None';
            $newName = $validated['assigned_to'] ? User::find($validated['assigned_to'])?->name : 'None';
            $changes[] = [
                'field_name' => 'assigned_to',
                'label' => 'Assignee',
                'old_value' => $oldName ?? 'None',
                'new_value' => $newName ?? 'None',
            ];
        }

        // If reassigned to a different user, send assignment notification
        if (isset($validated['assigned_to']) && (int) $validated['assigned_to'] !== (int) $oldAssignedTo && (int) $deliverable->assigned_to !== (int) $user->id) {
            $deliverable->loadMissing('task:id,title');
            $taskTitle = $deliverable->task->title ?? '';
            $dueDate = $deliverable->due_date ? $deliverable->due_date->format('d-M-Y') : '';

            $message = 'You have been assigned a new deliverable: "' . $deliverable->title . '"';
            if ($taskTitle) {
                $message .= "\n\nTask: " . $taskTitle;
            }
            if ($dueDate) {
                $message .= "\n\nDue Date: " . $dueDate;
            }

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_assigned',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Assigned',
                'message' => $message,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        } elseif ($deliverable->assigned_to && $deliverable->assigned_to !== $user->id) {
            $changeMsg = 'The deliverable "' . $deliverable->title . '" has been updated by ' . $user->name . '.';
            $changeCount = count($changes);
            if ($changeCount > 0) {
                $changeMsg .= ' ' . $changeCount . ' change(s) were made. Click to review changes.';
            }

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_updated',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Updated',
                'message' => $changeMsg,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        // Create DeliverableChange records and workflow events
        foreach ($changes as $c) {
            $deliverable->changes()->create([
                'field_name' => $c['field_name'],
                'old_value' => $c['old_value'],
                'new_value' => $c['new_value'],
                'modified_by' => $user->id,
                'is_viewed' => false,
            ]);
            DeliverableWorkflowEvent::create([
                'deliverable_id' => $deliverable->id,
                'event_type' => 'field_changed',
                'user_id' => $user->id,
                'comment' => $c['label'] . ': ' . $c['old_value'] . ' → ' . $c['new_value'],
            ]);
        }

        $changeCount = count($changes);

        return response()->json([
            'message' => $changeCount > 0
                ? 'Deliverable updated — ' . $changeCount . ' change(s) made'
                : 'Deliverable updated successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
            'changes_count' => $changeCount,
        ]);
    }

    /**
     * Delete a deliverable.
     */
    public function destroy(Deliverable $deliverable)
    {
        $user = request()->user();
        $isCreator = $deliverable->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $deliverable->delete();

        return response()->json([
            'message' => 'Deliverable deleted successfully',
        ]);
    }

    /**
     * Submit a deliverable (Assignee action).
     * Works for: pending → submitted, rejected → submitted, reopened → submitted
     */
    public function submit(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        if ($deliverable->assigned_to !== $user->id) {
            return response()->json(['message' => 'Only the assignee can submit this deliverable'], 403);
        }

        if (!in_array($deliverable->status, ['pending', 'rejected', 'reopened', 'rework_required'])) {
            return response()->json(['message' => 'This deliverable cannot be submitted in its current status'], 422);
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
            $filePath = $file->store('deliverable-submissions/' . $deliverable->id, 'public');
        }

        $submission = DeliverableSubmission::create([
            'deliverable_id' => $deliverable->id,
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
                $path = $file->store('deliverable-submissions/' . $deliverable->id, 'public');
                $isImage = str_starts_with($mimeType, 'image/');

                $submission->attachments()->create([
                    'submission_type' => 'deliverable',
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
                    'submission_type' => 'deliverable',
                    'file_name' => $linkUrl,
                    'original_name' => $linkUrl,
                    'attachment_type' => 'link',
                    'url' => $linkUrl,
                ]);
            }
        }

        $updateData = [
            'status' => 'submitted',
            'submitted_at' => now(),
        ];

        // Clear rejection/reopen fields when resubmitting
        if (in_array($deliverable->status, ['rejected', 'reopened'])) {
            $updateData['rejected_at'] = null;
            $updateData['rejected_by'] = null;
            $updateData['rejection_comment'] = null;
            $updateData['reopened_at'] = null;
            $updateData['reopened_by'] = null;
            $updateData['reopen_comment'] = null;
            $updateData['reopen_instructions'] = null;
            $updateData['reopen_new_deadline'] = null;
        }

        // Clear rework fields when resubmitting after self-rework
        if ($deliverable->status === 'rework_required') {
            $updateData['rework_comment'] = null;
            $updateData['rework_instructions'] = null;
            $updateData['rework_new_deadline'] = null;
            $updateData['rework_file_path'] = null;
            $updateData['rework_file_name'] = null;
        }

        $deliverable->update($updateData);

        $creatorId = $deliverable->created_by;
        if ($creatorId && $creatorId !== $user->id) {
            Notification::create([
                'user_id' => $creatorId,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_submitted',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Submitted',
                'message' => $user->name . ' has submitted the deliverable "' . $deliverable->title . '" for your review.',
                'link' => '/deliveries-by-you?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable submitted successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'submissions' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
                'latestSubmission' => fn($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            ]),
        ]);
    }

    /**
     * Approve a deliverable (Assigner action).
     */
    public function approve(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($deliverable->status !== 'submitted') {
            return response()->json(['message' => 'Can only approve submitted deliverables'], 422);
        }

        $deliverable->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
        ]);

        if ($deliverable->assigned_to) {
            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_approved',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Approved',
                'message' => 'Your deliverable "' . $deliverable->title . '" has been approved.',
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'approvedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reject a deliverable permanently (Assigner action).
     * No further submission allowed.
     */
    public function reject(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($deliverable->status !== 'submitted') {
            return response()->json(['message' => 'Can only reject submitted deliverables'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
        ]);

        $deliverable->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
        ]);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "' . $deliverable->title . '" has been rejected. Please review and resubmit.';
            if (!empty($validated['comment'])) {
                $msg .= ' Reason: ' . $validated['comment'];
            }

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_rejected',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Rejected',
                'message' => $msg,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable rejected',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'rejectedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reject & Reopen a deliverable (Assigner action).
     * Allows assignee to resubmit with new information.
     */
    public function reopen(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();
        $isCreator = $deliverable->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($deliverable->status !== 'submitted') {
            return response()->json(['message' => 'Can only reopen submitted deliverables'], 422);
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
            $filePath = $file->store('deliverable-reopen/' . $deliverable->id, 'public');
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
        }

        if (!empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $deliverable->update($updateData);

        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "' . $deliverable->title . '" has been reopened for revision.';
            if (!empty($validated['comment'])) {
                $msg .= ' Comment: ' . $validated['comment'];
            }
            if (!empty($validated['instructions'])) {
                $msg .= ' Instructions: ' . $validated['instructions'];
            }

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_reopened',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Reopened',
                'message' => $msg,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable reopened successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Self-approve a deliverable (Self Deliverable workflow).
     * User marks their own deliverable as approved.
     */
    public function selfApprove(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        if ($deliverable->created_by !== $user->id || $deliverable->assigned_to !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($deliverable->status !== 'submitted') {
            return response()->json(['message' => 'Can only approve submitted deliverables'], 422);
        }

        $deliverable->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
        ]);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'approval',
            'user_id' => $user->id,
        ]);

        return response()->json([
            'message' => 'Deliverable approved successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'approvedBy:id,name',
            ]),
        ]);
    }

    /**
     * Self-rework a deliverable (Self Deliverable workflow).
     * User marks their own deliverable as needing rework.
     */
    public function selfRework(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        if ($deliverable->created_by !== $user->id || $deliverable->assigned_to !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($deliverable->status !== 'submitted') {
            return response()->json(['message' => 'Can only rework submitted deliverables'], 422);
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
            $filePath = $file->store('deliverable-rework/' . $deliverable->id, 'public');
        }

        $updateData = [
            'status' => 'rework_required',
            'rework_comment' => $validated['comment'] ?? null,
            'rework_instructions' => $validated['instructions'] ?? null,
        ];

        if (!empty($validated['new_deadline'])) {
            $updateData['rework_new_deadline'] = $validated['new_deadline'];
        }

        if (!empty($filePath)) {
            $updateData['rework_file_path'] = $filePath;
            $updateData['rework_file_name'] = $fileName;
        }

        $deliverable->update($updateData);

        DeliverableWorkflowEvent::create([
            'deliverable_id' => $deliverable->id,
            'event_type' => 'rework',
            'user_id' => $user->id,
            'comment' => $validated['comment'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        return response()->json([
            'message' => 'Deliverable marked for rework',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
            ]),
        ]);
    }

    /**
     * Download a submission file.
     */
    public function downloadSubmissionFile(DeliverableSubmission $submission)
    {
        $user = request()->user();
        $deliverable = $submission->deliverable;

        $isCreator = $deliverable->created_by === $user->id;
        $isAssignee = $deliverable->assigned_to === $user->id;

        if (!$isCreator && !$isAssignee && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    /**
     * Get the latest submission for a specific deliverable.
     * Used by assigner to view submission details in popup.
     */
    public function latestSubmission(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        $submission = DeliverableSubmission::where('deliverable_id', $deliverable->id)
            ->with(['submittedBy:id,name,email', 'attachments'])
            ->latest()
            ->first();

        return response()->json([
            'submission' => $submission,
        ]);
    }

    public function markChangesRead(Deliverable $deliverable)
    {
        $user = request()->user();
        $deliverable->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['message' => 'Changes marked as read']);
    }

    public function downloadAttachment(Request $request, SubmissionAttachment $attachment)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        if ($attachment->attachment_type === 'link') {
            return redirect($attachment->url);
        }

        if (!$attachment->file_path) {
            return response()->json(['message' => 'File not found'], 404);
        }

        $fullPath = storage_path('app/public/' . $attachment->file_path);

        if (!file_exists($fullPath)) {
            return response()->json(['message' => 'File not found on disk'], 404);
        }

        $filename = $attachment->original_name ?? basename($attachment->file_path);

        $mimeType = mime_content_type($fullPath) ?: 'application/octet-stream';

        if (str_starts_with($mimeType, 'image/') && $request->query('action') !== 'download') {
            return response()->file($fullPath, [
                'Content-Type' => $mimeType,
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
                'Cache-Control' => 'public, max-age=3600',
            ]);
        }

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * Reorder deliverables by updating sort_order values.
     */
    public function reorder(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:deliverables,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        foreach ($request->items as $item) {
            Deliverable::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]);
        }

        return response()->json(['message' => 'Deliverables reordered successfully']);
    }
}
