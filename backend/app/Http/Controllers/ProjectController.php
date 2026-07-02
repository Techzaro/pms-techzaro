<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\ProjectVisibility;
use App\Models\ProjectFile;
use App\Models\ProjectSubmission;
use App\Models\ProjectWorkflowEvent;
use App\Models\Team;
use App\Models\User;
use App\Http\Resources\ProjectResource;
use App\Services\NotificationService;
use App\Services\ActivityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Controller for managing projects.
 * Handles CRUD operations, file/link management, visibility controls,
 * milestone management, and the full submission/approval/rejection/reopen workflow.
 * Sends notifications for assignment, updates, and workflow state changes.
 */
class ProjectController extends Controller
{
    private const CACHE_TTL = 300;

    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService
    ) {}

    /**
     * List all projects visible to the authenticated user.
     *
     * Admin/manager users see all projects. Other users see projects they created,
     * are assigned to, are team members of, or have manual visibility access.
     * Supports 'active' filter to exclude completed/archived projects.
     *
     * @return \Illuminate\Http\JsonResponse  JSON response with project list and submission eligibility flags.
     */
    public function index()
    {
        $user = request()->user();
        $filter = request()->query('filter');

        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        if (in_array($user->role, ['admin', 'manager'])) {
            $projectsQuery = Project::with(['creator:id,name', 'team:id,name'])
                ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                    $q->whereIn('status', $this->completedTaskStatuses());
                }])
                ->withCount(['tasks as approved_tasks' => function ($q) {
                    $q->where('status', 'approved');
                }])
                ->withCount(['deliverables as pending_deliverables_count' => function ($q) {
                    $q->whereNull('task_id')->where('status', 'pending');
                }])
                ->latest();
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
            ->with(['creator:id,name', 'team:id,name'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', $this->completedTaskStatuses());
            }])
            ->withCount(['tasks as approved_tasks' => function ($q) {
                $q->where('status', 'approved');
            }])
            ->withCount(['deliverables as pending_deliverables_count' => function ($q) {
                $q->whereNull('task_id')->where('status', 'pending');
            }])
            ->latest();
        }

        if ($filter === 'active') {
            $projectsQuery->whereNotIn('status', $this->inactiveProjectStatuses());
        }

        $projects = $projectsQuery->limit(200)->get();

        return $projects->map(function ($project) use ($user, $submittableStatuses) {
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $totalTasks = $project->total_tasks ?? 0;
            $approvedTasks = $project->approved_tasks ?? 0;
            $allTasksApproved = $totalTasks === 0 || $approvedTasks === $totalTasks;
            $allDeliverablesApproved = ($project->pending_deliverables_count ?? 0) === 0;
            $project->is_assigned = $isAssigned;
            $project->can_submit = in_array($project->status, $submittableStatuses) && $isAssigned && $allTasksApproved && $allDeliverablesApproved;
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
     * @param  \Illuminate\Http\Request  $request  Validated input: title, description, goals, client_name, priority, team_id, assigned_users[], milestones[], deliverables[], etc.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created project.
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

        // Create workflow event for project creation
        ProjectWorkflowEvent::create([
            'project_id' => $project->id,
            'user_id' => $request->user()->id,
            'action' => 'created',
            'comment' => !empty($validated['assigned_users'])
                ? 'Created project and assigned to ' . User::whereIn('id', $validated['assigned_users'])->pluck('name')->implode(', ') . ' — gave view access'
                : null,
        ]);

        // Create assignment events in bulk
        if (!empty($validated['assigned_users'])) {
            $assigneeNames = User::whereIn('id', $validated['assigned_users'])->pluck('name')->implode(', ');
            $assignedEvents = [];
            foreach ($validated['assigned_users'] as $assigneeId) {
                if ((int) $assigneeId !== (int) $request->user()->id) {
                    $assignedEvents[] = [
                        'project_id' => $project->id,
                        'user_id' => $request->user()->id,
                        'action' => 'assigned',
                        'comment' => 'Assigned to ' . $assigneeNames . ' — gave view access',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
            if (!empty($assignedEvents)) {
                DB::table('project_workflow_events')->insert($assignedEvents);
            }
        }

        $this->sendProjectAssignmentNotification($project, $request->user());

        // Log activity for the creator
        $assigneeNames = !empty($validated['assigned_users'])
            ? User::whereIn('id', $validated['assigned_users'])->pluck('name')->implode(', ')
            : '';
        $activityDesc = $assigneeNames
            ? 'You created project "' . $project->title . '" and assigned it to ' . $assigneeNames
            : 'You created project "' . $project->title . '"';
        $this->activityService->log($request->user()->id, 'project_created', $activityDesc, 'project', $project->id);
        $this->clearDashboardCache($request->user()->id);

        if (!empty($deliverables)) {
            $assignedUsers = $validated['assigned_users'] ?? [];
            if (!empty($assignedUsers)) {
                $createdDeliverables = $project->deliverables()->createMany(
                    collect($deliverables)->flatMap(fn ($del) => collect($assignedUsers)->map(fn ($userId) => [
                        'title' => $del['title'], 'description' => $del['description'] ?? null,
                        'status' => 'pending', 'priority' => $validated['priority'] ?? 'Medium',
                        'due_date' => $del['due_date'] ?? null, 'assigned_to' => $userId,
                        'created_by' => $request->user()->id,
                    ]))->toArray()
                );
                $dlvNotifications = [];
                foreach ($createdDeliverables as $dlv) {
                    if ((int) $dlv->assigned_to !== (int) $request->user()->id) {
                        $dlvNotifications[] = [
                            'user_id' => $dlv->assigned_to, 'sender_user_id' => $request->user()->id,
                            'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                            'related_id' => $dlv->id,
                            'title' => 'Deliverable Assigned',
                            'message' => 'A new deliverable "' . $dlv->title . '" has been assigned to you by ' . $request->user()->name . '.',
                            'link' => '/deliveries?selectedDeliverable=' . $dlv->id,
                        ];
                    }
                }
                if (!empty($dlvNotifications)) {
                    $this->notificationService->createBulk($dlvNotifications);
                }
            }
        }

        // Send confirmation email to performer
        $assigneeNames = User::whereIn('id', $validated['assigned_users'] ?? [])->pluck('name')->implode(', ');
        $this->notificationService->confirmAction($request->user(), 'Created & Assigned', 'project', $project->title, [
            'Assigned To' => $assigneeNames ?: 'N/A',
            'Deliverables' => !empty($deliverables) ? (string) count($deliverables) . ' added' : 'None',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project created successfully',
            'project' => $project,
        ], 201);
    }

    /**
     * Retrieve a single project with all related data (tasks, deliverables, milestones, submissions, workflow events).
     *
     * Enforces authorization based on visibility, team membership, task assignment, or admin/manager role.
     * Returns submission eligibility flags and unviewed changes.
     *
     * @param  \App\Models\Project  $project  The project to retrieve.
     * @return \Illuminate\Http\JsonResponse  JSON response with full project details or 403.
     */
    public function show(Project $project)
    {
        $user = request()->user();

        if (!in_array($user->role, ['admin', 'manager'])) {
            $project->load('team.members:id', 'manuallyVisibleTo:user_id');
            $isCreator = $project->created_by === $user->id;
            $isAssigned = in_array($user->id, $project->assigned_users ?? []);
            $isTeamMember = $project->team_id && $project->team && (
                $project->team->members->contains('id', $user->id) ||
                $project->team->leader_id === $user->id
            );
            $hasTasksUnderProject = $project->tasks()->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))->exists();
            $isManuallyVisible = $project->manuallyVisibleTo->isNotEmpty();
            $isTeamLead = $user->role === 'team_lead';

            if (!$isCreator && !$isAssigned && !$isTeamMember && !$hasTasksUnderProject && !$isManuallyVisible && !$isTeamLead) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        $project->load([
            'creator:id,name,email,role',
            'team.leader:id,name,email,role',
            'team.members:id,name,email,role',
            'milestones',
            'files',
            'submissions' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments'])->latest(),
            'latestSubmission' => fn ($q) => $q->with(['submittedBy:id,name,email', 'attachments']),
            'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
            'approvedBy:id,name',
            'rejectedBy:id,name',
            'reopenedBy:id,name',
            'changes' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'unviewedChanges' => fn ($q) => $q->with('modifiedBy:id,name')->latest(),
            'deliverables' => fn ($q) => $q->with(['assignee:id,name,role', 'creator:id,name,role'])->orderBy('sort_order'),
            'tasks' => fn ($q) => $q->with(['assignees:id,name', 'assigner:id,name,role'])->withCount([
                'deliverables as total_deliverables',
                'deliverables as approved_deliverables' => fn ($q) => $q->where('status', 'approved'),
                'deliverables as pending_deliverables' => fn ($q) => $q->whereNotIn('status', ['approved']),
            ])->orderBy('sort_order')->latest(),
        ]);

        $project->loadCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
            $q->whereIn('status', ['approved', 'completed', 'done']);
        }]);

        if ($project->team && $project->team->leader) {
            $leaderInMembers = $project->team->members->contains('id', $project->team->leader_id);
            if (!$leaderInMembers) {
                $project->team->members->push($project->team->leader);
            }
        }

        $memberIds = $project->assigned_users ?? [];
        $members = !empty($memberIds)
            ? User::whereIn('id', $memberIds)->where('active', true)->orderBy('name')->get(['id', 'name', 'email', 'role'])
            : collect();

        $isCreator = $project->created_by === $user->id;
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);
        $submittableStatuses = ['pending', 'reopened', 'Planned', 'in_progress', 'In Progress'];

        // Cache approval checks since they involve sub-queries
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
        $payload['is_creator'] = $isCreator;
        $payload['is_assigned'] = $isAssigned;
        $payload['is_admin_or_manager'] = $isAdminOrManager;
        $payload['can_edit'] = $isAdminOrManager;
        $payload['can_submit'] = in_array($project->status, $submittableStatuses) && $isAssigned && $approvalStatus['all_deliverables_approved'] && $approvalStatus['all_tasks_approved'];
        $payload['can_review'] = $project->status === 'submitted' && ($isCreator || $isAdminOrManager);
        $payload['unviewed_changes'] = $project->unviewedChanges;
        $payload['unviewed_changes_count'] = $project->unviewedChanges->count();
        $payload['all_changes'] = $project->changes;
        $payload['activity_max_id'] = (int) \App\Models\ProjectChange::where('project_id', $project->id)->max('id');

        return response()->json(['success' => true, 'project' => $payload]);
    }

    /**
     * Update a project's properties and track field changes.
     *
     * Records field changes for audit trail, creates workflow events, handles milestone replacement,
     * deliverable creation, and sends notifications to assigned users.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input for updatable fields.
     * @param  \App\Models\Project  $project  The project to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated project and change count.
     */
    public function update(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
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
            'status' => 'sometimes|nullable|string|max:64',
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

        $oldValues = [];
        $fieldLabels = ['title' => 'Title','description' => 'Description','start_date' => 'Start Date','end_date' => 'End Date','priority' => 'Priority','status' => 'Status','budget' => 'Budget','category' => 'Category','client_name' => 'Client Name','website_name' => 'Website Name','website_link' => 'Website Link','goals' => 'Goals'];
        foreach (array_keys($fieldLabels) as $f) {
            if (array_key_exists($f, $validated)) {
                $oldValues[$f] = $project->{$f};
            }
        }

        $oldAssignedUsers = $project->assigned_users ?? [];
        $project->update($validated);

        $changes = [];
        foreach ($oldValues as $f => $oldVal) {
            $newVal = $project->{$f};
            $oldStr = is_object($oldVal) && method_exists($oldVal, 'format') ? $oldVal->format('Y-m-d H:i') : (string) $oldVal;
            $newStr = is_object($newVal) && method_exists($newVal, 'format') ? $newVal->format('Y-m-d H:i') : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = ['field_name' => $f, 'label' => $fieldLabels[$f], 'old_value' => $oldStr, 'new_value' => $newStr];
            }
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
        }

        $addedDeliverables = [];
        if (!empty($deliverables)) {
            $assignedUsers = $project->assigned_users ?? [];
            if (!empty($assignedUsers)) {
                $bulkDeliverables = [];
                foreach ($deliverables as $del) {
                    foreach ($assignedUsers as $userId) {
                        $bulkDeliverables[] = [
                            'title' => $del['title'], 'description' => $del['description'] ?? null,
                            'status' => 'pending', 'priority' => $project->priority ?? 'Medium',
                            'due_date' => $del['due_date'] ?? null, 'assigned_to' => $userId,
                            'created_by' => $request->user()->id,
                        ];
                    }
                    $addedDeliverables[] = $del['title'];
                }
                if (!empty($bulkDeliverables)) {
                    $createdDeliverables = $project->deliverables()->createMany($bulkDeliverables);
                    $bulkNotifications = [];
                    foreach ($createdDeliverables as $dlv) {
                        if ((int) $dlv->assigned_to !== (int) $user->id) {
                            $bulkNotifications[] = [
                                'user_id' => $dlv->assigned_to, 'sender_user_id' => $user->id,
                                'type' => 'deliverable_assigned', 'related_module' => 'deliverable',
                                'related_id' => $dlv->id,
                                'title' => 'Deliverable Assigned',
                                'message' => 'A new deliverable "' . $dlv->title . '" has been assigned to you by ' . $user->name . '.',
                                'link' => '/deliveries?selectedDeliverable=' . $dlv->id,
                            ];
                        }
                    }
                    if (!empty($bulkNotifications)) {
                        $this->notificationService->createBulk($bulkNotifications);
                    }
                }
            }
        }
        if (!empty($addedDeliverables)) {
            $changes[] = ['field_name' => 'deliverables', 'label' => 'Deliverable Added', 'old_value' => '', 'new_value' => implode(', ', $addedDeliverables)];
        }

        $changeRecords = array_map(fn ($c) => [
            'field_name' => $c['field_name'], 'old_value' => $c['old_value'],
            'new_value' => $c['new_value'], 'modified_by' => $user->id, 'is_viewed' => false,
        ], $changes);

        if (!empty($changeRecords)) {
            $project->changes()->createMany($changeRecords);
            $project->workflowEvents()->createMany(
                array_map(fn ($c) => [
                    'project_id' => $project->id, 'user_id' => $user->id,
                    'action' => 'field_changed',
                    'comment' => $this->formatWorkflowComment($c, $user),
                ], $changes)
            );
        }

        $this->sendProjectUpdateNotification($project, $user, $changes);

        // Send confirmation email to performer
        if (count($changes) > 0) {
            $fieldNames = array_column($changes, 'label');
            $this->notificationService->confirmAction($user, 'Updated', 'project', $project->title, [
                'Changes Made' => implode(', ', array_slice($fieldNames, 0, 5)) . (count($fieldNames) > 5 ? ' and more' : ''),
            ]);
        }

        // Log activity
        $changeCount = count($changes);
        if ($changeCount > 0) {
            $fieldNames = array_column($changes, 'label');
            $activityDesc = 'You updated project "' . $project->title . '" — changed: ' . implode(', ', array_slice($fieldNames, 0, 3));
            if ($changeCount > 3) $activityDesc .= ' and ' . ($changeCount - 3) . ' more';
            $this->activityService->log($user->id, 'project_updated', $activityDesc, 'project', $project->id);
        $this->clearDashboardCache($user->id);
        }

        return response()->json([
            'success' => true,
            'message' => $changeCount > 0 ? 'Project updated — ' . $changeCount . ' change(s) made' : 'Project updated successfully',
            'project' => $project->fresh(),
            'changes_count' => $changeCount,
        ]);
    }

    /**
     * Partially update a project (sidebar notes, goals checklist, or status only).
     *
     * @param  \Illuminate\Http\Request  $request  Input: sidebar_notes, goals_checklist, or status.
     * @param  \App\Models\Project  $project  The project to patch.
     * @return \Illuminate\Http\JsonResponse  JSON response with updated fields.
     */
    public function patch(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'sidebar_notes' => 'sometimes|nullable|string',
            'goals_checklist' => 'sometimes|nullable|array',
            'goals_checklist.*.text' => 'required_with:goals_checklist|string',
            'goals_checklist.*.done' => 'nullable|boolean',
            'status' => 'sometimes|string|max:64',
        ]);

        $oldStatus = $project->status;
        $project->update($validated);

        if (array_key_exists('status', $validated)) {
            ProjectWorkflowEvent::create([
                'project_id' => $project->id, 'user_id' => $user->id,
                'action' => 'status_updated',
                'comment' => $oldStatus . ' → ' . $validated['status'],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Project updated',
            'project' => $project->fresh()->only(array_keys($validated)),
        ]);
    }

    /**
     * Mark a project as completed and create a final deliverable from it.
     *
     * @param  \App\Models\Project  $project  The project to complete.
     * @return \Illuminate\Http\JsonResponse  JSON response with the completed project and created deliverable.
     */
    public function completeProject(Project $project)
    {
        $user = request()->user();
        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $project->update(['status' => 'completed']);

        ProjectWorkflowEvent::create(['project_id' => $project->id, 'user_id' => $user->id, 'action' => 'completed']);

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
     * @param  \App\Models\Project  $project  The project to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function destroy(Project $project)
    {
        $user = request()->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $project->delete();

        return response()->json(['success' => true, 'message' => 'Project deleted successfully']);
    }

    /**
     * Upload a file attachment to a project.
     *
     * @param  \Illuminate\Http\Request  $request  Input: file (required, max 10MB).
     * @param  \App\Models\Project  $project  The project to upload the file to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created file record.
     */
    public function uploadFile(Request $request, Project $project)
    {
        $request->validate(['file' => 'required|file|max:10240']);
        $file = $request->file('file');
        $path = $file->store('project-files', 'public');

        $attachment = $project->files()->create([
            'name' => $file->getClientOriginalName(),
            'url' => '/storage/' . $path,
        ]);

        return response()->json(['success' => true, 'message' => 'File uploaded successfully', 'file' => $attachment], 201);
    }

    /**
     * Add a URL link attachment to a project.
     *
     * @param  \Illuminate\Http\Request  $request  Input: url (required), name (optional).
     * @param  \App\Models\Project  $project  The project to add the link to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created file record.
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

        return response()->json(['success' => true, 'message' => 'Link added successfully', 'file' => $attachment], 201);
    }

    /**
     * Get the visibility settings for a project. Admin/manager only.
     *
     * @param  \App\Models\Project  $project  The project to get visibility for.
     * @return \Illuminate\Http\JsonResponse  JSON response with user visibility list.
     */
    public function getVisibility(Project $project)
    {
        $user = request()->user();
        if (!in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
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

        return response()->json(['success' => true, 'users' => $result]);
    }

    /**
     * Update project visibility for specific users. Admin/manager only.
     *
     * Grants or revokes view access for the specified user IDs. Sends notifications
     * for access granted/revoked and logs the activity.
     *
     * @param  \Illuminate\Http\Request  $request  Input: user_ids[].
     * @param  \App\Models\Project  $project  The project to update visibility for.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming visibility update.
     */
    public function setVisibility(Request $request, Project $project)
    {
        $user = $request->user();
        if (!in_array($user->role, ['admin', 'manager'])) {
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
        if (!empty($newRecords)) ProjectVisibility::insert($newRecords);
        ProjectVisibility::where('project_id', $project->id)->whereIn('user_id', $newIds->toArray())->update(['is_visible' => true]);
        $removedIds = $existing->pluck('user_id')->toArray();
        if (!empty($removedIds)) {
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
                    'message' => $user->name . ' granted you view access to project "' . $project->title . '".',
                    'link' => '/projects/project-details/' . $project->id,
                ];
            }
        }
        foreach ($removedIds as $uid) {
            if ((int) $uid !== (int) $user->id) {
                $notifications[] = [
                    'user_id' => $uid, 'sender_user_id' => $user->id,
                    'type' => 'project_access_removed', 'related_module' => 'project',
                    'related_id' => $project->id, 'title' => 'Project View Access Removed',
                    'message' => $user->name . ' removed your view access to project "' . $project->title . '".',
                    'link' => '/projects/project-details/' . $project->id,
                ];
            }
        }
        if (!empty($notifications)) {
            $this->notificationService->createBulk($notifications);
        }

        // Send confirmation email to performer
        if (count($grantedUsers) > 0 || count($removedIds) > 0) {
            $details = [];
            if (count($grantedUsers) > 0) $details['Access Granted To'] = User::whereIn('id', $grantedUsers)->pluck('name')->implode(', ');
            if (count($removedIds) > 0) $details['Access Removed From'] = User::whereIn('id', $removedIds)->pluck('name')->implode(', ');
            $this->notificationService->confirmAction($user, 'Updated Visibility', 'project', $project->title, $details);
        }

        // Log activity
        $grantCount = count($grantedUsers);
        $removeCount = count($removedIds);
        if ($grantCount > 0 || $removeCount > 0) {
            $parts = [];
            if ($grantCount > 0) $parts[] = 'granted access to ' . $grantCount . ' user(s)';
            if ($removeCount > 0) $parts[] = 'removed access for ' . $removeCount . ' user(s)';
            $this->activityService->log($user->id, 'project_visibility_updated', 'You ' . implode(' and ', $parts) . ' on project "' . $project->title . '"', 'project', $project->id);
        $this->clearDashboardCache($user->id);
        }

        return response()->json(['success' => true, 'message' => 'Visibility updated successfully']);
    }

    /**
     * Delete a file or link attachment from a project.
     *
     * @param  \App\Models\Project  $project  The project the file belongs to.
     * @param  \App\Models\ProjectFile  $file  The file to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function deleteFile(Project $project, ProjectFile $file)
    {
        if ($file->url && str_starts_with($file->url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $file->url);
            $fullPath = storage_path('app/public/' . $relativePath);
            if (file_exists($fullPath)) unlink($fullPath);
        }
        $file->delete();
        return response()->json(['success' => true, 'message' => 'File deleted successfully']);
    }

    /**
     * Submit a project for review by its creator.
     *
     * Only assigned users can submit. All tasks and deliverables must be approved first.
     * Handles file uploads, link attachments, and determines first submission vs resubmission.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, file, files[], links[].
     * @param  \App\Models\Project  $project  The project to submit.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated project.
     */
    public function submit(Request $request, Project $project)
    {
        $user = $request->user();
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isAssigned) {
            return response()->json(['success' => false, 'message' => 'Only assigned users can submit this project'], 403);
        }

        if (!in_array($project->status, ['pending', 'Planned', 'in_progress', 'In Progress', 'reopened'])) {
            return response()->json(['success' => false, 'message' => 'This project cannot be submitted in its current status'], 422);
        }

        $unapprovedTasks = $project->tasks()->where('status', '!=', 'approved')->count();
        if ($unapprovedTasks > 0) {
            return response()->json(['success' => false, 'message' => 'All project tasks must be approved before submitting'], 422);
        }

        $unapprovedDeliverables = $project->deliverables()->where('status', '!=', 'approved')->count();
        if ($unapprovedDeliverables > 0) {
            return response()->json(['success' => false, 'message' => 'All deliverables must be approved before submitting'], 422);
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

        if ($request->hasFile('files')) {
            $submission->attachments()->createMany(
                collect($request->file('files'))->map(fn ($file) => [
                    'submission_type' => 'project',
                    'file_name' => basename($path = $file->store('project-submissions/' . $project->id, 'public')),
                    'original_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'file_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                    'attachment_type' => str_starts_with($file->getMimeType(), 'image/') ? 'image' : 'file',
                    'url' => '/storage/' . $path,
                ])->toArray()
            );
        }

        if (!empty($validated['links'])) {
            $submission->attachments()->createMany(
                collect($validated['links'])->map(fn ($url) => [
                    'submission_type' => 'project', 'file_name' => $url,
                    'original_name' => $url, 'attachment_type' => 'link', 'url' => $url,
                ])->toArray()
            );
        }

        $isResubmit = $project->status === 'reopened';

        ProjectWorkflowEvent::create([
            'project_id' => $project->id, 'user_id' => $user->id,
            'action' => $isResubmit ? 'resubmitted' : 'submitted',
            'comment' => $validated['comment'] ?? null, 'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $updateData = ['status' => 'submitted', 'submitted_at' => now()];

        if ($project->status === 'reopened') {
            $updateData['rejected_at'] = null; $updateData['rejected_by'] = null;
            $updateData['rejection_comment'] = null; $updateData['reopened_at'] = null;
            $updateData['reopened_by'] = null; $updateData['reopen_comment'] = null;
            $updateData['reopen_instructions'] = null; $updateData['reopen_new_deadline'] = null;
            $updateData['reopen_file_path'] = null; $updateData['reopen_file_name'] = null;
        }

        $project->update($updateData);

        $creatorId = $project->created_by;
        if ($creatorId && $creatorId !== $user->id) {
            $this->notificationService->notify(
                $creatorId,
                $user->id,
                'project_submitted',
                'project',
                $project->id,
                'Project Submitted',
                $user->name . ' submitted the project "' . $project->title . '" for your review.',
                '/projects/project-details/' . $project->id
            );
        }

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, $isResubmit ? 'Resubmitted' : 'Submitted', 'project', $project->title, [
            'Assigned To' => User::whereIn('id', $project->assigned_users ?? [])->pluck('name')->implode(', ') ?: 'N/A',
            'Submitted To' => User::find($project->created_by)?->name ?? 'N/A',
        ]);

        // Log activity
        $isResubmitLabel = $isResubmit ? 'resubmitted' : 'submitted';
        $this->activityService->log($user->id, 'project_' . $isResubmitLabel, 'You ' . $isResubmitLabel . ' project "' . $project->title . '" for review', 'project', $project->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Project submitted successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role', 'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'latestSubmission' => fn ($q) => $q->with('submittedBy:id,name,email'),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name', 'rejectedBy:id,name', 'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Approve a submitted project. Only the creator or admin/manager can approve.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Project  $project  The project to approve (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the approved project.
     */
    public function approve(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only approve submitted projects'], 422);
        }

        $project->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => $user->id]);

        ProjectWorkflowEvent::create(['project_id' => $project->id, 'user_id' => $user->id, 'action' => 'approved']);

        $assignedUserIds = $project->assigned_users ?? [];
        $this->notificationService->notifyMultiple(
            array_filter($assignedUserIds, fn($id) => (int) $id !== (int) $user->id),
            $user->id,
            'project_approved',
            'project',
            $project->id,
            'Project Approved',
            'Your project "' . $project->title . '" has been approved.',
            '/projects/project-details/' . $project->id
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Approved', 'project', $project->title, [
            'Assigned To' => User::whereIn('id', $assignedUserIds)->pluck('name')->implode(', ') ?: 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'project_approved', 'You approved project "' . $project->title . '"', 'project', $project->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Project approved successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role', 'approvedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'rejectedBy:id,name', 'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reject a submitted project with an optional comment.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment (optional).
     * @param  \App\Models\Project  $project  The project to reject (must be in 'submitted' status).
     * @return \Illuminate\Http\JsonResponse  JSON response with the rejected project.
     */
    public function reject(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reject submitted projects'], 422);
        }

        $validated = $request->validate(['comment' => 'nullable|string|max:2000']);

        $project->update([
            'status' => 'rejected', 'rejected_at' => now(),
            'rejected_by' => $user->id, 'rejection_comment' => $validated['comment'] ?? null,
        ]);

        ProjectWorkflowEvent::create([
            'project_id' => $project->id, 'user_id' => $user->id,
            'action' => 'rejected', 'comment' => $validated['comment'] ?? null,
        ]);

        $assignedUserIds = $project->assigned_users ?? [];
        $assignedUserIds = array_values(array_filter($assignedUserIds, fn($id) => (int) $id !== (int) $user->id));
        $rejectMsg = 'Your project "' . $project->title . '" has been rejected.';
        if (!empty($validated['comment'])) $rejectMsg .= ' Reason: ' . $validated['comment'];

        $this->notificationService->notifyMultiple(
            $assignedUserIds,
            $user->id,
            'project_rejected',
            'project',
            $project->id,
            'Project Rejected',
            $rejectMsg,
            '/projects/project-details/' . $project->id
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Rejected', 'project', $project->title, [
            'Assigned To' => User::whereIn('id', $project->assigned_users ?? [])->pluck('name')->implode(', ') ?: 'N/A',
            'Reason' => $validated['comment'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'project_rejected', 'You rejected project "' . $project->title . '"', 'project', $project->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Project rejected',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role', 'rejectedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name', 'reopenedBy:id,name',
            ]),
        ]);
    }

    /**
     * Reopen a submitted project for revision with instructions and optional new deadline.
     *
     * @param  \Illuminate\Http\Request  $request  Input: comment, instructions, new_deadline, file.
     * @param  \App\Models\Project  $project  The project to reopen.
     * @return \Illuminate\Http\JsonResponse  JSON response with the reopened project.
     */
    public function reopen(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;

        if (!$isCreator && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($project->status !== 'submitted') {
            return response()->json(['success' => false, 'message' => 'Can only reopen submitted projects'], 422);
        }

        $validated = $request->validate([
            'comment' => 'nullable|string|max:2000',
            'instructions' => 'nullable|string|max:2000',
            'new_deadline' => 'nullable|date',
            'file' => 'nullable|file|mimes:zip,rar,pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif|max:51200',
        ]);

        $filePath = $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('project-reopen/' . $project->id, 'public');
        }

        $updateData = [
            'status' => 'reopened', 'reopened_at' => now(), 'reopened_by' => $user->id,
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
            'project_id' => $project->id, 'user_id' => $user->id,
            'action' => 'reopened', 'comment' => $validated['comment'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'new_deadline' => $validated['new_deadline'] ?? null,
            'file_path' => $filePath, 'file_name' => $fileName,
        ]);

        $assignedUserIds = $project->assigned_users ?? [];
        $assignedUserIds = array_values(array_filter($assignedUserIds, fn($id) => (int) $id !== (int) $user->id));
        $reopenMsg = 'Your project "' . $project->title . '" has been reopened for revision.';
        if (!empty($validated['comment'])) $reopenMsg .= ' Comment: ' . $validated['comment'];
        if (!empty($validated['instructions'])) $reopenMsg .= ' Instructions: ' . $validated['instructions'];

        $this->notificationService->notifyMultiple(
            $assignedUserIds,
            $user->id,
            'project_reopened',
            'project',
            $project->id,
            'Project Reopened',
            $reopenMsg,
            '/projects/project-details/' . $project->id
        );

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Reopened', 'project', $project->title, [
            'Assigned To' => User::whereIn('id', $project->assigned_users ?? [])->pluck('name')->implode(', ') ?: 'N/A',
            'Instructions' => $validated['instructions'] ?? 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'project_reopened', 'You reopened project "' . $project->title . '" for revision', 'project', $project->id);
        $this->clearDashboardCache($user->id);

        return response()->json([
            'success' => true,
            'message' => 'Project reopened successfully',
            'project' => $project->fresh()->load([
                'creator:id,name,email,role', 'reopenedBy:id,name',
                'submissions' => fn ($q) => $q->with('submittedBy:id,name,email')->latest(),
                'workflowEvents' => fn ($q) => $q->with('user:id,name,email')->latest(),
                'approvedBy:id,name', 'rejectedBy:id,name',
            ]),
        ]);
    }

    /**
     * Get the most recent submission for a project.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Project  $project  The project to get the latest submission for.
     * @return \Illuminate\Http\JsonResponse  JSON response with the latest submission.
     */
    public function latestSubmission(Request $request, Project $project)
    {
        $user = $request->user();
        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $submission = ProjectSubmission::where('project_id', $project->id)
            ->with('submittedBy:id,name,email')
            ->latest()
            ->first();

        return response()->json(['success' => true, 'submission' => $submission]);
    }

    /**
     * Download the file attached to a project submission.
     *
     * @param  \App\Models\ProjectSubmission  $submission  The submission containing the file.
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\JsonResponse  File download or error.
     */
    public function downloadSubmissionFile(ProjectSubmission $submission)
    {
        $user = request()->user();
        $project = $submission->project;
        $isCreator = $project->created_by === $user->id;
        $isAssigned = in_array($user->id, $project->assigned_users ?? []);

        if (!$isCreator && !$isAssigned && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if (!$submission->file_path || !Storage::disk('public')->exists($submission->file_path)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($submission->file_path, $submission->file_name);
    }

    /**
     * Replace all milestones for a project with a new set.
     *
     * @param  \App\Models\Project  $project  The project to update milestones for.
     * @param  array|null  $rows  Array of milestone data (title, due_date, status), or null to skip.
     * @return void
     */
    private function replaceProjectMilestones(Project $project, ?array $rows): void
    {
        if ($rows === null) return;
        $project->milestones()->delete();

        $milestones = [];
        foreach (array_values($rows) as $index => $row) {
            if (!is_array($row)) continue;
            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') continue;
            $milestones[] = [
                'title' => $title, 'due_date' => !empty($row['due_date']) ? $row['due_date'] : null,
                'status' => $row['status'] ?? 'planned', 'sort_order' => $index,
            ];
        }
        if (!empty($milestones)) {
            $project->milestones()->createMany($milestones);
        }
    }

    /**
     * Send update notifications to all assigned users (excluding the updater).
     *
     * @param  \App\Models\Project  $project  The updated project.
     * @param  \App\Models\User  $updater  The user who made the update.
     * @param  int  $changeCount  Number of changes made.
     * @return void
     */
    private function sendProjectUpdateNotification(Project $project, User $updater, array $changes = []): void
    {
        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) $assignedUserIds = json_decode($assignedUserIds, true) ?? [];

        // Build a short summary of all changes
        $changeLabels = array_map(fn($c) => $c['label'] ?? ucwords(str_replace('_', ' ', $c['field_name'])), $changes);
        $summary = count($changeLabels) > 0
            ? implode(', ', array_slice($changeLabels, 0, 4)) . (count($changeLabels) > 4 ? ' and ' . (count($changeLabels) - 4) . ' more' : '')
            : 'details';

        $message = $updater->name . ' updated project "' . $project->title . '" — changed: ' . $summary . '.';

        foreach (array_filter($assignedUserIds, fn($id) => (int) $id !== (int) $updater->id) as $userId) {
            $this->notificationService->notify(
                $userId,
                $updater->id,
                'project_updated',
                'project',
                $project->id,
                'Project Updated',
                $message,
                '/projects/project-details/' . $project->id
            );
        }
    }

    /**
     * Mark all unviewed changes on a project as read.
     *
     * @param  \App\Models\Project  $project  The project whose changes to mark.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming changes marked.
     */
    public function markChangesRead(Project $project)
    {
        $project->changes()->where('is_viewed', false)->update(['is_viewed' => true]);
        return response()->json(['success' => true, 'message' => 'Changes marked as read']);
    }

    /**
     * Send assignment notifications to all assigned users (excluding the sender).
     *
     * @param  \App\Models\Project  $project  The assigned project.
     * @param  \App\Models\User  $sender  The user who assigned the project.
     * @return void
     */
    private function sendProjectAssignmentNotification(Project $project, User $sender): void
    {
        $assignedUserIds = $project->assigned_users ?? [];
        if (is_string($assignedUserIds)) $assignedUserIds = json_decode($assignedUserIds, true) ?? [];

        $this->notificationService->notifyMultiple(
            array_filter($assignedUserIds, fn($id) => (int) $id !== (int) $sender->id),
            $sender->id,
            'project_assigned',
            'project',
            $project->id,
            'Project Assigned',
            'A new project "' . $project->title . '" has been assigned to you by ' . $sender->name . '.',
            '/projects/project-details/' . $project->id
        );
    }

    /**
     * Get the list of statuses considered as completed for tasks.
     *
     * @return array  Array of completed status strings.
     */
    private function completedTaskStatuses(): array { return ['approved', 'completed', 'done']; }

    /**
     * Get the list of statuses considered as inactive for projects (completed, rejected, etc.).
     *
     * @return array  Array of inactive status strings.
     */
    private function inactiveProjectStatuses(): array
    {
        return ['completed','Completed','done','Done','approved','Approved','rejected','Rejected',
                'cancelled','Cancelled','canceled','Canceled','abandoned','Abandoned','closed','Closed','archived','Archived'];
    }

    /**
     * Format a change record into a human-readable workflow comment.
     *
     * @param  array  $change  The change record with label, old_value, new_value.
     * @param  \App\Models\User  $user  The user who made the change.
     * @return string  The formatted workflow comment.
     */
    private function formatWorkflowComment(array $change, User $user): string
    {
        $label = $change['label'];
        $old = $change['old_value'];
        $new = $change['new_value'];

        if ($label === 'Assigned Users') {
            $added = array_filter(explode(', ', $new), fn($n) => $n !== '' && $n !== 'None');
            $removed = array_filter(explode(', ', $old), fn($n) => $n !== '' && $n !== 'None');

            $parts = [];
            if (!empty($added)) {
                $parts[] = 'Assigned to ' . implode(', ', $added) . ' — gave view access';
            }
            if (!empty($removed)) {
                $parts[] = 'Removed ' . implode(', ', $removed) . ' from project';
            }
            return !empty($parts) ? implode('; ', $parts) : 'Assigned Users updated';
        }

        return $label . ': ' . ($old ?: '—') . ' → ' . ($new ?: '—');
    }
}
