<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Deliverable;
use App\Models\DeliverableSubmission;
use App\Models\DeliverableWorkflowEvent;
use App\Models\Project;
use App\Models\ProjectWorkflowEvent;
use App\Models\Task;
use App\Models\TaskWorkflowEvent;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Controller for the main dashboard.
 * Provides aggregated summary statistics, today's workload, active projects,
 * recent activity feed, upcoming deadlines, and notifications for the authenticated user.
 * Results are cached to reduce database load on repeated requests.
 */
class DashboardController extends Controller
{
    /** @var int Cache time-to-live in seconds (5 minutes). */
    const CACHE_TTL = 300;

    /** @var string Cache key for admin/manager user IDs. */
    const ADMIN_MANAGER_CACHE_KEY = 'admin_manager_ids';

    /**
     * Retrieve the full dashboard data for the authenticated user.
     *
     * Aggregates summary stats, today's workload, active projects,
     * recent activity, upcoming deadlines, today's completed items,
     * and today's notifications into a single cached response.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @return JsonResponse JSON response with dashboard data.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $cacheKey = "dashboard_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user) {
            $role = $user->role;
            $projectIds = $this->getUserProjectIds($user);

            // Single merged pass for activity feed + notifications (cuts ~16 queries to ~8)
            [$completedToday, $todayNotifications] = $this->getTodayActivityFeedAndNotifications($user, $role, $projectIds);

            return [
                'summary' => $this->getCachedSummary($user, $role, $projectIds),
                'todayWorkload' => $this->getCachedTodayWorkload($user, $role),
                'activeProjects' => $this->getCachedActiveProjects($user, $projectIds),
                'recentActivity' => $this->getRecentActivity($user, $role, $projectIds),
                'upcomingDeadlines' => $this->getCachedUpcomingDeadlines($user, $role, $projectIds),
                'completedToday' => $completedToday,
                'todayNotifications' => $todayNotifications,
            ];
        });
    }

    /**
     * Get cached IDs of all admin and manager users.
     *
     * @return array Array of user IDs with admin or manager roles.
     */
    private function getAdminManagerIds(): array
    {
        return Cache::remember(self::ADMIN_MANAGER_CACHE_KEY, 300, fn () => User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray()
        );
    }

    /**
     * Get cached dashboard summary stats for the user.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Summary stats: active_projects, tasks_due_today, completed/approved/pending/total_tasks.
     */
    private function getCachedSummary(User $user, string $role, array $projectIds): array
    {
        $cacheKey = "dashboard_summary_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $role, $projectIds) {
            return $this->computeSummary($user, $role, $projectIds);
        });
    }

    /**
     * Compute dashboard summary stats (not cached).
     *
     * Admin/manager users see stats across all projects/tasks they created.
     * Regular users see stats for their assigned tasks and visible projects.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Summary stats.
     */
    private function computeSummary(User $user, string $role, array $projectIds): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);

        if ($isAdminOrManager) {
            $adminManagerIds = $this->getAdminManagerIds();

            $activeProjects = Project::whereIn('id', $projectIds)
                ->whereNotIn('status', $this->inactiveProjectStatuses())->count();

            $tasksDueToday = Task::whereIn('assigned_by', $adminManagerIds)
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                ->count();

            // Single aggregated query for task stats
            $taskStats = Task::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status IN ('pending','in_progress','In Progress','Planned','submitted','reopened','rejected') THEN 1 ELSE 0 END) as pending
            ")->whereIn('assigned_by', $adminManagerIds)->first();

            return [
                'active_projects' => $activeProjects,
                'tasks_due_today' => $tasksDueToday,
                'completed_tasks' => (int) $taskStats->completed,
                'approved_tasks' => (int) $taskStats->approved,
                'pending_tasks' => (int) $taskStats->pending,
                'total_tasks' => (int) $taskStats->total,
            ];
        }

        $activeProjects = Project::whereIn('id', $projectIds)
            ->whereNotIn('status', $this->inactiveProjectStatuses())
            ->count();

        $tasksDueToday = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->where('assigned_by', '!=', $user->id)
            ->whereDate('end_date', today())
            ->whereNotIn('status', $this->dueTodayCompletedStatuses())
            ->count();

        $taskStats = Task::where(function ($q) use ($user) {
            $q->where('assigned_by', $user->id)
                ->orWhere('assigned_to', $user->id)
                ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
        })->selectRaw("
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status IN ('pending','in_progress','In Progress','Planned','submitted','reopened','rejected') THEN 1 ELSE 0 END) as pending
        ")->first();

        return [
            'active_projects' => $activeProjects,
            'tasks_due_today' => $tasksDueToday,
            'completed_tasks' => (int) $taskStats->completed,
            'approved_tasks' => (int) $taskStats->approved,
            'pending_tasks' => (int) $taskStats->pending,
            'total_tasks' => (int) $taskStats->total,
        ];
    }

    /**
     * Get cached list of tasks due today for the user's workload display.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @return array Array of task objects due today (up to 10).
     */
    private function getCachedTodayWorkload(User $user, string $role): array
    {
        $cacheKey = "dashboard_workload_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $role) {
            $isAdminOrManager = in_array($role, ['admin', 'manager']);
            $limit = 10;

            if ($isAdminOrManager) {
                $adminManagerIds = $this->getAdminManagerIds();
                $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                    ->whereIn('assigned_by', $adminManagerIds)
                    ->where(function ($q) use ($user) {
                        $q->whereDoesntHave('assignees', fn ($q) => $q->where('users.id', $user->id))
                            ->orWhere(function ($q) use ($user) {
                                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                                    ->where('assigned_to', '!=', $user->id);
                            });
                    })
                    ->whereDate('end_date', today())
                    ->whereNotIn('status', $this->inactiveTaskStatuses())
                    ->latest()->limit($limit)->get();
            } else {
                $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                    ->where(function ($q) use ($user) {
                        $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                            ->orWhere('assigned_to', $user->id);
                    })
                    ->whereDate('end_date', today())
                    ->whereNotIn('status', $this->inactiveTaskStatuses())
                    ->latest()->limit($limit)->get();
            }

            return $tasks->map(fn ($task) => array_merge($task->toArray(), [
                'module' => 'task', 'item_type' => 'task', 'entity_id' => $task->id,
            ]))->toArray();
        });
    }

    /**
     * Get cached list of active projects for the dashboard.
     *
     * @param  User  $user  The authenticated user.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Array of project data with progress percentages and team info.
     */
    private function getCachedActiveProjects(User $user, array $projectIds): array
    {
        $cacheKey = "dashboard_active_projects_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $projectIds) {
            return $this->computeActiveProjects($user, $projectIds);
        });
    }

    /**
     * Compute active projects with progress, task counts, and assigned users.
     *
     * @param  User  $user  The authenticated user.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Array of project data with progress percentages and assigned users.
     */
    private function computeActiveProjects(User $user, array $projectIds): array
    {
        $projects = Project::with(['creator:id,name', 'team:id,name'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['approved', 'completed', 'done']);
            }])
            ->whereNotIn('status', $this->inactiveProjectStatuses())
            ->whereIn('id', $projectIds)
            ->latest()
            ->get();

        $allUserIds = [];
        foreach ($projects as $project) {
            $ids = $this->normalizeAssignedUserIds($project->assigned_users);
            foreach ($ids as $id) {
                $allUserIds[$id] = $id;
            }
        }
        $allUsers = ! empty($allUserIds)
            ? User::whereIn('id', $allUserIds)->select('id', 'name')->get()->keyBy('id')
            : collect();

        return $projects->map(function ($project) use ($allUsers) {
            $total = $project->total_tasks ?? 0;
            $done = $project->completed_tasks ?? 0;
            $progress = $total > 0 ? (int) round(($done / $total) * 100) : 0;
            $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
            $assignedUsers = ! empty($assignedUserIds)
                ? collect($assignedUserIds)->map(fn ($id) => $allUsers->get($id))->filter()
                : collect();

            return [
                'id' => $project->id, 'name' => $project->title, 'client' => $project->client_name,
                'progress' => $progress, 'total_tasks' => $total, 'completed_tasks' => $done,
                'deadline' => $project->end_date?->format('M d, Y h:i A'),
                'team' => $project->team?->name,
                'assigned_users' => $assignedUsers->toArray(),
            ];
        })->toArray();
    }

    /**
     * Get the most recent activity feed entries (cached for 60 seconds).
     *
     * Non-admin/manager users only see activities related to their visible projects.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Array of recent activity entries (up to 10).
     */
    private function getRecentActivity(User $user, string $role, array $projectIds): array
    {
        $cacheKey = "dashboard_recent_activity_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($role, $projectIds) {
            $query = Activity::join('users', 'activities.user_id', '=', 'users.id')
                ->where('users.active', true)
                ->select('activities.description as summary', 'activities.created_at', 'users.name as user_name')
                ->latest('activities.created_at')
                ->limit(10);

            if (! in_array($role, ['admin', 'manager'])) {
                $query->whereIn('activities.related_id', $projectIds)
                    ->where('activities.related_module', 'project');
            }

            return $query->get()->toArray();
        });
    }

    /**
     * Get cached list of tasks with upcoming deadlines (within 7 days).
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Array of tasks sorted by end date (up to 10).
     */
    private function getCachedUpcomingDeadlines(User $user, string $role, array $projectIds): array
    {
        $cacheKey = "dashboard_upcoming_deadlines_{$user->id}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $role) {
            $query = Task::with(['project:id,title'])
                ->whereNotIn('status', $this->inactiveTaskStatuses())
                ->where('end_date', '>=', now())
                ->where('end_date', '<=', now()->addDays(7));

            if (in_array($role, ['admin', 'manager'])) {
                $query->whereIn('assigned_by', $this->getAdminManagerIds());
            } else {
                $query->where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                        ->orWhere('assigned_to', $user->id);
                });
            }

            return $query->limit(10)->get()->map(fn ($task) => [
                'id' => $task->id, 'entity_id' => $task->id, 'module' => 'task',
                'title' => $task->title, 'project' => $task->project?->title,
                'end_date' => $task->end_date?->format('M d, Y h:i A'),
                'sort_date' => $task->end_date,
            ])->sortBy('sort_date')->values()->map(function ($item) {
                unset($item['sort_date']);

                return $item;
            })->toArray();
        });
    }

    // ──────────────────────────────────────────────────────────────────
    // SINGLE MERGED PASS for Today's Activity Feed + Notifications
    // Loads all workflow events ONCE and splits into my-activity / notifications
    // ──────────────────────────────────────────────────────────────────

    /**
     * Retrieve past activity feed (all days before today) for the authenticated user.
     *
     * Queries the same four tables as today's feed (TaskWorkflowEvent, ProjectWorkflowEvent,
     * DeliverableWorkflowEvent, Activity) but for all dates strictly before today.
     * Only activities where the current user is the actor are included.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @param  int  $limit  Maximum total number of activities to return.
     * @return array Activities grouped by date (Y-m-d), sorted descending by date then time.
     */
    public function getPastActivityFeed(User $user, string $role, array $projectIds, int $limit = 100): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $yesterday = today()->subDay();
        $activities = [];

        $myTaskIds = DB::table('task_user')->where('user_id', $user->id)->pluck('task_id')->toArray();

        // ── TASKS (past) ──
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->latest()
            ->limit($limit)->get();

        $taskIdsNeedingSub = $taskEvents->filter(fn ($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('task.id')->filter()->unique()->toArray();
        $taskSubmitters = $this->loadTaskSubmitters($taskIdsNeedingSub);

        foreach ($taskEvents as $event) {
            $task = $event->task;
            if (! $task || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $isRelated = $this->isUserRelatedToTask($user, $task, $myTaskIds, $isAdminOrManager);
            if (! $isRelated) {
                continue;
            }
            $activities[] = $this->formatActivity('task', $event->id, $task->id, $task->title, $event->action, $event->user, true, $taskSubmitters[$task->id] ?? null, $event->comment ?? null, $event->created_at);
        }

        // ── PROJECTS (past) ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->latest()
            ->limit($limit)->get();

        $projectIdsNeedingSub = $projectEvents->filter(fn ($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('project.id')->filter()->unique()->toArray();
        $projectSubmitters = $this->loadProjectSubmitters($projectIdsNeedingSub);

        foreach ($projectEvents as $event) {
            $project = $event->project;
            if (! $project || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $isRelated = $this->isUserRelatedToProject($user, $project, $isAdminOrManager);
            if (! $isRelated) {
                continue;
            }
            $activities[] = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, true, $projectSubmitters[$project->id] ?? null, $event->comment ?? null, $event->created_at);
        }

        // ── DELIVERABLES (past) ──
        $dlvEvents = DeliverableWorkflowEvent::with(['deliverable:id,title,created_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('event_type', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'status_updated', 'field_changed', 'approval', 'rework'])
            ->latest()
            ->limit($limit)->get();

        $dlvIdsNeedingSub = $dlvEvents->pluck('deliverable.id')->filter()->unique()->toArray();
        $dlvSubmitters = $this->loadDeliverableSubmitters($dlvIdsNeedingSub);

        foreach ($dlvEvents as $event) {
            $dlv = $event->deliverable;
            if (! $dlv || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $isRelated = $this->isUserRelatedToDeliverable($user, $dlv);
            if (! $isRelated) {
                continue;
            }
            $action = $event->event_type === 'approval' ? 'approved' : $event->event_type;
            $activities[] = $this->formatActivity('deliverable', $event->id, $dlv->id, $dlv->title, $action, $event->user, true, $dlvSubmitters[$dlv->id] ?? null, $event->comment ?? null, $event->created_at);
        }

        // ── USER MANAGEMENT (past, from activities table) ──
        $userActivities = Activity::with('user:id,name,role')
            ->where('related_module', 'user')
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'updated', 'resigned'])
            ->latest()
            ->limit($limit)->get();

        foreach ($userActivities as $activity) {
            if (! $activity->user) {
                continue;
            }
            $isActor = (int) $activity->user_id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $activities[] = [
                'id' => "user_activity_{$activity->id}",
                'entity_id' => $activity->related_id,
                'module' => 'user',
                'action' => $activity->action,
                'title' => $activity->entity_name ?? 'User',
                'actor_name' => $activity->user->name,
                'actor_role' => $activity->user->role,
                'is_actor' => true,
                'comment' => null,
                'created_at' => $activity->created_at->toIso8601ZuluString(),
            ];
        }

        // ── TEAM MANAGEMENT (past, from activities table) ──
        $teamActivities = Activity::with('user:id,name,role')
            ->where('related_module', 'team')
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'updated', 'deleted', 'leader_changed', 'member_added', 'member_removed'])
            ->latest()
            ->limit($limit)->get();

        foreach ($teamActivities as $activity) {
            if (! $activity->user) {
                continue;
            }
            $isActor = (int) $activity->user_id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $activities[] = [
                'id' => "team_activity_{$activity->id}",
                'entity_id' => $activity->related_id,
                'module' => 'team',
                'action' => $activity->action,
                'title' => $activity->entity_name ?? 'Team',
                'actor_name' => $activity->user->name,
                'actor_role' => $activity->user->role,
                'is_actor' => true,
                'comment' => null,
                'description' => $activity->description,
                'created_at' => $activity->created_at->toIso8601ZuluString(),
            ];
        }

        // ── DELIVERABLE SUBMISSIONS (past) ──
        $dlvSubmissions = DeliverableSubmission::with(['deliverable:id,title,created_by,assigned_to', 'submittedBy:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)->latest()->limit($limit)->get();

        foreach ($dlvSubmissions as $sub) {
            $dlv = $sub->deliverable;
            if (! $dlv || ! $sub->submittedBy) {
                continue;
            }
            $isActor = (int) $sub->submittedBy->id === (int) $user->id;
            if (! $isActor) {
                continue;
            }
            $isRelated = $this->isUserRelatedToDeliverable($user, $dlv);
            if (! $isRelated) {
                continue;
            }
            $activities[] = $this->formatActivity('deliverable', "sub_{$sub->id}", $dlv->id, $dlv->title, 'submitted', $sub->submittedBy, true, null, null, $sub->created_at);
        }

        // Sort all activities newest-first
        usort($activities, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        $activities = array_slice($activities, 0, $limit);

        // Group by date (Y-m-d), descending
        $grouped = [];
        foreach ($activities as $item) {
            $dateKey = Carbon::parse($item['created_at'])->format('Y-m-d');
            $grouped[$dateKey][] = $item;
        }
        krsort($grouped);

        // Format as [{date, label, activities: [...]}]
        $result = [];
        foreach ($grouped as $date => $items) {
            $result[] = [
                'date' => $date,
                'label' => Carbon::parse($date)->format('d M Y'),
                'activities' => $items,
            ];
        }

        return $result;
    }

    /**
     * Load today's activity feed and notifications in a single merged pass.
     *
     * Loads all workflow events (tasks, projects, deliverables) once and splits them
     * into user-activity items and notification items based on whether the user is the actor.
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Two-element array: [activities[], notifications[]], each limited to 20 items.
     */
    private function getTodayActivityFeedAndNotifications(User $user, string $role, array $projectIds): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $today = today();
        $activities = [];
        $notifications = [];

        $myTaskIds = DB::table('task_user')->where('user_id', $user->id)->pluck('task_id')->toArray();

        // ── TASKS ──
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->limit(50)->get();

        $taskIdsNeedingSub = $taskEvents->filter(fn ($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('task.id')->filter()->unique()->toArray();
        $taskSubmitters = $this->loadTaskSubmitters($taskIdsNeedingSub);

        foreach ($taskEvents as $event) {
            $task = $event->task;
            if (! $task || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToTask($user, $task, $myTaskIds, $isAdminOrManager);
            if (! $isRelated) {
                continue;
            }
            $item = $this->formatActivity('task', $event->id, $task->id, $task->title, $event->action, $event->user, $isActor, $taskSubmitters[$task->id] ?? null, $event->comment ?? null, $event->created_at);
            if ($isActor) {
                $activities[] = $item;
            } else {
                $notifications[] = $item;
            }
        }

        // ── PROJECTS ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->limit(50)->get();

        $projectIdsNeedingSub = $projectEvents->filter(fn ($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('project.id')->filter()->unique()->toArray();
        $projectSubmitters = $this->loadProjectSubmitters($projectIdsNeedingSub);

        foreach ($projectEvents as $event) {
            $project = $event->project;
            if (! $project || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToProject($user, $project, $isAdminOrManager);
            if (! $isRelated) {
                continue;
            }
            $item = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, $isActor, $projectSubmitters[$project->id] ?? null, $event->comment ?? null, $event->created_at);
            if ($isActor) {
                $activities[] = $item;
            } else {
                $notifications[] = $item;
            }
        }

        // ── DELIVERABLES ──
        $dlvEvents = DeliverableWorkflowEvent::with(['deliverable:id,title,created_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('event_type', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'status_updated', 'field_changed', 'approval', 'rework'])
            ->limit(50)->get();

        $dlvIdsNeedingSub = $dlvEvents->pluck('deliverable.id')->filter()->unique()->toArray();
        $dlvSubmitters = $this->loadDeliverableSubmitters($dlvIdsNeedingSub);

        foreach ($dlvEvents as $event) {
            $dlv = $event->deliverable;
            if (! $dlv || ! $event->user) {
                continue;
            }
            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToDeliverable($user, $dlv);
            if (! $isRelated) {
                continue;
            }
            $action = $event->event_type === 'approval' ? 'approved' : $event->event_type;
            $item = $this->formatActivity('deliverable', $event->id, $dlv->id, $dlv->title, $action, $event->user, $isActor, $dlvSubmitters[$dlv->id] ?? null, $event->comment ?? null, $event->created_at);
            if ($isActor) {
                $activities[] = $item;
            } else {
                $notifications[] = $item;
            }
        }

        // ── USER MANAGEMENT (from activities table) ──
        $userActivities = Activity::with('user:id,name,role')
            ->where('related_module', 'user')
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'updated', 'resigned'])
            ->limit(50)->get();

        foreach ($userActivities as $activity) {
            if (! $activity->user) {
                continue;
            }
            $isActor = (int) $activity->user_id === (int) $user->id;
            $item = [
                'id' => "user_activity_{$activity->id}",
                'entity_id' => $activity->related_id,
                'module' => 'user',
                'action' => $activity->action,
                'title' => $activity->entity_name ?? 'User',
                'actor_name' => $activity->user->name,
                'actor_role' => $activity->user->role,
                'is_actor' => $isActor,
                'comment' => null,
                'created_at' => $activity->created_at->toIso8601ZuluString(),
            ];
            if ($isActor) {
                $activities[] = $item;
            }
        }

        // ── TEAM MANAGEMENT (from activities table) ──
        $teamActivities = Activity::with('user:id,name,role')
            ->where('related_module', 'team')
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'updated', 'deleted', 'leader_changed', 'member_added', 'member_removed'])
            ->limit(50)->get();

        foreach ($teamActivities as $activity) {
            if (! $activity->user) {
                continue;
            }
            $isActor = (int) $activity->user_id === (int) $user->id;
            $item = [
                'id' => "team_activity_{$activity->id}",
                'entity_id' => $activity->related_id,
                'module' => 'team',
                'action' => $activity->action,
                'title' => $activity->entity_name ?? 'Team',
                'actor_name' => $activity->user->name,
                'actor_role' => $activity->user->role,
                'is_actor' => $isActor,
                'comment' => null,
                'description' => $activity->description,
                'created_at' => $activity->created_at->toIso8601ZuluString(),
            ];
            if ($isActor) {
                $activities[] = $item;
            }
        }

        // ── DELIVERABLE SUBMISSIONS ──
        $dlvSubmissions = DeliverableSubmission::with(['deliverable:id,title,created_by,assigned_to', 'submittedBy:id,name,role'])
            ->whereDate('created_at', $today)->limit(50)->get();
        foreach ($dlvSubmissions as $sub) {
            $dlv = $sub->deliverable;
            if (! $dlv || ! $sub->submittedBy) {
                continue;
            }
            $isActor = (int) $sub->submittedBy->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToDeliverable($user, $dlv);
            if (! $isRelated) {
                continue;
            }
            $item = $this->formatActivity('deliverable', "sub_{$sub->id}", $dlv->id, $dlv->title, 'submitted', $sub->submittedBy, $isActor, null, null, $sub->created_at);
            if ($isActor) {
                $activities[] = $item;
            } else {
                $notifications[] = $item;
            }
        }

        usort($activities, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        usort($notifications, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));

        return [array_slice($activities, 0, 20), array_slice($notifications, 0, 20)];
    }

    /**
     * Load the latest submitter for each task ID from workflow events.
     *
     * @param  array  $taskIds  Array of task IDs to look up submitters for.
     * @return array Associative array of task_id => User model of the latest submitter.
     */
    private function loadTaskSubmitters(array $taskIds): array
    {
        if (empty($taskIds)) {
            return [];
        }
        $subEvents = TaskWorkflowEvent::whereIn('task_id', $taskIds)
            ->where('action', 'submitted')->with('user:id,name,role')
            ->select('task_id', 'user_id')->get()->groupBy('task_id');
        $submitters = [];
        foreach ($subEvents as $tid => $events) {
            $latest = $events->sortByDesc('id')->first();
            if ($latest && $latest->user) {
                $submitters[$tid] = $latest->user;
            }
        }

        return $submitters;
    }

    /**
     * Load the latest submitter for each project ID from workflow events.
     *
     * @param  array  $projectIds  Array of project IDs to look up submitters for.
     * @return array Associative array of project_id => User model of the latest submitter.
     */
    private function loadProjectSubmitters(array $projectIds): array
    {
        if (empty($projectIds)) {
            return [];
        }
        $subEvents = ProjectWorkflowEvent::whereIn('project_id', $projectIds)
            ->where('action', 'submitted')->with('user:id,name,role')
            ->select('project_id', 'user_id')->get()->groupBy('project_id');
        $submitters = [];
        foreach ($subEvents as $pid => $events) {
            $latest = $events->sortByDesc('id')->first();
            if ($latest && $latest->user) {
                $submitters[$pid] = $latest->user;
            }
        }

        return $submitters;
    }

    /**
     * Load the latest submitter for each deliverable ID from submission records.
     *
     * @param  array  $dlvIds  Array of deliverable IDs to look up submitters for.
     * @return array Associative array of deliverable_id => User model of the latest submitter.
     */
    private function loadDeliverableSubmitters(array $dlvIds): array
    {
        if (empty($dlvIds)) {
            return [];
        }
        $subs = DeliverableSubmission::whereIn('deliverable_id', $dlvIds)
            ->with('submittedBy:id,name,role')->select('deliverable_id', 'submitted_by')
            ->get()->groupBy('deliverable_id');
        $submitters = [];
        foreach ($subs as $did => $items) {
            $latest = $items->sortByDesc('id')->first();
            if ($latest && $latest->submittedBy) {
                $submitters[$did] = $latest->submittedBy;
            }
        }

        return $submitters;
    }

    // ──────────────────────────────────────────────────────────────────
    // USER-RELATION HELPERS
    // ──────────────────────────────────────────────────────────────────

    /**
     * Check if a user is related to a task (assignee, assigner, or admin/manager).
     *
     * @param  User  $user  The user to check.
     * @param  object  $task  The task to check relation for.
     * @param  array  $myTaskIds  Array of task IDs the user is assigned to.
     * @param  bool  $isAdminOrManager  Whether the user has admin/manager role.
     * @return bool True if the user is related to the task.
     */
    private function isUserRelatedToTask(User $user, $task, array $myTaskIds, bool $isAdminOrManager): bool
    {
        // Assignee via pivot
        if (in_array($task->id, $myTaskIds)) {
            return true;
        }
        // Assignee via assigned_to column
        if ((int) ($task->assigned_to ?? 0) === (int) $user->id) {
            return true;
        }
        // Assigner
        if ((int) ($task->assigned_by ?? 0) === (int) $user->id) {
            return true;
        }
        // Admin/Manager see all
        if ($isAdminOrManager) {
            return true;
        }

        return false;
    }

    /**
     * Check if a user is related to a project (creator, assigned, or admin/manager).
     *
     * @param  User  $user  The user to check.
     * @param  object  $project  The project to check relation for.
     * @param  bool  $isAdminOrManager  Whether the user has admin/manager role.
     * @return bool True if the user is related to the project.
     */
    private function isUserRelatedToProject(User $user, $project, bool $isAdminOrManager): bool
    {
        // Creator
        if ((int) ($project->created_by ?? 0) === (int) $user->id) {
            return true;
        }
        // Assigned user in JSON
        $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
        if (in_array((int) $user->id, $assignedUserIds, true)) {
            return true;
        }
        // Admin/Manager see all
        if ($isAdminOrManager) {
            return true;
        }

        return false;
    }

    /**
     * Check if a user is related to a deliverable (assignee or creator).
     *
     * @param  User  $user  The user to check.
     * @param  object  $dlv  The deliverable to check relation for.
     * @return bool True if the user is related to the deliverable.
     */
    private function isUserRelatedToDeliverable(User $user, $dlv): bool
    {
        // Assignee
        if ((int) ($dlv->assigned_to ?? 0) === (int) $user->id) {
            return true;
        }
        // Creator
        if ((int) ($dlv->created_by ?? 0) === (int) $user->id) {
            return true;
        }

        return false;
    }

    // ──────────────────────────────────────────────────────────────────
    // FORMAT + UTILITIES
    // ──────────────────────────────────────────────────────────────────

    /**
     * Format an activity/notification item into a standardized array structure.
     *
     * @param  string  $module  The module type (task, project, deliverable).
     * @param  mixed  $eventId  The workflow event ID.
     * @param  int  $entityId  The entity ID (task, project, or deliverable).
     * @param  string  $title  The entity title.
     * @param  string  $action  The action performed (created, submitted, approved, etc.).
     * @param  object  $actor  The user who performed the action.
     * @param  bool  $isActor  Whether the current user is the actor.
     * @param  object|null  $submitter  The user who submitted the entity (for approve/reject actions).
     * @param  string|null  $comment  Optional comment on the event.
     * @param  mixed  $createdAt  The timestamp of the event.
     * @return array Formatted activity item.
     */
    private function formatActivity(string $module, $eventId, int $entityId, string $title, string $action, $actor, bool $isActor, $submitter = null, ?string $comment = null, $createdAt = null): array
    {
        $result = [
            'id' => "{$module}_event_{$eventId}",
            'entity_id' => $entityId,
            'module' => $module,
            'action' => $action,
            'title' => $title,
            'actor_name' => $actor->name,
            'actor_role' => $actor->role,
            'is_actor' => $isActor,
            'comment' => $comment,
            'created_at' => $createdAt ? $createdAt instanceof Carbon ? $createdAt->toIso8601ZuluString() : $createdAt : now()->toIso8601ZuluString(),
        ];

        if ($submitter) {
            $result['submitted_by_name'] = $submitter->name;
            $result['submitted_by_role'] = $submitter->role;
        }

        return $result;
    }

    /**
     * Get all project IDs visible to the authenticated user.
     *
     * Admin/manager users see all projects. Other users see projects they created,
     * are team members/leaders of, are assigned to, or have manual visibility access.
     *
     * @param  User  $user  The authenticated user.
     * @return array Array of visible project IDs.
     */
    public function getUserProjectIds(User $user): array
    {
        $cacheKey = "user_project_ids_{$user->id}";
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user) {
            if (in_array($user->role, ['admin', 'manager'])) {
                return Project::pluck('id')->toArray();
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
            })->pluck('id')->toArray();
        });
    }

    /**
     * Get the list of statuses considered as inactive for tasks.
     *
     * @return array Array of inactive task status strings.
     */
    private function inactiveTaskStatuses(): array
    {
        return ['completed', 'done', 'approved', 'abandoned'];
    }

    /**
     * Get the list of statuses that mean a task due today is already completed.
     *
     * @return array Array of completed status strings.
     */
    private function dueTodayCompletedStatuses(): array
    {
        return ['approved', 'completed', 'done'];
    }

    /**
     * Get the list of statuses considered as inactive for projects.
     *
     * @return array Array of inactive project status strings.
     */
    private function inactiveProjectStatuses(): array
    {
        return ['completed', 'Completed', 'done', 'Done', 'approved', 'Approved', 'rejected', 'Rejected', 'cancelled', 'Cancelled', 'canceled', 'Canceled', 'abandoned', 'Abandoned', 'closed', 'Closed', 'archived', 'Archived'];
    }

    /**
     * Normalize assigned_users value to an array of integer IDs.
     *
     * Handles both JSON string and array inputs.
     *
     * @param  mixed  $assignedUsers  The assigned_users value (string, array, or null).
     * @return array Array of integer user IDs.
     */
    private function normalizeAssignedUserIds($assignedUsers): array
    {
        if (is_string($assignedUsers)) {
            $assignedUsers = json_decode($assignedUsers, true) ?? [];
        }
        if (! is_array($assignedUsers)) {
            return [];
        }

        return array_map('intval', $assignedUsers);
    }
}
