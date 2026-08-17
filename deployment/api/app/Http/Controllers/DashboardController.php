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
        $mode = $request->query('mode', in_array($user->role, ['admin', 'manager']) ? 'user' : 'my');
        $cacheKey = "dashboard_{$user->id}_{$mode}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $mode) {
            $role = $user->role;
            $projectIds = $this->getUserProjectIds($user);

            // Single merged pass for activity feed + notifications (cuts ~16 queries to ~8)
            [$completedToday, $todayNotifications] = $this->getTodayActivityFeedAndNotifications($user, $role, $projectIds);

            return [
                'summary' => $this->computeSummary($user, $role, $projectIds, $mode),
                'todayWorkload' => $this->getTodayWorkload($user, $role, $mode),
                'activeProjects' => $this->computeActiveProjects($user, $projectIds),
                'recentActivity' => $this->getRecentActivity($user, $role, $projectIds),
                'upcomingDeadlines' => $this->getUpcomingDeadlines($user, $role, $projectIds),
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
    private function computeSummary(User $user, string $role, array $projectIds, string $mode = 'user'): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $isAssignerView = ($mode === 'user'); // user mode = assigner (tasks assigned BY), my mode = assignee (tasks assigned TO)

        if ($isAssignerView) {
            // ═══════════════════════════════════════════════
            // ASSIGNER VIEW — tasks assigned BY this user
            // ═══════════════════════════════════════════════

            if ($isAdminOrManager) {
                $pendingStatuses = ['pending','in_progress','In Progress','In-progress','planned','Planning','submitted','reopened','rejected'];
                $onlyPendingStatuses = ['pending','planned','Planning'];

                $activeProjects = Project::whereIn('id', $projectIds)
                    ->whereIn('status', ['Planning', 'In-progress', 'Paused'])->count();

                $tasksDueToday = DB::table('tasks')
                    ->join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->where('tasks.assigned_by', $user->id)
                    ->whereColumn('task_user.user_id', '!=', 'tasks.assigned_by')
                    ->whereRaw('DATE(COALESCE(task_user.due_date, tasks.end_date)) = ?', [today()->toDateString()])
                    ->whereNotIn('tasks.status', $this->dueTodayCompletedStatuses())
                    ->count('tasks.id');

                $tasksDueToday += Task::where('assigned_by', $user->id)
                    ->where('assigned_to', '!=', DB::raw('assigned_by'))
                    ->whereNotIn('id', function ($q) {
                        $q->select('task_id')->from('task_user');
                    })
                    ->whereDate('end_date', today())
                    ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                    ->count();

                $taskStats = DB::table('tasks')
                    ->join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->where('tasks.assigned_by', $user->id)
                    ->whereColumn('task_user.user_id', '!=', 'tasks.assigned_by')
                    ->selectRaw("
                        COUNT(*) as total,
                        SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN tasks.status = 'approved' THEN 1 ELSE 0 END) as approved,
                        SUM(CASE WHEN tasks.status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
                    ")->first();

                $taskAssignedToCount = Task::where('assigned_by', $user->id)
                    ->where('assigned_to', '!=', DB::raw('assigned_by'))
                    ->whereNotIn('id', function ($q) {
                        $q->select('task_id')->from('task_user');
                    })
                    ->selectRaw("
                        COUNT(*) as total,
                        SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN tasks.status = 'approved' THEN 1 ELSE 0 END) as approved,
                        SUM(CASE WHEN tasks.status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
                    ")->first();

                $expandedTaskTotal = (int) $taskStats->total + (int) $taskAssignedToCount->total;
                $expandedTaskCompleted = (int) $taskStats->completed + (int) $taskAssignedToCount->completed;
                $expandedTaskApproved = (int) $taskStats->approved + (int) $taskAssignedToCount->approved;
                $expandedTaskPending = (int) $taskStats->pending + (int) $taskAssignedToCount->pending;

                return [
                    'active_projects' => $activeProjects,
                    'tasks_due_today' => $tasksDueToday,
                    'completed_tasks' => $expandedTaskCompleted,
                    'approved_tasks' => $expandedTaskApproved,
                    'pending_tasks' => $expandedTaskPending,
                    'total_tasks' => $expandedTaskTotal,
                ];
            } else {
                // Regular user assigner view — tasks they assigned to others
                $pendingStatuses = ['pending','in_progress','In Progress','In-progress','planned','Planning','submitted','reopened','rejected'];
                $onlyPendingStatuses = ['pending','planned','Planning'];

                $activeProjects = Project::where('created_by', $user->id)
                    ->whereIn('status', ['Planning', 'In-progress', 'Paused'])->count();

                $tasksDueToday = DB::table('tasks')
                    ->join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->where('tasks.assigned_by', $user->id)
                    ->whereColumn('task_user.user_id', '!=', 'tasks.assigned_by')
                    ->whereRaw('DATE(COALESCE(task_user.due_date, tasks.end_date)) = ?', [today()->toDateString()])
                    ->whereNotIn('tasks.status', $this->dueTodayCompletedStatuses())
                    ->count('tasks.id');

                $tasksDueToday += Task::where('assigned_by', $user->id)
                    ->where('assigned_to', '!=', DB::raw('assigned_by'))
                    ->whereNotIn('id', function ($q) {
                        $q->select('task_id')->from('task_user');
                    })
                    ->whereDate('end_date', today())
                    ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                    ->count();

                $taskStats = DB::table('tasks')
                    ->join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->where('tasks.assigned_by', $user->id)
                    ->whereColumn('task_user.user_id', '!=', 'tasks.assigned_by')
                    ->selectRaw("
                        COUNT(*) as total,
                        SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN tasks.status = 'approved' THEN 1 ELSE 0 END) as approved,
                        SUM(CASE WHEN tasks.status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
                    ")->first();

                $taskAssignedToCount = Task::where('assigned_by', $user->id)
                    ->where('assigned_to', '!=', DB::raw('assigned_by'))
                    ->whereNotIn('id', function ($q) {
                        $q->select('task_id')->from('task_user');
                    })
                    ->selectRaw("
                        COUNT(*) as total,
                        SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN tasks.status = 'approved' THEN 1 ELSE 0 END) as approved,
                        SUM(CASE WHEN tasks.status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
                    ")->first();

                $expandedTaskTotal = (int) $taskStats->total + (int) $taskAssignedToCount->total;
                $expandedTaskCompleted = (int) $taskStats->completed + (int) $taskAssignedToCount->completed;
                $expandedTaskApproved = (int) $taskStats->approved + (int) $taskAssignedToCount->approved;
                $expandedTaskPending = (int) $taskStats->pending + (int) $taskAssignedToCount->pending;

                return [
                    'active_projects' => $activeProjects,
                    'tasks_due_today' => $tasksDueToday,
                    'completed_tasks' => $expandedTaskCompleted,
                    'approved_tasks' => $expandedTaskApproved,
                    'pending_tasks' => $expandedTaskPending,
                    'total_tasks' => $expandedTaskTotal,
                ];
            }
        }

        // ═══════════════════════════════════════════════
        // ASSIGNEE VIEW — tasks assigned TO this user
        // ═══════════════════════════════════════════════

        if ($isAdminOrManager) {
            // Admin/Manager assignee view — tasks assigned to them by others
            $pendingStatuses = ['pending','in_progress','In Progress','In-progress','planned','Planning','submitted','reopened','rejected'];
            $onlyPendingStatuses = ['pending','planned','Planning'];

            $activeProjects = Project::whereIn('id', $projectIds)
                ->whereIn('status', ['Planning', 'In-progress', 'Paused'])->count();

            $tasksDueToday = Task::where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                      ->orWhere('assigned_to', $user->id);
                })
                ->where('assigned_by', '!=', $user->id)
                ->whereRaw('DATE(COALESCE((SELECT pu.due_date FROM task_user pu WHERE pu.task_id = tasks.id AND pu.user_id = ? LIMIT 1), tasks.end_date)) = ?', [$user->id, today()->toDateString()])
                ->whereNotIn('status', $this->dueTodayCompletedStatuses())
                ->count();

            $taskStats = Task::where(function ($q) use ($user) {
                    $q->where('assigned_to', $user->id)
                      ->orWhereHas('assignees', fn ($q) => $q->where('users.id', $user->id));
                })
                ->where('assigned_by', '!=', $user->id)
                ->selectRaw("
                    COUNT(*) as total,
                    SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
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

        // Regular user assignee view (existing behavior)
        $activeProjects = Project::whereIn('id', $projectIds)
            ->whereIn('status', ['Planning', 'In-progress', 'Paused'])
            ->count();

        $tasksDueToday = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->where('assigned_by', '!=', $user->id)
            ->whereRaw('DATE(COALESCE((SELECT pu.due_date FROM task_user pu WHERE pu.task_id = tasks.id AND pu.user_id = ? LIMIT 1), tasks.end_date)) = ?', [$user->id, today()->toDateString()])
            ->whereNotIn('status', $this->dueTodayCompletedStatuses())
            ->count();

        $onlyPendingStatuses = ['pending','planned','Planning'];

        $taskStats = Task::where(function ($q) use ($user) {
            $q->where('assigned_by', $user->id)
                ->orWhere('assigned_to', $user->id)
                ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
        })->selectRaw("
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status IN ('".implode("','", $onlyPendingStatuses)."') THEN 1 ELSE 0 END) as pending
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
    private function getTodayWorkload(User $user, string $role, string $mode = 'user'): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $isAssignerView = ($mode === 'user');
        $limit = 10;

        if ($isAssignerView) {
            // ── ASSIGNER VIEW: tasks assigned BY this user ──
            if ($isAdminOrManager) {
                $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                    ->where('assigned_by', $user->id)
                    ->where(function ($q) use ($user) {
                        $q->whereDoesntHave('assignees', fn ($q) => $q->where('users.id', $user->id))
                            ->orWhere(function ($q) use ($user) {
                                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                                    ->where('assigned_to', '!=', $user->id);
                            });
                    })
                    ->where(function ($q) {
                        $q->whereDate('end_date', today())
                            ->orWhereHas('assignees', fn ($q) => $q->whereDate('task_user.due_date', today()));
                    })
                    ->whereNotIn('status', $this->inactiveTaskStatuses())
                    ->latest()->limit($limit)->get();
            } else {
                // Regular user — tasks they assigned to others
                $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                    ->where('assigned_by', $user->id)
                    ->where(function ($q) use ($user) {
                        $q->whereDoesntHave('assignees', fn ($q) => $q->where('users.id', $user->id))
                            ->orWhere(function ($q) use ($user) {
                                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                                    ->where('assigned_to', '!=', $user->id);
                            });
                    })
                    ->where(function ($q) {
                        $q->whereDate('end_date', today())
                            ->orWhereHas('assignees', fn ($q) => $q->whereDate('task_user.due_date', today()));
                    })
                    ->whereNotIn('status', $this->inactiveTaskStatuses())
                    ->latest()->limit($limit)->get();
            }

            return $tasks->map(function ($task) {
                $perUserDueDate = $task->assignees->pluck('pivot.due_date')->filter()->sortBy('asc')->first();
                return array_merge($task->toArray(), [
                    'module' => 'task', 'item_type' => 'task', 'entity_id' => $task->id,
                    'end_date' => $perUserDueDate ?? $task->end_date,
                ]);
            })->toArray();
        }

        // ── ASSIGNEE VIEW: tasks assigned TO this user ──
        $tasks = Task::with(['project:id,title', 'assignees:id,name,role', 'assigner:id,name,role'])
            ->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                    ->orWhere('assigned_to', $user->id);
            })
            ->where(function ($q) use ($user) {
                $q->whereDate('end_date', today())
                    ->orWhereHas('assignees', function ($q) use ($user) {
                        $q->where('users.id', $user->id)
                            ->whereDate('task_user.due_date', today());
                    });
            })
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->latest()->limit($limit)->get();

        // Add self-tasks due today
        $selfTasks = Task::with(['project:id,title', 'assignees:id,name,role', 'assigner:id,name,role'])
            ->where('assigned_by', $user->id)
            ->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                    ->orWhere('assigned_to', $user->id);
            })
            ->where(function ($q) {
                $q->whereDate('end_date', today())
                    ->orWhereHas('assignees', fn ($q) => $q->whereDate('task_user.due_date', today()));
            })
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->latest()->limit($limit)->get();

        $tasks = $tasks->merge($selfTasks)->take($limit);

        return $tasks->map(function ($task) {
            $perUserDueDate = $task->assignees->pluck('pivot.due_date')->filter()->sortBy('asc')->first();
            return array_merge($task->toArray(), [
                'module' => 'task', 'item_type' => 'task', 'entity_id' => $task->id,
                'end_date' => $perUserDueDate ?? $task->end_date,
            ]);
        })->toArray();
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
        $activeStatuses = ['Planning', 'In-progress', 'Paused'];
        $projects = Project::with(['creator:id,name', 'team:id,name'])
            ->withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['approved', 'completed', 'done']);
            }])
            ->whereIn('status', $activeStatuses)
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
                'status' => $project->status,
                'progress' => $progress, 'total_tasks' => $total, 'completed_tasks' => $done,
                'start_date' => $project->start_date?->format('Y-m-d'),
                'end_date' => $project->end_date?->format('Y-m-d'),
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
     * Get tasks with upcoming deadlines (within 7 days).
     *
     * @param  User  $user  The authenticated user.
     * @param  string  $role  The user's role.
     * @param  array  $projectIds  IDs of projects visible to the user.
     * @return array Array of tasks sorted by end date (up to 10).
     */
    private function getUpcomingDeadlines(User $user, string $role, array $projectIds): array
    {
        $query = Task::with(['project:id,title', 'assignees'])
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->where(function ($q) {
                $q->whereBetween('end_date', [now(), now()->addDays(7)])
                    ->orWhereHas('assignees', fn ($q) => $q->whereBetween('task_user.due_date', [now(), now()->addDays(7)]));
            });

        if (in_array($role, ['admin', 'manager'])) {
            $query->where('assigned_by', $user->id);
        } else {
            $query->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                    ->orWhere('assigned_to', $user->id);
            });
        }

        return $query->limit(10)->get()->map(function ($task) use ($user) {
            $perUserDate = $task->assignees->firstWhere('id', $user->id)?->pivot?->due_date;
            $displayDate = $perUserDate ?? $task->end_date;
            return [
                'id' => $task->id, 'entity_id' => $task->id, 'module' => 'task',
                'title' => $task->title, 'project' => $task->project?->title,
                'end_date' => $displayDate
                    ? (\Carbon\Carbon::parse($displayDate))->format('M d, Y h:i A') : null,
                'sort_date' => $displayDate,
            ];
        })->sortBy('sort_date')->values()->map(function ($item) {
            unset($item['sort_date']);
            return $item;
        })->toArray();
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
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'task.assignees:id', 'user:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->latest()
            ->limit($limit)->get();

        // Filter out field_changed events for tasks that have a 'created' event
        $taskIdsWithCreatedEvent = $taskEvents
            ->filter(fn ($e) => $e->action === 'created' && $e->task)
            ->pluck('task.id')
            ->filter()
            ->unique()
            ->toArray();
        $taskEvents = $taskEvents->filter(function ($e) use ($taskIdsWithCreatedEvent) {
            if ($e->action === 'field_changed' && $e->task && in_array($e->task->id, $taskIdsWithCreatedEvent)) {
                return false;
            }
            return true;
        });

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
            $item = $this->formatActivity('task', $event->id, $task->id, $task->title, $event->action, $event->user, true, $taskSubmitters[$task->id] ?? null, $event->comment ?? null, $event->created_at);
            $item['assigned_by'] = $task->assigned_by;
            $item['assignees'] = $task->assignees->map(fn ($u) => ['id' => $u->id])->toArray();
            $activities[] = $item;
        }

        // ── PROJECTS (past) ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', '<=', $yesterday)
            ->whereIn('action', ['created', 'assigned', 'completed', 'field_changed', 'status_updated', 'access_granted', 'access_removed'])
            ->latest()
            ->limit($limit)->get();

        // Filter out field_changed events for projects that have a 'created' event
        $projectIdsWithCreatedEvent = $projectEvents
            ->filter(fn ($e) => $e->action === 'created' && $e->project)
            ->pluck('project.id')
            ->filter()
            ->unique()
            ->toArray();
        $projectEvents = $projectEvents->filter(function ($e) use ($projectIdsWithCreatedEvent) {
            if ($e->action === 'field_changed' && $e->project && in_array($e->project->id, $projectIdsWithCreatedEvent)) {
                return false;
            }
            return true;
        });

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
            $activities[] = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, true, null, $event->comment ?? null, $event->created_at);
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
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'task.assignees:id', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->limit(50)->get();

        // Filter out field_changed events for tasks that have a 'created' event on the same day
        // This ensures only one activity entry shows per task creation (not file/link additions)
        $taskIdsWithCreatedEvent = $taskEvents
            ->filter(fn ($e) => $e->action === 'created' && $e->task)
            ->pluck('task.id')
            ->filter()
            ->unique()
            ->toArray();
        $taskEvents = $taskEvents->filter(function ($e) use ($taskIdsWithCreatedEvent) {
            if ($e->action === 'field_changed' && $e->task && in_array($e->task->id, $taskIdsWithCreatedEvent)) {
                return false;
            }
            return true;
        });

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
            $item['assigned_by'] = $task->assigned_by;
            $item['assignees'] = $task->assignees->map(fn ($u) => ['id' => $u->id])->toArray();
            if ($isActor) {
                $activities[] = $item;
            } else {
                $notifications[] = $item;
            }
        }

        // ── PROJECTS ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'completed', 'field_changed', 'status_updated', 'access_granted', 'access_removed'])
            ->limit(50)->get();

        // Filter out field_changed events for projects that have a 'created' event on the same day
        $projectIdsWithCreatedEvent = $projectEvents
            ->filter(fn ($e) => $e->action === 'created' && $e->project)
            ->pluck('project.id')
            ->filter()
            ->unique()
            ->toArray();
        $projectEvents = $projectEvents->filter(function ($e) use ($projectIdsWithCreatedEvent) {
            if ($e->action === 'field_changed' && $e->project && in_array($e->project->id, $projectIdsWithCreatedEvent)) {
                return false;
            }
            return true;
        });

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
            $item = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, $isActor, null, $event->comment ?? null, $event->created_at);
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
        // Guest: task belongs to their client project
        if ($user->role === 'guest' && $task->project && $task->project->isAccessibleByGuest($user)) {
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
        // Manually granted visibility access
        if ($project->manuallyVisibleTo()->where('user_id', $user->id)->exists()) {
            return true;
        }
        // Guest client: name matches project's client_name
        if ($user->role === 'guest' && $project->isAccessibleByGuest($user)) {
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
        // Guest: deliverable belongs to their client project
        if ($user->role === 'guest' && $dlv->project && $dlv->project->isAccessibleByGuest($user)) {
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

            if ($user->role === 'guest') {
                return Project::whereJsonContains('guest_ids', $user->id)->pluck('id')->toArray();
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
