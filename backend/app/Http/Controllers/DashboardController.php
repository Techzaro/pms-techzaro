<?php

/**
 * Controller for providing dashboard data based on user role.
 */

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\TaskWorkflowEvent;
use App\Models\DeliverableWorkflowEvent;
use App\Models\ProjectWorkflowEvent;
use App\Models\DeliverableSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard controller.
 * Returns role-specific summary stats, workload, and recent activity.
 */
class DashboardController extends Controller
{
    /**
     * Get dashboard data based on user role.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $role = $user->role;

        return response()->json([
            'summary' => $this->getSummary($user, $role),
            'todayWorkload' => $this->getTodayWorkload($user, $role),
            'activeProjects' => $this->getActiveProjects($user, $role),
            'recentActivity' => $this->getRecentActivity($user, $role),
            'upcomingDeadlines' => $this->getUpcomingDeadlines($user, $role),
            'completedToday' => $this->getTodayActivityFeed($user, $role),
        ]);
    }

    /**
     * Summary cards: active projects, tasks due, completed, pending.
     */
    private function getSummary(User $user, string $role): array
    {
        $projectQuery = Project::query();
        $taskQuery = $this->dashboardTaskQuery($user, $role);
        $projectAsTaskQuery = $this->dashboardProjectAsTaskQuery($user, $role);

        if (in_array($role, ['admin', 'manager'])) {
            // Admin/Manager: see all projects and tasks
        } else {
            $projectIds = $this->getUserProjectIds($user);
            $projectQuery->whereIn('id', $projectIds);
        }

        $activeProjects = $projectQuery->clone()
            ->whereNotIn('status', $this->inactiveProjectStatuses())
            ->count();

        $tasksDueToday = $this->getTasksDueTodayCount($user, $role);

        $completedTasks = $taskQuery->clone()
            ->whereIn('status', $this->completedTaskStatuses())
            ->count()
            + $projectAsTaskQuery->clone()
                ->whereIn('status', $this->completedTaskStatuses())
                ->count();

        $pendingTasks = $taskQuery->clone()
            ->whereIn('status', $this->pendingTaskStatuses())
            ->count()
            + $projectAsTaskQuery->clone()
                ->whereIn('status', $this->pendingTaskStatuses())
                ->count();

        $totalTasks = $taskQuery->clone()->count() + $projectAsTaskQuery->clone()->count();

        return [
            'active_projects' => $activeProjects,
            'tasks_due_today' => $tasksDueToday,
            'completed_tasks' => $completedTasks,
            'pending_tasks' => $pendingTasks,
            'total_tasks' => $totalTasks,
        ];
    }

    /**
     * Today's tasks: tasks due today.
     * Admin/Manager: tasks they assigned to others, not yet submitted/approved/completed.
     * Other roles: tasks assigned to them due today.
     */
    private function getTodayWorkload(User $user, string $role): array
    {
        if (in_array($role, ['admin', 'manager'])) {
            $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                ->where('assigned_by', $user->id)
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->inactiveTaskStatuses())
                ->latest()
                ->get()
                ->map(fn ($task) => array_merge($task->toArray(), [
                    'module' => 'task',
                    'item_type' => 'task',
                    'entity_id' => $task->id,
                ]));

            $projects = $this->dashboardProjectAsTaskQuery($user, $role)
                ->with(['creator:id,name,role'])
                ->where('created_by', $user->id)
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->inactiveTaskStatuses())
                ->latest()
                ->get()
                ->map(fn ($project) => $this->projectAsTaskPayload($project));

            return $tasks->merge($projects)
                ->sortByDesc('created_at')
                ->values()
                ->take(10)
                ->toArray();
        }

        $tasks = $this->dashboardTaskQuery($user, $role)
            ->with(['project:id,title', 'assignees:id,name,role'])
            ->whereDate('end_date', today())
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->latest()
            ->get()
            ->map(fn ($task) => array_merge($task->toArray(), [
                'module' => 'task',
                'item_type' => 'task',
                'entity_id' => $task->id,
            ]));

        $projects = $this->dashboardProjectAsTaskQuery($user, $role)
            ->with(['creator:id,name,role'])
            ->whereDate('end_date', today())
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->latest()
            ->get()
            ->map(fn ($project) => $this->projectAsTaskPayload($project));

        return $tasks->merge($projects)
            ->sortByDesc('created_at')
            ->values()
            ->take(10)
            ->toArray();
    }

    /**
     * Active projects with progress.
     */
    private function getActiveProjects(User $user, string $role): array
    {
        $projects = Project::with(['creator:id,name', 'team:id,name'])
            ->whereNotIn('status', $this->inactiveProjectStatuses())
            ->whereIn('id', $this->getUserProjectIds($user))
            ->latest()
            ->limit(6)
            ->get();

        return $projects->map(function ($project) {
            $tasks = $project->tasks;
            $total = $tasks->count();
            $done = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['approved', 'completed', 'done'], true))->count();
            $progress = $total > 0 ? (int) round(($done / $total) * 100) : 0;

            $assignedUserIds = $project->assigned_users ?? [];
            $assignedUsers = collect();
            if (!empty($assignedUserIds)) {
                $assignedUsers = \App\Models\User::whereIn('id', $assignedUserIds)
                    ->select('id', 'name')
                    ->get();
            }

            return [
                'id' => $project->id,
                'name' => $project->title,
                'client' => $project->client_name,
                'progress' => $progress,
                'total_tasks' => $total,
                'completed_tasks' => $done,
                'deadline' => $project->end_date?->format('M d, Y h:i A'),
                'team' => $project->team?->name,
                'assigned_users' => $assignedUsers->toArray(),
            ];
        })->toArray();
    }

    /**
     * Recent activity across projects.
     */
    private function getRecentActivity(User $user, string $role): array
    {
        $query = DB::table('project_activities')
            ->join('users', 'project_activities.user_id', '=', 'users.id')
            ->join('projects', 'project_activities.project_id', '=', 'projects.id')
            ->where('users.active', true)
            ->select('project_activities.summary', 'project_activities.created_at', 'users.name as user_name', 'projects.title as project_title')
            ->latest()
            ->limit(10);

        if ($role === 'team_lead' || $role === 'member') {
            $query->whereIn('project_activities.project_id', $this->getUserProjectIds($user));
        }

        return $query->get()->toArray();
    }

    /**
     * Upcoming deadlines (tasks ending within 7 days).
     */
    private function getUpcomingDeadlines(User $user, string $role): array
    {
        $query = $this->dashboardTaskQuery($user, $role)
            ->with(['project:id,title'])
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->where('end_date', '>=', now())
            ->where('end_date', '<=', now()->addDays(7));

        $tasks = $query->get()->map(fn ($task) => [
            'id' => $task->id,
            'entity_id' => $task->id,
            'module' => 'task',
            'title' => $task->title,
            'project' => $task->project?->title,
            'end_date' => $task->end_date?->format('M d, Y h:i A'),
            'sort_date' => $task->end_date,
        ]);

        $projects = $this->dashboardProjectAsTaskQuery($user, $role)
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->where('end_date', '>=', now())
            ->where('end_date', '<=', now()->addDays(7))
            ->get()
            ->map(fn ($project) => [
                'id' => $project->id,
                'entity_id' => $project->id,
                'module' => 'project',
                'title' => $project->title,
                'project' => null,
                'end_date' => $project->end_date?->format('M d, Y h:i A'),
                'sort_date' => $project->end_date,
            ]);

        return $tasks->merge($projects)
            ->sortBy('sort_date')
            ->values()
            ->take(10)
            ->map(function ($item) {
                unset($item['sort_date']);
                return $item;
            })
            ->toArray();
    }

    /**
     * Get today's activity feed for the dashboard.
     * Admin/Manager see all activities on items they assigned/created.
     * Team Lead/Member see only their own activities.
     */
    private function getTodayActivityFeed(User $user, string $role): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $today = today();
        $activities = [];

        // ── 1. Task workflow events (submitted/resubmitted/approved/rejected/reopened) ──
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['submitted', 'resubmitted', 'approved', 'rejected', 'reopened'])
            ->get();

        foreach ($taskEvents as $event) {
            $task = $event->task;
            if (!$task) continue;
            $actor = $event->user;
            if (!$actor) continue;

            $isActor = (int) $actor->id === (int) $user->id;
            $isTaskAssigner = (int) $task->assigned_by === (int) $user->id;
            $isTaskAssignee = DB::table('task_user')
                ->where('task_id', $task->id)
                ->where('user_id', $user->id)
                ->exists();

            // Admin/Manager: show if they acted or on their assigned tasks
            // Member: show only their own actions or actions on their tasks
            if ($isAdminOrManager) {
                if (!$isActor && !$isTaskAssigner && !$isTaskAssignee) continue;
            } else {
                if (!$isActor && !$isTaskAssignee) continue;
            }

            $activities[] = [
                'id' => "task_event_{$event->id}",
                'entity_id' => $task->id,
                'module' => 'task',
                'action' => $event->action,
                'title' => $task->title,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'is_actor' => $isActor,
                'created_at' => $event->created_at->format('Y-m-d\TH:i:s'),
                'time_ago' => $event->created_at->diffForHumans(),
            ];
        }

        // ── 2. Project workflow events (submitted/resubmitted/approved/rejected/reopened) ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['submitted', 'resubmitted', 'approved', 'rejected', 'reopened'])
            ->get();

        foreach ($projectEvents as $event) {
            $project = $event->project;
            if (!$project) continue;
            $actor = $event->user;
            if (!$actor) continue;

            $isActor = (int) $actor->id === (int) $user->id;
            $isProjectCreator = (int) $project->created_by === (int) $user->id;
            $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
            $isProjectAssignee = in_array((int) $user->id, $assignedUserIds, true);

            if ($isAdminOrManager) {
                if (!$isActor && !$isProjectCreator && !$isProjectAssignee) continue;
            } else {
                if (!$isActor && !$isProjectCreator && !$isProjectAssignee) continue;
            }

            $activities[] = [
                'id' => "project_event_{$event->id}",
                'entity_id' => $project->id,
                'module' => 'project',
                'action' => $event->action,
                'title' => $project->title,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'is_actor' => $isActor,
                'created_at' => $event->created_at->format('Y-m-d\TH:i:s'),
                'time_ago' => $event->created_at->diffForHumans(),
            ];
        }

        // ── 3. Deliverable workflow events (approval / rework) ──
        $dlvEvents = DeliverableWorkflowEvent::with(['deliverable:id,title,created_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('event_type', ['approval', 'rework'])
            ->get();

        foreach ($dlvEvents as $event) {
            $dlv = $event->deliverable;
            if (!$dlv) continue;
            $actor = $event->user;
            if (!$actor) continue;

            $isActor = (int) $actor->id === (int) $user->id;
            $isDlvCreator = (int) $dlv->created_by === (int) $user->id;
            $isDlvAssignee = (int) $dlv->assigned_to === (int) $user->id;

            if ($isAdminOrManager) {
                if (!$isActor && !$isDlvCreator && !$isDlvAssignee) continue;
            } else {
                if (!$isActor && !$isDlvAssignee) continue;
            }

            $activities[] = [
                'id' => "dlv_event_{$event->id}",
                'entity_id' => $dlv->id,
                'module' => 'deliverable',
                'action' => $event->event_type,
                'title' => $dlv->title,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'is_actor' => $isActor,
                'created_at' => $event->created_at->format('Y-m-d\TH:i:s'),
                'time_ago' => $event->created_at->diffForHumans(),
            ];
        }

        // ── 4. Deliverable submissions (DeliverableSubmission — no workflow event for submit) ──
        $dlvSubmissions = DeliverableSubmission::with(['deliverable:id,title,created_by,assigned_to', 'submittedBy:id,name,role'])
            ->whereDate('created_at', $today)
            ->get();

        foreach ($dlvSubmissions as $sub) {
            $dlv = $sub->deliverable;
            if (!$dlv) continue;
            $actor = $sub->submittedBy;
            if (!$actor) continue;

            $isActor = (int) $actor->id === (int) $user->id;
            $isDlvCreator = (int) $dlv->created_by === (int) $user->id;
            $isDlvAssignee = (int) $dlv->assigned_to === (int) $user->id;

            if ($isAdminOrManager) {
                if (!$isActor && !$isDlvCreator && !$isDlvAssignee) continue;
            } else {
                if (!$isActor && !$isDlvAssignee) continue;
            }

            $activities[] = [
                'id' => "dlv_sub_{$sub->id}",
                'entity_id' => $dlv->id,
                'module' => 'deliverable',
                'action' => 'submitted',
                'title' => $dlv->title,
                'actor_name' => $actor->name,
                'actor_role' => $actor->role,
                'is_actor' => $isActor,
                'created_at' => $sub->created_at->format('Y-m-d\TH:i:s'),
                'time_ago' => $sub->created_at->diffForHumans(),
            ];
        }

        // Sort by latest first, limit to 20
        usort($activities, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));

        return array_slice($activities, 0, 20);
    }

    /**
     * Get project IDs accessible to a user.
     * Admin and Manager see all projects.
     * Team Leads and Members see projects they created, team membership, manually visible, or assigned to them.
     */
    private function getUserProjectIds(User $user)
    {
        // Admin and Manager see all projects
        if (in_array($user->role, ['admin', 'manager'])) {
            return Project::pluck('id');
        }

        // Team Leads and Members see restricted projects
        return Project::where(function ($q) use ($user) {
            $q->whereHas('manuallyVisibleTo', fn ($q) => $q->where('user_id', $user->id))
              ->orWhere(function ($q) use ($user) {
                  $q->where(function ($q) use ($user) {
                      $q->where('created_by', $user->id)
                        ->orWhereHas('team.members', fn ($m) => $m->where('users.id', $user->id))
                        ->orWhereHas('team', fn ($t) => $t->where('leader_id', $user->id))
                        ->orWhereJsonContains('assigned_users', (int)$user->id);
                  })->whereDoesntHave('visibility', fn ($q) => $q->where('user_id', $user->id)->where('is_visible', false));
              });
        })->pluck('id');
    }

    private function dashboardTaskQuery(User $user, string $role)
    {
        $query = Task::query();

        if (in_array($role, ['admin', 'manager'])) {
            return $query;
        }

        return $query->where(function ($q) use ($user) {
            $q->where('assigned_by', $user->id)
              ->orWhere('assigned_to', $user->id)
              ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
        });
    }

    private function dashboardProjectAsTaskQuery(User $user, string $role)
    {
        $query = Project::query()
            ->whereNotNull('assigned_users')
            ->whereRaw('JSON_LENGTH(assigned_users) > 0');

        if (in_array($role, ['admin', 'manager'])) {
            return $query;
        }

        return $query->where(function ($q) use ($user) {
            $q->where('created_by', $user->id)
              ->orWhereJsonContains('assigned_users', (int) $user->id);
        });
    }

    private function getTasksDueTodayCount(User $user, string $role): int
    {
        if (in_array($role, ['admin', 'manager'])) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();
            $tasks = Task::with('assignees:id')
                ->whereIn('assigned_by', $adminManagerIds)
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                ->get();

            $taskRows = $tasks->sum(function ($task) {
                if ($task->assignees->isEmpty()) {
                    return (int) $task->assigned_to !== (int) $task->assigned_by ? 1 : 0;
                }

                return $task->assignees
                    ->filter(fn ($assignee) => (int) $assignee->id !== (int) $task->assigned_by)
                    ->count();
            });

            $projects = Project::query()
                ->whereIn('created_by', $adminManagerIds)
                ->whereNotNull('assigned_users')
                ->whereRaw('JSON_LENGTH(assigned_users) > 0')
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                ->get();

            $projectRows = $projects->sum(function ($project) {
                return collect($this->normalizeAssignedUserIds($project->assigned_users))
                    ->filter(fn ($id) => (int) $id !== (int) $project->created_by)
                    ->count();
            });

            return $taskRows + $projectRows;
        }

        return Task::query()
            ->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->where('assigned_by', '!=', $user->id)
            ->whereDate('end_date', today())
            ->whereNotIn('status', $this->dueTodayCompletedStatuses())
            ->count()
            + Project::query()
                ->whereJsonContains('assigned_users', (int) $user->id)
                ->where('created_by', '!=', $user->id)
                ->whereNotNull('assigned_users')
                ->whereRaw('JSON_LENGTH(assigned_users) > 0')
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                ->count();
    }

    private function completedTaskStatuses(): array
    {
        return ['completed', 'done', 'approved'];
    }

    private function inactiveTaskStatuses(): array
    {
        return ['completed', 'done', 'approved', 'abandoned'];
    }

    private function dueTodayCompletedStatuses(): array
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

    private function pendingTaskStatuses(): array
    {
        return ['pending', 'in_progress', 'In Progress', 'Planned', 'submitted', 'reopened'];
    }

    private function normalizeAssignedUserIds($assignedUsers): array
    {
        if (is_string($assignedUsers)) {
            $assignedUsers = json_decode($assignedUsers, true) ?? [];
        }

        if (!is_array($assignedUsers)) {
            return [];
        }

        return array_map('intval', $assignedUsers);
    }

    private function projectAsTaskPayload(Project $project): array
    {
        $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
        $assignedUsers = empty($assignedUserIds)
            ? collect()
            : User::whereIn('id', $assignedUserIds)->select('id', 'name', 'role')->get();

        return array_merge($project->toArray(), [
            'module' => 'project',
            'item_type' => 'project',
            'entity_id' => $project->id,
            'name' => $project->title,
            'assignees' => $assignedUsers->toArray(),
            'assigned_users' => $assignedUsers->toArray(),
            'project' => null,
        ]);
    }
}
