<?php

/**
 * Controller for project CRUD operations and project detail retrieval.
 */

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\ProjectSubmission;
use App\Models\ProjectWorkflowEvent;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
        $filter = request()->query('filter');

        // Admin and Manager see ALL projects
        if (in_array($user->role, ['admin', 'manager'])) {
            $projectsQuery = Project::with(['creator', 'team', 'latestSubmission'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', $this->completedTaskStatuses());
                }])
                ->latest();
        } else {
            // Projects List: Show only if created by, manually visible, team member, or team leader
            // Projects assigned to user appear in /my-tasks pages, not here
            // Auto-visibility from task assignment does NOT apply to Projects List
            // IMPORTANT: Do NOT include project-task assignees here - those appear in /my-tasks
            $projectsQuery = Project::where(function ($q) use ($user) {
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
            ->with(['creator', 'team', 'latestSubmission'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', $this->completedTaskStatuses());
            }])
            ->latest();
        }

        if ($filter === 'active') {
            $projectsQuery->whereNotIn('status', $this->inactiveProjectStatuses());

            if (!in_array($user->role, ['admin', 'manager'])) {
                $projectsQuery->whereIn('id', $this->getUserProjectIds($user));
            }
        }

        $projects = $projectsQuery->get();

        $projects->each(function ($project) {
            $project->pending_deliverables_count = $project->deliverables()->whereNull('task_id')->where('status', 'pending')->count();
            $this->applyProjectTaskProgress($project);
        });

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
        $this->sendProjectAssignmentNotification($project, $request->user());

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
            'deliverables' => fn ($q) => $q->whereNull('task_id')->where(function ($qq) use ($user) {
                $qq->where('assigned_to', $user->id)
                   ->orWhere('created_by', $user->id);
            })->with('assignee:id,name,email,role', 'latestSubmission')->latest(),
            'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
            'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ]);

        if ($project->team && $project->team->leader) {
            $leaderInMembers = $project->team->members->contains('id', $project->team->leader_id);
            if (!$leaderInMembers) {
                $project->team->members->push($project->team->leader);
            }
        }

        $memberIds = $project->assigned_users ?? [];
        $members = User::whereIn('id', $memberIds)->where('active', true)->orderBy('name')->get(['id', 'name', 'email', 'role']);

        $isCreator = $project->created_by === $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        // All project-level deliverables must be submitted before project can be submitted
        $pendingDeliverables = $project->deliverables()->whereNull('task_id')->where('status', 'pending')->count();
        $allDeliverablesSubmitted = $pendingDeliverables === 0;
        $allTasksCompleted = $project->tasks->every(fn ($task) => $this->isCompletedTaskStatus($task->status));

        $payload = $project->toArray();
        $payload['members'] = $members;
        $payload['progress_percent'] = $this->computeProgressPercent($project);
        $payload['total_tasks'] = $project->tasks->count();
        $payload['completed_tasks'] = $project->tasks->filter(fn ($task) => $this->isCompletedTaskStatus($task->status))->count();
        $payload['is_creator'] = $isCreator;
        $payload['is_assigned'] = $isAssigned;
        $payload['is_admin_or_manager'] = $isAdminOrManager;
        $payload['can_edit'] = $isAdminOrManager;
        $payload['can_submit'] = in_array($project->status, $submittableStatuses) && ($isAssigned || $isCreator) && $allDeliverablesSubmitted && $allTasksCompleted;
        $payload['can_review'] = $project->status === 'submitted' && ($isCreator || $isAdminOrManager);
        $payload['unviewed_changes'] = $project->unviewedChanges;
        $payload['unviewed_changes_count'] = $project->unviewedChanges->count();

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

        $done = $tasks->filter(fn ($task) => $this->isCompletedTaskStatus($task->status))->count();

        return (int) round(($done / $tasks->count()) * 100);
    }

    private function completedTaskStatuses(): array
    {
        return ['approved', 'completed', 'done'];
    }

    private function inactiveProjectStatuses(): array
    {
        return [
            'completed',
            'Completed',
            'done',
            'Done',
            'approved',
            'Approved',
            'rejected',
            'Rejected',
            'cancelled',
            'Cancelled',
            'canceled',
            'Canceled',
            'abandoned',
            'Abandoned',
            'closed',
            'Closed',
            'archived',
            'Archived',
        ];
    }

    private function getUserProjectIds(User $user)
    {
        if (in_array($user->role, ['admin', 'manager'])) {
            return Project::pluck('id');
        }

        return Project::where(function ($q) use ($user) {
            $q->whereHas('manuallyVisibleTo', fn ($q) => $q->where('user_id', $user->id))
              ->orWhere(function ($q) use ($user) {
                  $q->where(function ($q) use ($user) {
                      $q->where('created_by', $user->id)
                        ->orWhereHas('team.members', fn ($m) => $m->where('users.id', $user->id))
                        ->orWhereHas('team', fn ($t) => $t->where('leader_id', $user->id))
                        ->orWhereJsonContains('assigned_users', (int) $user->id);
                  })->whereDoesntHave('visibility', fn ($q) => $q->where('user_id', $user->id)->where('is_visible', false));
              });
        })->pluck('id');
    }

    private function isCompletedTaskStatus(?string $status): bool
    {
        return in_array(strtolower((string) $status), $this->completedTaskStatuses(), true);
    }

    private function applyProjectTaskProgress(Project $project): Project
    {
        $total = $project->tasks()->count();
        $completed = $project->tasks()->whereIn('status', $this->completedTaskStatuses())->count();
        $pendingDeliverables = $project->deliverables()->whereNull('task_id')->where('status', 'pending')->count();
        $incomplete = max(0, $total - $completed);
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        $project->total_tasks = $total;
        $project->completed_tasks = $completed;
        $project->pending_tasks_count = $incomplete;
        $project->pending_deliverables_count = $pendingDeliverables;
        $project->can_submit = in_array($project->status, $submittableStatuses, true)
            && $incomplete === 0
            && $pendingDeliverables === 0;

        return $project;
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

        // Snapshot old values before update
        $oldValues = [];
        $fieldLabels = [
            'title' => 'Title',
            'description' => 'Description',
            'start_date' => 'Start Date',
            'end_date' => 'End Date',
            'priority' => 'Priority',
            'status' => 'Status',
            'budget' => 'Budget',
            'category' => 'Category',
            'client_name' => 'Client Name',
            'website_name' => 'Website Name',
            'website_link' => 'Website Link',
            'goals' => 'Goals',
        ];
        foreach (array_keys($fieldLabels) as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $project->{$f};
            }
        }

        $oldAssignedUsers = $project->assigned_users ?? [];

        $project->update($validated);

        // Track field changes
        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $project->{$f};
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

        // Track assigned_users changes
        if (array_key_exists('assigned_users', $validated)) {
            $newAssignedUsers = $validated['assigned_users'] ?? [];
            sort($oldAssignedUsers);
            sort($newAssignedUsers);
            if ($oldAssignedUsers !== $newAssignedUsers) {
                $oldNames = User::whereIn('id', $oldAssignedUsers)->pluck('name')->implode(', ');
                $newNames = User::whereIn('id', $newAssignedUsers)->pluck('name')->implode(', ');
                $changes[] = [
                    'field_name' => 'assigned_users',
                    'label' => 'Assigned Users',
                    'old_value' => $oldNames ?: 'None',
                    'new_value' => $newNames ?: 'None',
                ];
            }
        }

        if ($request->has('milestones')) {
            $this->replaceProjectMilestones($project, $milestones);
        }

        // Track new deliverables
        $addedDeliverables = [];
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
                    $addedDeliverables[] = $del['title'];
                }
            }
        }
        if (!empty($addedDeliverables)) {
            $changes[] = [
                'field_name' => 'deliverables',
                'label' => 'Deliverable Added',
                'old_value' => '',
                'new_value' => implode(', ', $addedDeliverables),
            ];
        }

        // Create ProjectChange records and workflow events
        foreach ($changes as $c) {
            $project->changes()->create([
                'field_name' => $c['field_name'],
                'old_value' => $c['old_value'],
                'new_value' => $c['new_value'],
                'modified_by' => $user->id,
                'is_viewed' => false,
            ]);
            \App\Models\ProjectWorkflowEvent::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'field_changed',
                'comment' => $c['label'] . ': ' . $c['old_value'] . ' → ' . $c['new_value'],
            ]);
        }

        $changeCount = count($changes);

        // Notify assigned users about the update
        $this->sendProjectUpdateNotification($project, $user, $changeCount);

        return response()->json([
            'message' => $changeCount > 0
                ? 'Project updated — ' . $changeCount . ' change(s) made'
                : 'Project updated successfully',
            'project' => $project->fresh(),
            'changes_count' => $changeCount,
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
     * Submit a project (Assignee action).
     */
    public function submit(Request $request, Project $project)
    {
        $user = $request->user();
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isAssigned && $project->created_by !== $user->id) {
            return response()->json(['message' => 'Only assigned users can submit this project'], 403);
        }

        if (!in_array($project->status, ['pending', 'Planned', 'in_progress', 'In Progress', 'reopened'])) {
            return response()->json(['message' => 'This project cannot be submitted in its current status'], 422);
        }

        $incompleteTasks = $project->tasks()->whereNotIn('status', $this->completedTaskStatuses())->count();
        if ($incompleteTasks > 0) {
            return response()->json(['message' => 'All project tasks must be completed before submitting this project'], 422);
        }

        // All project-level deliverables must be submitted before project can be submitted
        $pendingDeliverables = $project->deliverables()->whereNull('task_id')->where('status', 'pending')->count();
        if ($pendingDeliverables > 0) {
            return response()->json(['message' => 'All deliverables must be submitted before submitting this project'], 422);
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
            $filePath = $file->store('project-submissions/' . $project->id, 'public');
        }

        $submission = ProjectSubmission::create([
            'project_id' => $project->id,
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
                $path = $file->store('project-submissions/' . $project->id, 'public');
                $isImage = str_starts_with($mimeType, 'image/');

                $submission->attachments()->create([
                    'submission_type' => 'project',
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
                    'submission_type' => 'project',
                    'file_name' => $linkUrl,
                    'original_name' => $linkUrl,
                    'attachment_type' => 'link',
                    'url' => $linkUrl,
                ]);
            }
        }

        $isResubmit = $project->status === 'reopened';

        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        $updateData = [
            'status' => 'submitted',
            'submitted_at' => now(),
        ];

        if ($project->status === 'reopened') {
            $updateData['rejected_at'] = null;
            $updateData['rejected_by'] = null;
            $updateData['rejection_comment'] = null;
            $updateData['reopened_at'] = null;
            $updateData['reopened_by'] = null;
            $updateData['reopen_comment'] = null;
            $updateData['reopen_instructions'] = null;
            $updateData['reopen_new_deadline'] = null;
            $updateData['reopen_file_path'] = null;
            $updateData['reopen_file_name'] = null;
        }

        $project->update($updateData);

        $creatorId = $project->created_by;
        if ($creatorId && $creatorId !== $user->id) {
            Notification::create([
                'user_id' => $creatorId,
                'sender_user_id' => $user->id,
                'type' => 'project_submitted',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Submitted',
                'message' => $user->name . ' submitted the project "' . $project->title . '" for your review.',
                'link' => '/projects/project-details/' . $project->id,
            ]);
        }

        return response()->json([
            'message' => 'Project submitted successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role',
                'members',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'latestSubmission' => fn ($q) => $q->with('submittedBy:id,name,email'),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name',
                'rejectedBy:id,name',
                'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Approve a submitted project (Assigner action).
     */
    public function approve(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['message' => 'Can only approve submitted projects'], 422);
        }

        $project->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
        ]);

        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'approved',
        ]);

        $assignedUserIds = $project->assigned_users ?? [];
        foreach ($assignedUserIds as $assignedId) {
            if ((int) $assignedId !== (int) $user->id) {
                Notification::create([
                    'user_id' => $assignedId,
                    'sender_user_id' => $user->id,
                    'type' => 'project_approved',
                    'related_module' => 'project',
                    'related_id' => $project->id,
                    'title' => 'Project Approved',
                    'message' => 'Your project "' . $project->title . '" has been approved.',
                    'link' => '/projects/project-details/' . $project->id,
                ]);
            }
        }

        return response()->json([
            'message' => 'Project approved successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role',
                'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'rejectedBy:id,name',
                'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reject a submitted project permanently (Assigner action).
     */
    public function reject(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['message' => 'Can only reject submitted projects'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
        ]);

        $project->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => $user->id,
            'rejection_comment' => $validated['comment'] ?? null,
        ]);

        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'rejected',
            'comment' => $validated['comment'] ?? null,
        ]);

        $assignedUserIds = $project->assigned_users ?? [];
        foreach ($assignedUserIds as $assignedId) {
            $msg = 'Your project "' . $project->title . '" has been rejected.';
            if (!empty($validated['comment'])) {
                $msg .= ' Reason: ' . $validated['comment'];
            }
            Notification::create([
                'user_id' => $assignedId,
                'sender_user_id' => $user->id,
                'type' => 'project_rejected',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Rejected',
                'message' => $msg,
                'link' => '/projects/project-details/' . $project->id,
            ]);
        }

        return response()->json([
            'message' => 'Project rejected',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role',
                'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name',
                'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reject & reopen a submitted project for revision (Assigner action).
     */
    public function reopen(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['message' => 'Can only reopen submitted projects'], 422);
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
            $filePath = $file->store('project-reopen/' . $project->id, 'public');
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
            $updateData['end_date'] = $validated['new_deadline'];
        }

        if (!empty($filePath)) {
            $updateData['reopen_file_path'] = $filePath;
            $updateData['reopen_file_name'] = $fileName;
        }

        $project->update($updateData);

        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'reopened',
            'comment' => $validated['comment'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
        ]);

        $assignedUserIds = $project->assigned_users ?? [];
        foreach ($assignedUserIds as $assignedId) {
            $msg = 'Your project "' . $project->title . '" has been reopened for revision.';
            if (!empty($validated['comment'])) {
                $msg .= ' Comment: ' . $validated['comment'];
            }
            if (!empty($validated['instructions'])) {
                $msg .= ' Instructions: ' . $validated['instructions'];
            }
            Notification::create([
                'user_id' => $assignedId,
                'sender_user_id' => $user->id,
                'type' => 'project_reopened',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Reopened',
                'message' => $msg,
                'link' => '/projects/project-details/' . $project->id,
            ]);
        }

        return response()->json([
            'message' => 'Project reopened successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role',
                'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name',
                'rejectedBy:id,name',
            ]),
        ]);
    }

    /**
     * Get the latest submission for a project.
     */
    public function latestSubmission(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $submission = ProjectSubmission::where('project_id', $project->id)
            ->with('submittedBy:id,name,email')
            ->latest()
            ->first();

        return response()->json(['submission' => $submission]);
    }

    /**
     * Download a project submission file.
     */
    public function downloadSubmissionFile(ProjectSubmission $submission)
    {
        $user = request()->user();
        $project = $submission->project;

        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
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

    private function sendProjectUpdateNotification(Project $project, User $updater, int $changeCount = 0): void
    {
        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) {
            $assignedUserIds = json_decode($assignedUserIds, true) ?? [];
        }
        foreach ($assignedUserIds as $assignedId) {
            if ((int) $assignedId === (int) $updater->id) {
                continue;
            }
            $message = 'The project "' . $project->title . '" has been updated by ' . $updater->name . '.';
            if ($changeCount > 0) {
                $message .= ' ' . $changeCount . ' change(s) were made. Click to review changes.';
            }
            Notification::create([
                'user_id' => $assignedId,
                'sender_user_id' => $updater->id,
                'type' => 'project_updated',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Updated',
                'message' => $message,
                'link' => '/projects/project-details/' . $project->id,
            ]);
        }
    }

    public function markChangesRead(Project $project)
    {
        $user = request()->user();
        $project->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['message' => 'Changes marked as read']);
    }

    private function sendProjectAssignmentNotification(Project $project, User $sender): void
    {
        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) {
            $assignedUserIds = json_decode($assignedUserIds, true) ?? [];
        }
        foreach ($assignedUserIds as $assignedId) {
            if ((int) $assignedId === (int) $sender->id) {
                continue;
            }
            Notification::create([
                'user_id' => $assignedId,
                'sender_user_id' => $sender->id,
                'type' => 'project_assigned',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Assigned',
                'message' => 'A new project "' . $project->title . '" has been assigned to you by ' . $sender->name . '.',
                'link' => '/projects/project-details/' . $project->id,
            ]);
        }
    }
}
