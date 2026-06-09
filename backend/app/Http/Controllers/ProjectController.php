<?php

/**
 * Controller for project CRUD operations and project detail retrieval.
 */

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Project controller for CRUD operations and project details logic.
 */
class ProjectController extends Controller
{
    /**
     * Get all projects with creator, team, and task counts for progress calculation.
     */
    public function index()
    {
        $projects = Project::with(['creator', 'team'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['done', 'completed']);
            }])
            ->latest()
            ->get();

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
            'status' => 'nullable|string|max:64',
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
        $validated['priority'] = $validated['priority'] ?? 'Medium';
        $validated['status'] = $validated['status'] ?? 'in_progress';
        $validated['start_date'] = $validated['start_date'] ?? now()->toDateTimeString();

        if (!empty($validated['team_id']) && empty($validated['assigned_users'])) {
            $team = Team::with('leader:id')->find($validated['team_id']);
            if ($team && $team->leader_id) {
                $validated['assigned_users'] = [$team->leader_id];
            } else {
                $validated['assigned_users'] = $validated['assigned_users'] ?? [];
            }
        } else {
            $validated['assigned_users'] = $validated['assigned_users'] ?? [];
        }

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
        $user = request()->user();

        $project->load([
            'creator:id,name,email,role',
            'team.leader:id,name,email,role',
            'team.members:id,name,email,role',
            'tasks.assignees:id,name,email,role',
            'milestones',
            'activities' => fn ($q) => $q->with('user:id,name')->latest()->limit(30),
            'files',
        ]);

        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);
        $isTeamMember = $project->team_id && $project->team && (
            $project->team->members->contains('id', $user->id) ||
            $project->team->leader_id === $user->id
        );

        if (!$isCreator && !$isAssigned && !$isTeamMember && !in_array($user->role, ['admin', 'manager', 'team_lead'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($project->team && $project->team->leader) {
            $leaderInMembers = $project->team->members->contains('id', $project->team->leader_id);
            if (!$leaderInMembers) {
                $project->team->members->push($project->team->leader);
            }
        }

        $memberIds = $project->assigned_users ?? [];
        $members = User::whereIn('id', $memberIds)->where('active', true)->orderBy('name')->get(['id', 'name', 'email', 'role']);

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
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
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
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

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
     * Complete a project (assigned users can mark it done).
     */
    public function completeProject(Project $project)
    {
        $user = request()->user();
        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager', 'team_lead'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project->update(['status' => 'completed']);

        $deliverable = Deliverable::create([
            'project_id' => $project->id,
            'task_id' => null,
            'title' => $project->title,
            'description' => $project->description,
            'status' => 'deliverable',
            'priority' => $project->priority ?? 'Medium',
            'due_date' => $project->end_date,
            'assigned_to' => $user->id,
            'created_by' => $project->created_by,
        ]);

        return response()->json([
            'message' => 'Project marked as completed',
            'project' => $project->fresh(),
            'deliverable' => $deliverable,
        ]);
    }

    /**
     * Delete a project
     */
    public function destroy(Project $project)
    {
        $user = request()->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project->delete();

        return response()->json([
            'message' => 'Project deleted successfully',
        ]);
    }

    /**
     * Upload a file attachment to a project.
     */
    public function uploadFile(Request $request, Project $project)
    {
        $request->validate([
            'file' => 'required|file|max:10240',
        ]);

        $file = $request->file('file');
        $path = $file->store('project-files', 'public');

        $attachment = $project->files()->create([
            'name' => $file->getClientOriginalName(),
            'url' => '/storage/' . $path,
        ]);

        return response()->json([
            'message' => 'File uploaded successfully',
            'file' => $attachment,
        ], 201);
    }

    /**
     * Add a link attachment to a project.
     */
    public function addLink(Request $request, Project $project)
    {
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'name' => 'nullable|string|max:255',
        ]);

        $attachment = $project->files()->create([
            'name' => $validated['name'] ?? $validated['url'],
            'url' => $validated['url'],
        ]);

        return response()->json([
            'message' => 'Link added successfully',
            'file' => $attachment,
        ], 201);
    }

    /**
     * Delete a file attachment.
     */
    public function deleteFile(Project $project, ProjectFile $file)
    {
        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            $fullPath = storage_path('app/public/' . $relativePath);
            if (file_exists($fullPath)) {
                unlink($fullPath);
            }
        }

        $file->delete();

        return response()->json([
            'message' => 'File deleted successfully',
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
