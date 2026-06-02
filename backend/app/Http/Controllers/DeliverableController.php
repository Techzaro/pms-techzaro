<?php

/**
 * Controller for deliverable CRUD operations.
 */

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Project;
use Illuminate\Http\Request;

/**
 * Deliverable controller for full CRUD operations.
 */
class DeliverableController extends Controller
{
    /**
     * List all deliverables with filtering.
     */
    public function index(Request $request)
    {
        $deliverables = Deliverable::with(['project:id,title', 'assignee:id,name,email,role', 'creator:id,name'])
            ->latest()
            ->filter($request->query())
            ->paginate(15);

        return response()->json($deliverables);
    }

    /**
     * Show a single deliverable.
     */
    public function show(Deliverable $deliverable)
    {
        $deliverable->load([
            'project:id,title',
            'assignee:id,name,email,role',
            'creator:id,name,email',
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
            'assigned_to' => 'nullable|exists:users,id',
        ]);

        $deliverable = $project->deliverables()->create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'pending',
            'priority' => $validated['priority'] ?? 'Medium',
            'due_date' => $validated['due_date'] ?? null,
            'assigned_to' => $validated['assigned_to'] ?? null,
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
        $deliverable->delete();

        return response()->json([
            'message' => 'Deliverable deleted successfully',
        ]);
    }
}
