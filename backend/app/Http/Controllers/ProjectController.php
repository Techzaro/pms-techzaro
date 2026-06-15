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
     * Admin and Manager see ALL projects.
     * Team Leads and Members see only projects they're associated with.
     */
    public function index()
    {
        $user = request()->user();

        // Admin and Manager see ALL projects
        if (in_array($user->role, ['admin', 'manager'])) {
            $projects = Project::with(['creator', 'team'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', ['done', 'completed']);
                }])
                ->latest()
                ->get();
        } else {
            // Projects List: Show only if created by, manually visible, team member, or team leader
            // Projects assigned to user appear in /my-tasks pages, not here
            // Auto-visibility from task assignment does NOT apply to Projects List
            // IMPORTANT: Do NOT include project-task assignees here - those appear in /my-tasks
            $projects = Project::where(function ($q) use ($user) {
                $q->whereHas('manuallyVisibleTo', fn ($q) => $q->where('user_id', $user->id))
                  ->orWhere(function ($q) use ($user) {
                      $q->where(function ($q) use ($user) {
                          $q->where('created_by', $user->id)
                            ->orWhereHas('team.members', fn ($q) => $q->where('users.id', $user->id))
                            ->orWhereHas('team', fn ($q) => $q->where('leader_id', $user->id));
                      })->whereDoesntHave('visibility', fn ($q) => $q->where('user_id', $user->id)->where('is_visible', false));
                  })
                  ->orWhereJsonContains('assigned_users', $user->id);
            })
            ->with(['creator', 'team'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['done', 'completed']);
            }])
            ->latest()
            ->get();
        }

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
            'deliverables' => 'nullable|array',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.due_date' => 'nullable|date',
        ]);

        $milestones = $validated['milestones'] ?? null;
        unset($validated['milestones']);
        $deliverables = $validated['deliverables'] ?? null;
        unset($validated['deliverables']);

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

        // Create deliverables if provided and there are assigned users
        if (!empty($deliverables)) {
            $assignedUsers = $validated['assigned_users'] ?? [];
            if (!empty($assignedUsers)) {
                foreach ($deliverables as $del) {
                    foreach ($assignedUsers as $userId) {
                        $project->deliverables()->create([
                            'title' => $del['title'],
                            'description' => $del['description'] ?? null,
                            'status' => 'pending',
                            'priority' => $validated['priority'] ?? 'Medium',
                            'due_date' => $del['due_date'] ?? null,
                            'assigned_to' => $userId,
                            'created_by' => $request->user()->id,
                        ]);
                    }
                }
            }
        }

        return response()->json([
            'message' => 'Project created successfully',
            'project' => $project,
        ], 201);
    }

    /**
     * Get a specific project (full detail payload for project details page)
     * Admin and Manager have unrestricted access to all projects.
     * Others need to be creator, assigned, team member, have tasks, or be manually visible.
     */
    public function show(Project $project)
    {
        $user = request()->user();

        // Admin and Manager have unrestricted access
        if (!in_array($user->role, ['admin', 'manager'])) {
            $isCreator = $project->created_by === $user->id;
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $isTeamMember = $project->team_id && $project->team && (
                $project->team->members->contains('id', $user->id) ||
                $project->team->leader_id === $user->id
            );
            $hasTasksUnderProject = $project->tasks()->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))->exists();
            $isManuallyVisible = $project->manuallyVisibleTo()->where('user_id', $user->id)->exists();
            $isTeamLead = $user->role === 'team_lead';

            if (!$isCreator && !$isAssigned && !$isTeamMember && !$hasTasksUnderProject && !$isManuallyVisible && !$isTeamLead) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        }

        $project->load([
            'creator:id,name,email,role',
            'team.leader:id,name,email,role',
            'team.members:id,name,email,role',
            'tasks.assignees:id,name,email,role',
            'milestones',
            'activities' => fn ($q) => $q->with('user:id,name')->latest()->limit(30),
            'files',
            'deliverables' => fn ($q) => $q->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)
                   ->orWhere('created_by', $user->id);
            })->with('assignee:id,name,email,role', 'latestSubmission')->latest(),
        ]);

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
            'deliverables' => 'nullable|array',
            'deliverables.*.title' => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.due_date' => 'nullable|date',
        ]);

        $milestones = $validated['milestones'] ?? null;
        unset($validated['milestones']);
        $deliverables = $validated['deliverables'] ?? null;
        unset($validated['deliverables']);

        $project->update($validated);

        if ($request->has('milestones')) {
            $this->replaceProjectMilestones($project, $milestones);
        }

        // Create deliverables if provided and there are assigned users
        if (!empty($deliverables)) {
            $assignedUsers = $project->assigned_users ?? [];
            if (!empty($assignedUsers)) {
                foreach ($deliverables as $del) {
                    foreach ($assignedUsers as $userId) {
                        $project->deliverables()->create([
                            'title' => $del['title'],
                            'description' => $del['description'] ?? null,
                            'status' => 'pending',
                            'priority' => $project->priority ?? 'Medium',
                            'due_date' => $del['due_date'] ?? null,
                            'assigned_to' => $userId,
                            'created_by' => $request->user()->id,
                        ]);
                    }
                }
            }
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

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project->update(['status' => 'completed']);

        $deliverable = Deliverable::create([
            'project_id' => $project->id,
            'task_id' => null,
            'title' => $project->title,
            'description' => $project->description,
            'status' => 'pending',
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
     * Get visibility configuration for a project.
     * Returns all active users with their current visibility status.
     */
    public function getVisibility(Project $project)
    {
        $user = request()->user();
        if (!in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $users = User::where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'role']);

        $visibility = $project->visibility()->get()->keyBy('user_id');

        $result = $users->map(function ($u) use ($visibility) {
            $row = $visibility->get($u->id);
            return [
                'id' => $u->id,
                'name' => $u->name,
                'role' => $u->role,
                'is_visible' => $row ? (bool) $row->is_visible : false,
            ];
        });

        return response()->json(['users' => $result]);
    }

    /**
     * Save visibility configuration for a project.
     * Accepts an array of user IDs that should be visible.
     * All other users previously configured will be set to not visible.
     */
    public function setVisibility(Request $request, Project $project)
    {
        $user = $request->user();
        if (!in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'user_ids' => 'present|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $newIds = collect($validated['user_ids']);
        $existing = $project->visibility()->get()->keyBy('user_id');

        foreach ($newIds as $uid) {
            if ($existing->has($uid)) {
                $existing->get($uid)->update(['is_visible' => true]);
                $existing->forget($uid);
            } else {
                $project->visibility()->create([
                    'user_id' => $uid,
                    'is_visible' => true,
                ]);
            }
        }

        foreach ($existing as $row) {
            $row->update(['is_visible' => false]);
        }

        return response()->json(['message' => 'Visibility updated successfully']);
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
