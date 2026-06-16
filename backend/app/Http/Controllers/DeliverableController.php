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
            'reopenedBy:id,name',
        ]);

        if ($isAdminOrManager) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();
            $query->whereIn('created_by', $adminManagerIds);
        } else {
            $query->where('created_by', $user->id);
        }

        $query->whereColumn('created_by', '!=', 'assigned_to');

        $deliverables = $query->latest()
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
        ])
            ->where('assigned_to', $user->id)
            ->where('created_by', $user->id)
            ->latest()
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
            'submissions' => fn($q) => $q->with('submittedBy:id,name,email')->latest(),
            'latestSubmission' => fn($q) => $q->with('submittedBy:id,name,email'),
            'workflowEvents' => fn($q) => $q->with('user:id,name,email'),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
        ]);

        return response()->json([
            'deliverable' => $deliverable,
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
            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'sender_user_id' => $user->id,
                'type' => 'deliverable_assigned',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'Deliverable Assigned',
                'message' => 'A new deliverable "' . $deliverable->title . '" has been assigned to you by ' . $user->name . '.',
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
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

        $deliverable->update($validated);

        return response()->json([
            'message' => 'Deliverable updated successfully',
            'deliverable' => $deliverable->fresh()->load(['assignee:id,name,email,role', 'creator:id,name']),
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
            'file' => 'nullable|file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif|max:51200',
        ]);

        $filePath = null;
        $fileName = null;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('deliverable-submissions/' . $deliverable->id, 'public');
        }

        DeliverableSubmission::create([
            'deliverable_id' => $deliverable->id,
            'submitted_by' => $user->id,
            'comment' => $validated['comment'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

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
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable submitted successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'submissions' => fn($q) => $q->with('submittedBy:id,name,email')->latest(),
                'latestSubmission' => fn($q) => $q->with('submittedBy:id,name,email'),
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
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
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
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
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
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
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
            ->with('submittedBy:id,name,email')
            ->latest()
            ->first();

        return response()->json([
            'submission' => $submission,
        ]);
    }
}
