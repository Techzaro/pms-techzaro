<?php

/**
 * Controller for project CRUD operations and project detail retrieval.
 */

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Project controller for CRUD operations and project details logic.
 */
class ProjectController extends Controller
{
    /**
     * Get all projects with creator and team relationships.
     */
    public function index()
    {
        $projects = Project::with(['creator', 'team'])->latest()->get();

        return response()->json($projects);
    }

    /**
     * Create a new project
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'goals' => 'nullable|string',
            'goals_checklist' => 'nullable|array',
            'goals_checklist.*.text' => 'required_with:goals_checklist|string',
            'goals_checklist.*.done' => 'nullable|boolean',
            'sheets_documents' => 'nullable|string',
            'website_name' => 'nullable|string',
            'website_link' => 'nullable|string',
            'client_name' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'nullable|string|max:32',
            'sidebar_notes' => 'nullable|string',
            'team_id' => 'nullable|exists:teams,id',
            'assigned_users' => 'nullable|array',
            'status' => 'required|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'milestones' => 'nullable|array',
            'milestones.*.title' => 'nullable|string|max:255',
            'milestones.*.due_date' => 'nullable|date',
            'milestones.*.status' => 'nullable|string|max:32',
        ]);

        $milestones = $validated['milestones'] ?? null;
        unset($validated['milestones']);

        $validated['created_by'] = $request->user()->id;
        $validated['assigned_users'] = $validated['assigned_users'] ?? [];
        $validated['priority'] = $validated['priority'] ?? 'Medium';

        $project = Project::create($validated);
        $this->replaceProjectMilestones($project, $milestones);

        return response()->json([
            'message' => 'Project created successfully',
            'project' => $project,
        ], 201);
    }

    /**
     * Get a specific project (full detail payload for project details page)
     */
    public function show(Project $project)
    {
        $project->load([
            'creator:id,name,email,role',
            'team.leader:id,name',
            'team.members:id,name,email,role',
            'tasks.assignee:id,name,email,role',
            'milestones',
            'activities' => fn ($q) => $q->with('user:id,name')->latest()->limit(30),
            'files',
        ]);

        $memberIds = $project->assigned_users ?? [];
        $members = User::whereIn('id', $memberIds)->orderBy('name')->get(['id', 'name', 'email', 'role']);

        $payload = $project->toArray();
        $payload['members'] = $members;
        $payload['progress_percent'] = $this->computeProgressPercent($project);

        return response()->json([
            'project' => $payload,
        ]);
    }

    /**
     * Compute project completion percent based on finished tasks.
     */
    private function computeProgressPercent(Project $project): int
    {
        $tasks = $project->tasks;
        if ($tasks->isEmpty()) {
            return 0;
        }

        $done = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['done', 'completed'], true))->count();

        return (int) round(($done / $tasks->count()) * 100);
    }

    /**
     * Update a project
     */
    public function update(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'goals' => 'nullable|string',
            'goals_checklist' => 'nullable|array',
            'goals_checklist.*.text' => 'required_with:goals_checklist|string',
            'goals_checklist.*.done' => 'nullable|boolean',
            'sheets_documents' => 'nullable|string',
            'website_name' => 'nullable|string',
            'website_link' => 'nullable|string',
            'client_name' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'nullable|string|max:32',
            'sidebar_notes' => 'nullable|string',
            'team_id' => 'nullable|exists:teams,id',
            'assigned_users' => 'nullable|array',
            'status' => 'required|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'milestones' => 'nullable|array',
            'milestones.*.title' => 'nullable|string|max:255',
            'milestones.*.due_date' => 'nullable|date',
            'milestones.*.status' => 'nullable|string|max:32',
        ]);

        $milestones = $validated['milestones'] ?? null;
        unset($validated['milestones']);

        $project->update($validated);

        if ($request->has('milestones')) {
            $this->replaceProjectMilestones($project, $milestones);
        }

        return response()->json([
            'message' => 'Project updated successfully',
            'project' => $project->fresh(),
        ]);
    }

    /**
     * Partial update (e.g. sidebar notes from project details page)
     */
    public function patch(Request $request, Project $project)
    {
        $validated = $request->validate([
            'sidebar_notes' => 'sometimes|nullable|string',
            'goals_checklist' => 'sometimes|nullable|array',
            'goals_checklist.*.text' => 'required_with:goals_checklist|string',
            'goals_checklist.*.done' => 'nullable|boolean',
            'status' => 'sometimes|string|max:64',
        ]);

        $project->update($validated);

        return response()->json([
            'message' => 'Project updated',
            'project' => $project->fresh()->only(array_keys($validated)),
        ]);
    }

    /**
     * Delete a project
     */
    public function destroy(Project $project)
    {
        $project->delete();

        return response()->json([
            'message' => 'Project deleted successfully',
        ]);
    }

    /**
     * Replace all milestone rows for the project.
     *
     * This helper removes existing milestones and recreates them
     * from the provided milestone array.
     */
    private function replaceProjectMilestones(Project $project, ?array $rows): void
    {
        if ($rows === null) {
            return;
        }

        $project->milestones()->delete();

        foreach (array_values($rows) as $index => $row) {
            if (!is_array($row)) {
                continue;
            }
            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $project->milestones()->create([
                'title' => $title,
                'due_date' => !empty($row['due_date']) ? $row['due_date'] : null,
                'status' => $row['status'] ?? 'planned',
                'sort_order' => $index,
            ]);
        }
    }
}
