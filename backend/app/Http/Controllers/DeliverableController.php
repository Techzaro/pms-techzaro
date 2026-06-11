<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DeliverableController extends Controller
{
    /**
     * List deliverables based on user role.
     * - Assignees see deliverables assigned to them
     * - Creators/admins see deliverables under their tasks/projects
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
        ]);

        if ($view === 'assignee') {
            $query->where('assigned_to', $user->id);
        } else {
            $query->where('created_by', $user->id);
        }

        $deliverables = $query->latest()
            ->filter($request->query())
            ->paginate(15);

        return response()->json($deliverables);
    }

    /**
     * Show a single deliverable with submission history.
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
            'latestSubmission',
            'approvedBy:id,name',
            'rejectedBy:id,name',
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

        $deliverable = $project->deliverables()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending',
            'priority' => $validated['priority'] ?? 'Medium',
            'due_date' => $validated['due_date'] ?? null,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'task_id' => $validated['task_id'] ?? null,
            'created_by' => $request->user()->id,
        ]);

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

        if (!$isCreator && !in_array($user->role, ['admin'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $deliverable->delete();

        return response()->json([
            'message' => 'Deliverable deleted successfully',
        ]);
    }

    /**
     * Submit a deliverable (Assignee action).
     */
    public function submit(Request $request, Deliverable $deliverable)
    {
        $user = $request->user();

        if ($deliverable->assigned_to !== $user->id) {
            return response()->json(['message' => 'Only the assignee can submit this deliverable'], 403);
        }

        if ($deliverable->status !== 'pending') {
            return response()->json(['message' => 'This deliverable has already been submitted'], 422);
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

        $deliverable->update([
            'status' => 'submitted',
            'submitted_at' => now(),
        ]);

        // Notify the creator (assigner)
        $creatorId = $deliverable->created_by;
        if ($creatorId && $creatorId !== $user->id) {
            Notification::create([
                'user_id' => $creatorId,
                'type' => 'deliverable_submitted',
                'message' => $user->name . ' submitted deliverable: ' . $deliverable->title . "\n\nTask: " . ($deliverable->task?->title ?? 'N/A'),
                'link' => '/deliveries/deliverable-details/' . $deliverable->id,
            ]);
        }

        return response()->json([
            'message' => 'Deliverable submitted successfully',
            'deliverable' => $deliverable->fresh()->load([
                'assignee:id,name,email,role',
                'creator:id,name',
                'submissions' => fn($q) => $q->with('submittedBy:id,name,email')->latest(),
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

        // Notify the assignee
        if ($deliverable->assigned_to) {
            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'type' => 'deliverable_approved',
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
     * Reject a deliverable (Assigner action).
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

        // Notify the assignee
        if ($deliverable->assigned_to) {
            $msg = 'Your deliverable "' . $deliverable->title . '" has been rejected.';
            if (!empty($validated['comment'])) {
                $msg .= "\nReason: " . $validated['comment'];
            }
            $msg .= "\nPlease review and resubmit.";

            Notification::create([
                'user_id' => $deliverable->assigned_to,
                'type' => 'deliverable_rejected',
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
}
