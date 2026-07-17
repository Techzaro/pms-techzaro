<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectResource;
use App\Models\Deliverable;
use App\Models\Project;
use App\Models\ProjectChange;
use App\Models\ProjectFile;
use App\Models\ProjectAccessCredential;
use App\Models\ProjectMilestone;
use App\Models\ProjectVisibility;
use App\Models\ProjectWorkflowEvent;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Controller for managing projects.
 * Handles CRUD operations, file/link management, visibility controls,
 * milestone management, and workflow state changes.
 * Sends notifications for assignment, updates, and workflow state changes.
 */
class ProjectController extends Controller
{
    private const CACHE_TTL = 300;

    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /**
     * List all projects visible to the authenticated user.
     *
     * Admin/manager users see all projects. Other users see projects they created,
     * are assigned to, are team members of, or have manual visibility access.
     * Supports 'active' filter to exclude completed/archived projects.
     *
     * @return JsonResponse JSON response with project list and submission eligibility flags.
     */
    public function index()
    {
        $user = request()->user();
        $filter = request()->query('filter');

        if (in_array($user->role, ['admin', 'manager'])) {
            $projectsQuery = Project::with(['creator:id,name,role', 'team:id,name', 'updatedBy:id,name,role'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', $this->completedTaskStatuses());
                }])
                ->withCount(['tasks as approved_tasks' => function ($q) {
                    $q->where('status', 'approved');
                }])
                ->withCount(['deliverables as pending_deliverables_count' => function ($q) {
                    $q->whereNull('task_id')->where('status', 'pending');
                }])
                ->orderBy('sort_order')
                ->latest('id');
        } elseif ($user->role === 'guest') {
            $projectsQuery = Project::where('client_name', $user->name)
                ->with(['creator:id,name,role', 'team:id,name', 'updatedBy:id,name,role'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', $this->completedTaskStatuses());
                }])
                ->withCount(['tasks as approved_tasks' => function ($q) {
                    $q->where('status', 'approved');
                }])
                ->withCount(['deliverables as pending_deliverables_count' => function ($q) {
                    $q->whereNull('task_id')->where('status', 'pending');
                }])
                ->orderBy('sort_order')
                ->latest('id');
        } else {
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
                ->with(['creator:id,name,role', 'team:id,name', 'updatedBy:id,name,role'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', $this->completedTaskStatuses());
                }])
                ->withCount(['tasks as approved_tasks' => function ($q) {
                    $q->where('status', 'approved');
                }])
                ->withCount(['deliverables as pending_deliverables_count' => function ($q) {
                    $q->whereNull('task_id')->where('status', 'pending');
                }])
                ->orderBy('sort_order')
                ->latest('id');
        }

        if ($filter === 'active') {
            $projectsQuery->whereNotIn('status', $this->inactiveProjectStatuses());
        }

        $projects = $projectsQuery->limit(200)->get();

        return $projects->map(function ($project) use ($user) {
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $project->is_assigned = $isAssigned;

            return $project;
        });
    }

    /**
     * Create a new project with optional milestones and deliverables.
     *
     * Automatically assigns the team leader if a team is provided without explicit users.
     * Creates workflow events, sends assignment notifications, and logs activity.
     * Deliverables are created for each assigned user.
     *
     * @param  Request  $request  Validated input: title, description, client_name, priority, team_id, assigned_users[], milestones[], deliverables[], etc.
     * @return JsonResponse JSON response with the created project.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'sheets_documents' => 'nullable|string',
            'website_name' => 'nullable|string',
            'website_link' => 'nullable|string',
            'client_name' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:1000',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'nullable|string|max:32',
            'sidebar_notes' => 'nullable|string',
            'team_id' => 'nullable|exists:teams,id',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'exists:teams,id',
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
        $existingFileNames = $validated['existing_file_names'] ?? null;
        unset($validated['existing_file_names']);

        $validated['created_by'] = $request->user()->id;
        $validated['updated_by'] = $request->user()->id;
        $validated['priority'] = $validated['priority'] ?? 'Medium';
        $validated['status'] = $validated['status'] ?? 'in_progress';
        $validated['start_date'] = $validated['start_date'] ?? now()->toDateTimeString();

        if (! empty($validated['team_id']) && empty($validated['assigned_users'])) {
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
        $project->syncDatesFromMilestones();

        $assigneeNames = ! empty($validated['assigned_users'])
            ? User::whereIn('id', $validated['assigned_users'])->pluck('name')->implode(', ')
            : '';

        // Create workflow event for project creation
        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $request->user()->id,
            'action' => 'created',
            'comment' => ! empty($validated['assigned_users'])
                ? 'Created project and assigned to '.$assigneeNames.' — gave view access'
                : null,
        ]);

        // Create assignment events in bulk
        if (! empty($validated['assigned_users'])) {
            $assignedEvents = [];
            foreach ($validated['assigned_users'] as $assigneeId) {
                if ((int) $assigneeId !== (int) $request->user()->id) {
                    $assignedEvents[] = [
                        'project_id' => $project->id,
                        'user_id' => $request->user()->id,
                        'action' => 'assigned',
                        'comment' => 'Assigned to '.$assigneeNames.' — gave view access',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
            if (! empty($assignedEvents)) {
                DB::table('project_workflow_events')->insert($assignedEvents);
            }
        }

        // Log activity for the creator
        $activityDesc = $assigneeNames
            ? 'You created project "'.$project->title.'" and assigned it to '.$assigneeNames
            : 'You created project "'.$project->title.'"';
        $this->activityService->log($request->user()->id, 'project_created', $activityDesc, 'project', $project->id);
        $this->clearDashboardCache($request->user()->id);

        try {
            $this->auditService->log(
                module: 'project_management',
                action: 'create',
                description: "Created project {$project->title}",
                user: $request->user(),
                entityType: 'Project',
                entityId: $project->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($request->user(), 'Created & Assigned', 'project', $project->title, [
            'Assigned To' => $assigneeNames ?: 'N/A',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project created successfully',
            'project' => $project,
        ], 201);
    }

    /**
     * Retrieve a single project with all related data (tasks, deliverables, milestones, workflow events).
     *
     * Enforces authorization based on visibility, team membership, task assignment, or admin/manager role.
     * Returns unviewed changes.
     *
     * @param  Project  $project  The project to retrieve.
     * @return JsonResponse JSON response with full project details or 403.
     */
    public function show(Project $project)
    {
        $user = request()->user();

        if (! in_array($user->role, ['admin', 'manager'])) {
            try {
                $project->load('team.members:id,name');
            } catch (\Exception $e) {
                // fallback: team may not exist
            }
            $userId = (int) $user->id;
            $isCreator = (int) $project->created_by === $userId;
            $isAssigned = in_array($userId, array_map('intval', $project->assigned_users ?? []));
            $isTeamMember = $project->team_id && $project->team && (
                $project->team->members->contains('id', $userId) ||
                (int) $project->team->leader_id === $userId
            );
            $hasTasksUnderProject = $project->tasks()->whereHas('assignees', fn ($q) => $q->where('users.id', $userId))->exists();
            $isManuallyVisible = \App\Models\ProjectVisibility::where('project_id', $project->id)
                ->where('user_id', $userId)
                ->where('is_visible', true)
                ->exists();
            $isTeamLead = $user->role === 'team_lead';
            $isGuestClient = $user->role === 'guest' && $project->client_name === $user->name;

            if (! $isCreator && ! $isAssigned && ! $isTeamMember && ! $hasTasksUnderProject && ! $isManuallyVisible && ! $isTeamLead && ! $isGuestClient) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        $baseRelations = [
            'creator:id,name,email,role,department',
            'team.leader:id,name,email,role,department',
            'team.members:id,name,email,role,department',
            'milestones',
            'files',
            'deliverables' => fn ($q) => $q->with(['assignee:id,name,role', 'creator:id,name,role'])->orderBy('sort_order'),
            'tasks' => fn ($q) => $q->with(['assignees:id,name', 'assigner:id,name,role'])->withCount([
                'deliverables as total_deliverables',
                'deliverables as approved_deliverables' => fn ($q) => $q->where('status', 'approved'),
                'deliverables as pending_deliverables' => fn ($q) => $q->whereNotIn('status', ['approved']),
            ])->orderBy('sort_order')->latest(),
        ];

        $optionalRelations = [
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            'changes' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
        ];

        try {
            $project->load(array_merge($baseRelations, $optionalRelations));
        } catch (\Exception $e) {
            $project->load($baseRelations);
        }

        $project->loadCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
            $q->whereIn('status', ['approved', 'completed', 'done']);
        }]);

        if ($project->team && $project->team->leader) {
            $leaderInMembers = $project->team->members->contains('id', $project->team->leader_id);
            if (! $leaderInMembers) {
                $project->team->members->push($project->team->leader);
            }
        }

        $memberIds = $project->assigned_users ?? [];
        $members = ! empty($memberIds)
            ? User::whereIn('id', $memberIds)->where('active', true)->orderByRaw('FIELD(id,' . implode(',', $memberIds) . ')')->get(['id', 'name', 'email', 'role', 'department'])
            : collect();

        $isCreator = (int) $project->created_by === (int) $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        $approvalCacheKey = "project_approval_{$project->id}";
        $approvalStatus = Cache::remember($approvalCacheKey, 30, function () use ($project) {
            $unapprovedTasks = $project->tasks()->where('status', '!=', 'approved')->count();
            $unapprovedDeliverables = $project->deliverables()->where('status', '!=', 'approved')->count();

            return [
                'all_tasks_approved' => $unapprovedTasks === 0,
                'all_deliverables_approved' => $unapprovedDeliverables === 0,
            ];
        });

        $payload = (new ProjectResource($project))->resolve();
        $payload['members'] = $members;
        $payload['teams'] = Team::with('leader:id,name,role', 'members:id,name,role')
            ->whereIn('id', $project->team_ids ?? [])->get();
        $payload['is_creator'] = $isCreator;
        $payload['is_assigned'] = $isAssigned;
        $payload['is_admin_or_manager'] = $isAdminOrManager;
        $payload['can_edit'] = $isAdminOrManager;

        $payload['can_review'] = $isCreator || $isAdminOrManager;
        $payload['unviewed_changes'] = $project->unviewedChanges ?? collect();
        $payload['unviewed_changes_count'] = $payload['unviewed_changes']->count();
        $payload['all_changes'] = $project->changes ?? collect();

        $viewOnlyUserIds = $project->visibility()
            ->where('is_visible', true)
            ->pluck('user_id')
            ->filter(fn ($id) => ! in_array((int) $id, array_map('intval', $memberIds)) && (int) $id !== (int) $project->created_by)
            ->values()
            ->toArray();
        $payload['view_only_users'] = ! empty($viewOnlyUserIds)
            ? User::whereIn('id', $viewOnlyUserIds)->where('active', true)->get(['id', 'name', 'email', 'role'])
            : [];

        try {
            $payload['activity_max_id'] = (int) ProjectChange::where('project_id', $project->id)->max('id');
        } catch (\Exception $e) {
            $payload['activity_max_id'] = 0;
        }

        return response()->json(['success' => true, 'project' => $payload]);
    }

    /**
     * Update a project's properties and track field changes.
     *
     * Records field changes for audit trail, creates workflow events, handles milestone replacement,
     * deliverable creation, and sends notifications to assigned users.
     *
     * @param  Request  $request  Validated input for updatable fields.
     * @param  Project  $project  The project to update.
     * @return JsonResponse JSON response with the updated project and change count.
     */
    public function update(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = (int) $project->created_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'sheets_documents' => 'nullable|string',
            'website_name' => 'nullable|string',
            'website_link' => 'nullable|string',
            'client_name' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:1000',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'nullable|string|max:32',
            'sidebar_notes' => 'nullable|string',
            'team_id' => 'nullable|exists:teams,id',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'exists:teams,id',
            'assigned_users' => 'nullable|array',
            'created_by' => 'nullable|exists:users,id',
            'status' => 'sometimes|nullable|string|max:64',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'milestones' => 'nullable|array',
            'milestones.*.title' => 'nullable|string|max:255',
            'milestones.*.due_date' => 'nullable|date',
            'milestones.*.status' => 'nullable|string|max:32',
            'existing_file_names' => 'nullable|array',
            'existing_file_names.*.id' => 'required_with:existing_file_names|exists:project_files,id',
            'existing_file_names.*.name' => 'required_with:existing_file_names|string|max:255',
        ]);

        $milestones = $validated['milestones'] ?? null;
        unset($validated['milestones']);
        $existingFileNames = $validated['existing_file_names'] ?? null;
        unset($validated['existing_file_names']);

        $oldValues = [];
        $fieldLabels = ['title' => 'Title', 'description' => 'Description', 'start_date' => 'Start Date', 'end_date' => 'End Date', 'priority' => 'Priority', 'status' => 'Status', 'budget' => 'Budget', 'category' => 'Category', 'client_name' => 'Client Name', 'website_name' => 'Website Name', 'website_link' => 'Website Link', 'team_id' => 'Team', 'sheets_documents' => 'Documents'];
        foreach (array_keys($fieldLabels) as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $project->{$f};
            }
        }

        $oldAssignedUsers = $project->assigned_users ?? [];
        $oldTeamId = $project->team_id;
        $validated['updated_by'] = $user->id;
        $project->update($validated);

        // Rename existing files/links if provided
        if ($existingFileNames) {
            foreach ($existingFileNames as $item) {
                \App\Models\ProjectFile::where('id', $item['id'])
                    ->where('project_id', $project->id)
                    ->update(['name' => $item['name']]);
            }
        }

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            if ($f === 'team_id') continue;
            $newVal = $project->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = ['field_name' => $f, 'label' => $fieldLabels[$f], 'old_value' => $oldStr, 'new_value' => $newStr];
            }
        }

        if (array_key_exists('team_id', $validated) && $oldTeamId != $project->team_id) {
            $oldTeamName = $oldTeamId ? (Team::find($oldTeamId)->name ?? 'Unknown') : 'None';
            $newTeamName = $project->team_id ? (Team::find($project->team_id)->name ?? 'Unknown') : 'None';
            $changes[] = ['field_name' => 'team_id', 'label' => 'Team', 'old_value' => $oldTeamName, 'new_value' => $newTeamName];
        }

        if (array_key_exists('assigned_users', $validated)) {
            $newAssignedUsers = $validated['assigned_users'] ?? [];
            sort($oldAssignedUsers);
            sort($newAssignedUsers);
            if ($oldAssignedUsers !== $newAssignedUsers) {
                $oldNames = User::whereIn('id', $oldAssignedUsers)->pluck('name')->implode(', ');
                $newNames = User::whereIn('id', $newAssignedUsers)->pluck('name')->implode(', ');
                $changes[] = ['field_name' => 'assigned_users', 'label' => 'Assigned Users', 'old_value' => $oldNames ?: 'None', 'new_value' => $newNames ?: 'None'];
            }
        }

        if ($request->has('milestones')) {
            $this->replaceProjectMilestones($project, $milestones);
            $project->syncDatesFromMilestones();
        }

        $changeRecords = array_map(fn ($c) => [
            'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
            'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
        ], $changes);

        if (! empty($changeRecords)) {
            $project->changes()->createMany($changeRecords);
            $project->workflowEvents()->createMany(
                array_map(fn ($c) => [
                    'project_id' => $project->id, 'user_id' => $user->id,
                    'action' => 'field_changed',
                    'comment' => $this->formatWorkflowComment($c, $user),
                ], $changes)
            );
        }

        // Log activity and send notifications — wrapped individually so
        // any single failure (e.g. SMTP timeout) never blocks the response.
        $changeCount = count($changes);

        try {
            $this->sendProjectUpdateNotification($project, $user, $changes);
        } catch (\Throwable $e) {
            \Log::error('Failed to send project update notification', ['error' => $e->getMessage()]);
        }

        try {
            if ($changeCount > 0) {
                $fieldNames = array_column($changes, 'label');
                $this->notificationService->confirmAction($user, 'Updated', 'project', $project->title, [
                    'Changes Made' => implode(', ', array_slice($fieldNames, 0, 5)).(count($fieldNames) > 5 ? ' and more' : ''),
                ]);
            }
        } catch (\Throwable $e) {
            \Log::error('Failed to send confirmation email', ['error' => $e->getMessage()]);
        }

        if ($changeCount > 0) {
            $fieldNames = array_column($changes, 'label');
            $activityDesc = 'You updated project "'.$project->title.'" — changed: '.implode(', ', array_slice($fieldNames, 0, 3));
            if ($changeCount > 3) {
                $activityDesc .= ' and '.($changeCount - 3).' more';
            }
            try {
                $this->activityService->log($user->id, 'project_updated', $activityDesc, 'project', $project->id);
            } catch (\Throwable $e) {
                \Log::error('Failed to log activity', ['error' => $e->getMessage()]);
            }
            $this->clearDashboardCache($user->id);

            try {
                $this->auditService->log(
                    module: 'project_management',
                    action: 'update',
                    description: "Updated project {$project->title}",
                    user: $user,
                    entityType: 'Project',
                    entityId: $project->id,
                    oldValues: $oldValues,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
            }
        }

        $project->refresh();
        $project->load([
            'creator:id,name,role,email',
            'team',
            'tasks' => fn ($q) => $q->with('assignee:id,name,role'),
            'files',
            'deliverables',
            'workflowEvents' => fn ($q) => $q->with('user:id,name'),
        ]);

        return response()->json([
            'success' => true,
            'message' => $changeCount > 0 ? 'Project updated — '.$changeCount.' change(s) made' : 'Project updated successfully',
            'project' => $project,
            'changes_count' => $changeCount,
        ]);
    }

    /**
     * Partially update a project (sidebar notes or status only).
     *
     * @param  Request  $request  Input: sidebar_notes or status.
     * @param  Project  $project  The project to patch.
     * @return JsonResponse JSON response with updated fields.
     */
    public function patch(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = (int) $project->created_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'sidebar_notes' => 'sometimes|nullable|string',
            'status' => 'sometimes|string|max:64',
            'assigned_users' => 'sometimes|nullable|array',
            'assigned_users.*' => 'integer|exists:users,id',
        ]);

        $oldStatus = $project->status;
        $oldSidebarNotes = $project->sidebar_notes;
        $project->update($validated);

        if (array_key_exists('status', $validated)) {
            ProjectWorkflowEvent::create([
                'project_id' => $project->id, 'user_id' => $user->id,
                'action' => 'status_updated',
                'comment' => $oldStatus.' → '.$validated['status'],
            ]);

            $assignedUserIds = $project->assigned_users ?? [];
            if (is_string($assignedUserIds)) {
                $assignedUserIds = json_decode($assignedUserIds, true) ?? [];
            }
            $notifications = [];
            foreach (array_filter($assignedUserIds, fn ($id) => (int) $id !== (int) $user->id) as $recipientId) {
                $notifications[] = [
                    'user_id' => $recipientId,
                    'sender_user_id' => $user->id,
                    'type' => 'project_status_updated',
                    'related_module' => 'project',
                    'related_id' => $project->id,
                    'title' => 'Project Status Updated',
                    'message' => $user->name.' changed status of project "'.$project->name.'" from '.$oldStatus.' to '.$validated['status'].'.',
                    'link' => '/projects/'.$project->id,
                ];
            }
            $this->notificationService->createBulk($notifications);

            $this->notificationService->confirmAction($user, 'Updated status of', 'project', $project->name, [
                'Previous Status' => $oldStatus,
                'New Status' => $validated['status'],
            ]);
        }

        if (array_key_exists('sidebar_notes', $validated)) {
            $newSidebarNotes = $project->sidebar_notes;
            if ((string) ($oldSidebarNotes ?? '') !== (string) ($newSidebarNotes ?? '')) {
                ProjectChange::create([
                    'project_id' => $project->id,
                    'field_name' => 'sidebar_notes',
                    'old_value' => $oldSidebarNotes,
                    'new_value' => $newSidebarNotes,
                    'modified_by' => $user->id,
                    'is_viewed' => false,
                ]);
                ProjectWorkflowEvent::create([
                    'project_id' => $project->id,
                    'user_id' => $user->id,
                    'action' => 'field_changed',
                    'comment' => 'Sidebar notes updated',
                ]);
            }
        }

        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Project updated',
            'project' => $project->fresh()->only(array_keys($validated)),
        ]);
    }

    /**
     * Mark a project as completed and create a final deliverable from it.
     *
     * @param  Project  $project  The project to complete.
     * @return JsonResponse JSON response with the completed project and created deliverable.
     */
    public function completeProject(Project $project)
    {
        $user = request()->user();
        $isCreator = (int) $project->created_by === (int) $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (! $isCreator && ! $isAssigned && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $project->update(['status' => 'completed']);

        ProjectWorkflowEvent::create(['project_id' => $project->id, 'user_id' => $user->id, 'action' => 'completed']);

        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) {
            $assignedUserIds = json_decode($assignedUserIds, true) ?? [];
        }
        // Filter out deleted/non-existent users
        $validUserIds = User::whereIn('id', $assignedUserIds)->pluck('id')->map(fn ($id) => (string) $id)->toArray();
        $assignedUserIds = array_values(array_intersect($assignedUserIds, $validUserIds));
        $notifications = [];
        foreach (array_filter($assignedUserIds, fn ($id) => (int) $id !== (int) $user->id) as $recipientId) {
            $notifications[] = [
                'user_id' => $recipientId,
                'sender_user_id' => $user->id,
                'type' => 'project_completed',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Completed',
                'message' => $user->name.' has marked project "'.$project->name.'" as completed.',
                'link' => '/projects/'.$project->id,
            ];
        }
        if (! empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }

        $this->notificationService->confirmAction($user, 'Completed', 'project', $project->name, [
            'Completed On' => now()->format('d M Y, g:i A'),
        ]);

        $deliverable = Deliverable::create([
            'project_id' => $project->id, 'task_id' => null,
            'title' => $project->title, 'description' => $project->description,
            'status' => 'pending', 'priority' => $project->priority ?? 'Medium',
            'due_date' => $project->end_date, 'assigned_to' => $user->id,
            'created_by' => $project->created_by,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project marked as completed',
            'project' => $project->fresh(),
            'deliverable' => $deliverable,
        ]);
    }

    /**
     * Delete a project. Only the creator or admin/manager can delete.
     *
     * @param  Project  $project  The project to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function destroy(Project $project)
    {
        $user = request()->user();
        $isCreator = (int) $project->created_by === (int) $user->id;

        if (! $isCreator && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $project->delete();

        try {
            $this->auditService->log(
                module: 'project_management',
                action: 'delete',
                description: "Deleted project {$project->title}",
                user: $user,
                entityType: 'Project',
                entityId: $project->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'Project deleted successfully']);
    }

    /**
     * Upload a file attachment to a project.
     *
     * @param  Request  $request  Input: file (required, max 10MB).
     * @param  Project  $project  The project to upload the file to.
     * @return JsonResponse JSON response with the created file record.
     */
    public function uploadFile(Request $request, Project $project)
    {
        $request->validate(['file' => 'required|file|max:10240']);
        $file = $request->file('file');
        $path = $file->store('project-files', 'public');

        $attachment = $project->files()->create([
            'name' => $file->getClientOriginalName(),
            'url' => '/storage/'.$path,
        ]);

        $user = $request->user();
        ProjectChange::create([
            'project_id' => $project->id,
            'field_name' => 'file_uploaded',
            'old_value' => null,
            'new_value' => $file->getClientOriginalName(),
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'File uploaded: '.$file->getClientOriginalName(),
        ]);

        return response()->json(['success' => true, 'message' => 'File uploaded successfully', 'file' => $attachment], 201);
    }

    /**
     * Add a URL link attachment to a project.
     *
     * @param  Request  $request  Input: url (required), name (optional).
     * @param  Project  $project  The project to add the link to.
     * @return JsonResponse JSON response with the created file record.
     */
    public function addLink(Request $request, Project $project)
    {
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'name' => 'nullable|string|max:255',
        ]);

        $linkName = $validated['name'] ?? $validated['url'];
        $attachment = $project->files()->create([
            'name' => $linkName,
            'url' => $validated['url'],
        ]);

        $user = $request->user();
        ProjectChange::create([
            'project_id' => $project->id,
            'field_name' => 'link_added',
            'old_value' => null,
            'new_value' => $linkName,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'Link added: '.$linkName,
        ]);

        return response()->json(['success' => true, 'message' => 'Link added successfully', 'file' => $attachment], 201);
    }

    /**
     * Get the visibility settings for a project. Admin/manager only.
     *
     * @param  Project  $project  The project to get visibility for.
     * @return JsonResponse JSON response with user visibility list.
     */
    public function getVisibility(Project $project)
    {
        $user = request()->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $users = User::where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'role', 'department']);

        $visibility = $project->visibility()->get()->keyBy('user_id');
        $memberIds = array_map('intval', $project->assigned_users ?? []);

        $result = $users->map(function ($u) use ($visibility, $memberIds, $project) {
            $row = $visibility->get($u->id);
            $isMember = in_array($u->id, $memberIds) || (int) $u->id === (int) $project->created_by;

            return [
                'id' => $u->id,
                'name' => $u->name,
                'role' => $u->role,
                'department' => $u->department,
                'is_member' => $isMember,
                'is_visible' => $row ? (bool) $row->is_visible : $isMember,
            ];
        });

        return response()->json(['success' => true, 'users' => $result]);
    }

    /**
     * Update project visibility for specific users. Admin/manager only.
     *
     * Grants or revokes view access for the specified user IDs. Sends notifications
     * for access granted/revoked and logs the activity.
     *
     * @param  Request  $request  Input: user_ids[].
     * @param  Project  $project  The project to update visibility for.
     * @return JsonResponse JSON response confirming visibility update.
     */
    public function setVisibility(Request $request, Project $project)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'user_ids' => 'present|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $newIds = collect($validated['user_ids']);
        $existing = $project->visibility()->get()->keyBy('user_id');

        $grantedUsers = [];
        $newRecords = [];

        foreach ($newIds as $uid) {
            if ($existing->has($uid)) {
                $existing->forget($uid);
            } else {
                $newRecords[] = ['project_id' => $project->id, 'user_id' => $uid, 'is_visible' => true];
            }
            $grantedUsers[] = $uid;
        }
        // Bulk insert new records + bulk update removed
        if (! empty($newRecords)) {
            ProjectVisibility::insert($newRecords);
        }
        ProjectVisibility::where('project_id', $project->id)->whereIn('user_id', $newIds->toArray())->update(['is_visible' => true]);
        $removedIds = $existing->pluck('user_id')->toArray();
        if (! empty($removedIds)) {
            ProjectVisibility::where('project_id', $project->id)->whereIn('user_id', $removedIds)->update(['is_visible' => false]);
        }

        // Bulk notifications
        $notifications = [];
        foreach ($grantedUsers as $uid) {
            if ((int) $uid !== (int) $user->id) {
                $notifications[] = [
                    'user_id' => $uid, 'sender_user_id' => $user->id,
                    'type' => 'project_access_granted', 'related_module' => 'project',
                    'related_id' => $project->id, 'title' => 'Project View Access Granted',
                    'message' => $user->name.' granted you view access to project "'.$project->title.'".',
                    'link' => '/projects/project-details/'.$project->id,
                ];
            }
        }
        foreach ($removedIds as $uid) {
            if ((int) $uid !== (int) $user->id) {
                $notifications[] = [
                    'user_id' => $uid, 'sender_user_id' => $user->id,
                    'type' => 'project_access_removed', 'related_module' => 'project',
                    'related_id' => $project->id, 'title' => 'Project View Access Removed',
                    'message' => $user->name.' removed your view access to project "'.$project->title.'".',
                    'link' => '/projects/project-details/'.$project->id,
                ];
            }
        }
        if (! empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }

        // Create workflow events for access granted/removed
        if (! empty($grantedUsers)) {
            $grantedNames = User::whereIn('id', $grantedUsers)->pluck('name')->implode(', ');
            ProjectWorkflowEvent::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'access_granted',
                'comment' => 'Access granted to '.$grantedNames,
            ]);
        }
        if (! empty($removedIds)) {
            $removedNames = User::whereIn('id', $removedIds)->pluck('name')->implode(', ');
            ProjectWorkflowEvent::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'access_removed',
                'comment' => 'Access removed from '.$removedNames,
            ]);
        }

        // Send confirmation email to performer
        if (count($grantedUsers) > 0 || count($removedIds) > 0) {
            $details = [];
            if (count($grantedUsers) > 0) {
                $details['Access Granted To'] = User::whereIn('id', $grantedUsers)->pluck('name')->implode(', ');
            }
            if (count($removedIds) > 0) {
                $details['Access Removed From'] = User::whereIn('id', $removedIds)->pluck('name')->implode(', ');
            }
            $this->notificationService->confirmAction($user, 'Updated Visibility', 'project', $project->title, $details);
        }

        // Log activity
        $grantCount = count($grantedUsers);
        $removeCount = count($removedIds);
        if ($grantCount > 0 || $removeCount > 0) {
            $parts = [];
            if ($grantCount > 0) {
                $parts[] = 'granted access to '.$grantCount.' user(s)';
            }
            if ($removeCount > 0) {
                $parts[] = 'removed access for '.$removeCount.' user(s)';
            }
            $this->activityService->log($user->id, 'project_visibility_updated', 'You '.implode(' and ', $parts).' on project "'.$project->title.'"', 'project', $project->id);
            $this->clearDashboardCache($user->id);
        }

        return response()->json(['success' => true, 'message' => 'Visibility updated successfully']);
    }

    /**
     * Reorder project files.
     *
     * @param  Request  $request
     * @param  Project  $project
     * @return JsonResponse
     */
    public function reorderFiles(Request $request, Project $project)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:project_files,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        foreach ($request->items as $item) {
            ProjectFile::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Delete a file or link attachment from a project.
     *
     * @param  Project  $project  The project the file belongs to.
     * @param  ProjectFile  $file  The file to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function deleteFile(Project $project, ProjectFile $file)
    {
        $fileName = $file->name;
        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            Storage::disk('public')->delete($relativePath);
        }
        $file->delete();

        $user = request()->user();
        ProjectChange::create([
            'project_id' => $project->id,
            'field_name' => 'file_removed',
            'old_value' => $fileName,
            'new_value' => null,
            'modified_by' => $user->id,
            'is_viewed' => false,
        ]);
        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => 'File removed: '.$fileName,
        ]);

        return response()->json(['success' => true, 'message' => 'File deleted successfully']);
    }

    /**
     * Replace all milestones for a project with a new set.
     *
     * @param  Project  $project  The project to update milestones for.
     * @param  array|null  $rows  Array of milestone data (title, due_date, status), or null to skip.
     */
    private function replaceProjectMilestones(Project $project, ?array $rows): void
    {
        if ($rows === null) {
            return;
        }

        $oldMilestones = $project->milestones()->get()->map(fn ($m) => ['title' => $m->title, 'due_date' => $m->due_date, 'status' => $m->status])->toArray();
        $project->milestones()->delete();

        $milestones = [];
        foreach (array_values($rows) as $index => $row) {
            if (! is_array($row)) {
                continue;
            }
            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $milestones[] = [
                'title' => $title, 'due_date' => ! empty($row['due_date']) ? $row['due_date'] : null,
                'status' => $row['status'] ?? 'planned', 'sort_order' => $index,
            ];
        }
        if (! empty($milestones)) {
            $project->milestones()->createMany($milestones);
        }

        $newMilestones = collect($milestones)->map(fn ($m) => ['title' => $m['title'], 'due_date' => $m['due_date'], 'status' => $m['status']])->toArray();
        if (json_encode($oldMilestones) !== json_encode($newMilestones)) {
            $user = request()->user();
            if ($user) {
                ProjectChange::create([
                    'project_id' => $project->id,
                    'field_name' => 'milestones',
                    'old_value' => json_encode($oldMilestones),
                    'new_value' => json_encode($newMilestones),
                    'modified_by' => $user->id,
                    'is_viewed' => false,
                ]);
                ProjectWorkflowEvent::create([
                    'project_id' => $project->id,
                    'user_id' => $user->id,
                    'action' => 'field_changed',
                    'comment' => 'Milestones updated',
                ]);
            }
        }
    }

    /**
     * Toggle milestone achievement status.
     *
     * Admins and managers can mark a milestone as achieved or unachieved.
     * Sets completed_at timestamp when achieving, clears it when unachieving.
     */
    public function toggleMilestoneAchieve(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = $request->user();

        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Only admins and managers can update milestone status'], 403);
        }

        if ((int) $milestone->project_id !== (int) $project->id) {
            return response()->json(['success' => false, 'message' => 'Milestone does not belong to this project'], 404);
        }

        $isAchieved = $milestone->status === 'completed';

        if ($isAchieved) {
            $milestone->update([
                'status' => 'planned',
                'completed_at' => null,
            ]);
        } else {
            $milestone->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);
        }

        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'field_changed',
            'comment' => $isAchieved ? 'Milestone "'.$milestone->title.'" unachieved' : 'Milestone "'.$milestone->title.'" achieved',
        ]);

        return response()->json([
            'success' => true,
            'message' => $isAchieved ? 'Milestone unachieved' : 'Milestone achieved',
            'milestone' => $milestone->fresh(),
        ]);
    }

    /**
     * Send update notifications to all assigned users (excluding the updater).
     *
     * @param  Project  $project  The updated project.
     * @param  User  $updater  The user who made the update.
     * @param  int  $changeCount  Number of changes made.
     */
    private function sendProjectUpdateNotification(Project $project, User $updater, array $changes = []): void
    {
        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) {
            $assignedUserIds = json_decode($assignedUserIds, true) ?? [];
        }

        // Filter out deleted/non-existent users to prevent FK constraint violations
        $validUserIds = User::whereIn('id', $assignedUserIds)->pluck('id')->map(fn ($id) => (string) $id)->toArray();
        $assignedUserIds = array_values(array_intersect($assignedUserIds, $validUserIds));

        $changeLabels = array_map(fn ($c) => $c['label'] ?? ucwords(str_replace('_', ' ', $c['field_name'])), $changes);
        $summary = count($changeLabels) > 0
            ? implode(', ', array_slice($changeLabels, 0, 4)).(count($changeLabels) > 4 ? ' and '.(count($changeLabels) - 4).' more' : '')
            : 'details';

        $message = $updater->name.' updated project "'.$project->title.'" — changed: '.$summary.'.';

        $notifications = [];
        foreach (array_filter($assignedUserIds, fn ($id) => (int) $id !== (int) $updater->id) as $userId) {
            $notifications[] = [
                'user_id' => $userId,
                'sender_user_id' => $updater->id,
                'type' => 'project_updated',
                'related_module' => 'project',
                'related_id' => $project->id,
                'title' => 'Project Updated',
                'message' => $message,
                'link' => '/projects/project-details/'.$project->id,
            ];
        }

        if (! empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }
    }

    /**
     * Mark all unviewed changes on a project as read.
     *
     * @param  Project  $project  The project whose changes to mark.
     * @return JsonResponse JSON response confirming changes marked.
     */
    public function markChangesRead(Project $project)
    {
        $project->changes()->where('is_viewed', false)->update(['is_viewed' => true]);

        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    /**
     * Get the list of statuses considered as completed for tasks.
     *
     * @return array Array of completed status strings.
     */
    private function completedTaskStatuses(): array
    {
        return ['approved', 'completed', 'done'];
    }

    /**
     * Get the list of statuses considered as inactive for projects (completed, rejected, etc.).
     *
     * @return array Array of inactive status strings.
     */
    private function inactiveProjectStatuses(): array
    {
        return ['completed', 'Completed', 'done', 'Done', 'approved', 'Approved', 'rejected', 'Rejected',
            'cancelled', 'Cancelled', 'canceled', 'Canceled', 'abandoned', 'Abandoned', 'closed', 'Closed', 'archived', 'Archived'];
    }

    /**
     * Format a change record into a human-readable workflow comment.
     *
     * @param  array  $change  The change record with label, old_value, new_value.
     * @param  User  $user  The user who made the change.
     * @return string The formatted workflow comment.
     */
    private function formatWorkflowComment(array $change, User $user): string
    {
        $label = $change['label'];
        $old = $change['old_value'];
        $new = $change['new_value'];

        if ($label === 'Assigned Users') {
            $added = array_filter(explode(', ', $new), fn ($n) => $n !== '' && $n !== 'None');
            $removed = array_filter(explode(', ', $old), fn ($n) => $n !== '' && $n !== 'None');

            $parts = [];
            if (! empty($added)) {
                $parts[] = 'Assigned to '.implode(', ', $added).' — gave view access';
            }
            if (! empty($removed)) {
                $parts[] = 'Removed '.implode(', ', $removed).' from project';
            }

            return ! empty($parts) ? implode('; ', $parts) : 'Assigned Users updated';
        }

        return $label.': '.($old ?: '—').' → '.($new ?: '—');
    }

    /**
     * Reorder projects by updating their sort_order values.
     */
    public function reorderProjects(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:projects,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        $ids = [];
        $bindings = [];
        foreach ($request->items as $item) {
            $ids[] = (int) $item['id'];
            $bindings[] = (int) $item['id'];
            $bindings[] = (int) $item['sort_order'];
        }

        if (! empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            DB::statement(
                'UPDATE projects SET sort_order = CASE id '
                . implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?'))
                . " END WHERE id IN ($ph)",
                [...$bindings, ...$ids]
            );
        }

        return response()->json(['success' => true, 'message' => 'Projects reordered successfully']);
    }

    /**
     * Get access credentials for a project.
     */
    public function getAccessCredentials(Project $project)
    {
        $user = request()->user();
        
        $credentials = $project->accessCredentials()
            ->with('assignedUsers:id,name,role')
            ->get()
            ->filter(function ($cred) use ($user) {
                // Admin/manager can see all, others only see credentials assigned to them
                if (in_array($user->role, ['admin', 'manager'])) {
                    return true;
                }
                return $cred->assignedUsers->contains('id', $user->id);
            })
            ->values();

        return response()->json([
            'success' => true,
            'credentials' => $credentials->map(function ($cred) {
                return [
                    'id' => $cred->id,
                    'website_name' => $cred->website_name,
                    'website_url' => $cred->website_url,
                    'username' => $cred->username,
                    'password' => $cred->password_decrypted,
                    'assigned_users' => $cred->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
                    'created_by' => $cred->creator?->name,
                    'created_at' => $cred->created_at,
                ];
            }),
        ]);
    }

    /**
     * Store a new access credential for a project.
     */
    public function storeAccessCredential(Request $request, Project $project)
    {
        $request->validate([
            'website_name' => 'required|string|max:255',
            'username' => 'required|string|max:255',
            'password' => 'required|string|max:1000',
            'assigned_user_ids' => 'required|array|min:1',
            'assigned_user_ids.*' => 'exists:users,id',
        ]);

        $credential = $project->accessCredentials()->create([
            'website_name' => $request->website_name,
            'username' => $request->username,
            'password' => $request->password,
            'created_by' => $request->user()->id,
        ]);

        $credential->assignedUsers()->sync($request->assigned_user_ids);

        $this->activityService->log(
            $request->user()->id,
            'access_credential_added',
            "Added access credential: {$request->website_name}",
            'Project',
            $project->id
        );

        return response()->json([
            'success' => true,
            'message' => 'Access credential created successfully',
            'credential' => [
                'id' => $credential->id,
                'website_name' => $credential->website_name,
                'website_url' => $credential->website_url,
                'username' => $credential->username,
                'password' => $credential->password_decrypted,
                'assigned_users' => $credential->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ], 201);
    }

    /**
     * Update an access credential.
     */
    public function updateAccessCredential(Request $request, Project $project, ProjectAccessCredential $credential)
    {
        if ($credential->project_id !== $project->id) {
            return response()->json(['success' => false, 'message' => 'Credential does not belong to this project'], 404);
        }

        $request->validate([
            'website_name' => 'required|string|max:255',
            'website_url' => 'nullable|string|max:500',
            'username' => 'required|string|max:255',
            'password' => 'required|string|max:1000',
            'assigned_user_ids' => 'required|array|min:1',
            'assigned_user_ids.*' => 'exists:users,id',
        ]);

        $credential->update([
            'website_name' => $request->website_name,
            'website_url' => $request->website_url,
            'username' => $request->username,
            'password' => $request->password,
        ]);

        $credential->assignedUsers()->sync($request->assigned_user_ids);

        return response()->json([
            'success' => true,
            'message' => 'Access credential updated successfully',
            'credential' => [
                'id' => $credential->id,
                'website_name' => $credential->website_name,
                'website_url' => $credential->website_url,
                'username' => $credential->username,
                'password' => $credential->password_decrypted,
                'assigned_users' => $credential->assignedUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name]),
            ],
        ]);
    }

    /**
     * Delete an access credential.
     */
    public function deleteAccessCredential(Project $project, ProjectAccessCredential $credential)
    {
        if ($credential->project_id !== $project->id) {
            return response()->json(['success' => false, 'message' => 'Credential does not belong to this project'], 404);
        }

        $credential->delete();

        return response()->json([
            'success' => true,
            'message' => 'Access credential deleted successfully',
        ]);
    }
}