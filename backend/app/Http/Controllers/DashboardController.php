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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    const CACHE_TTL = 60; // 1 minute — short TTL so new projects appear quickly

    public function index(Request $request)
    {
        $user = $request->user();
        $role = $user->role;
        $projectIds = $this->getUserProjectIds($user);
        $summary = $this->computeSummary($user, $role, $projectIds);

        $response = [
            'summary' => $summary,
            'todayWorkload' => $this->getTodayWorkload($user, $role),
            'activeProjects' => $this->computeActiveProjects($user, $projectIds),
            'recentActivity' => $this->getRecentActivity($user, $role, $projectIds),
            'upcomingDeadlines' => $this->getUpcomingDeadlines($user, $role, $projectIds),
        ];

        // Always fresh — never cached so created_at is never stale
        $response['completedToday'] = $this->getTodayActivityFeed($user, $role, $projectIds);
        $response['todayNotifications'] = $this->getTodayNotifications($user, $role, $projectIds);

        // New: Today's Activity from the activities table (user's own actions)
        $response['todayActivities'] = $this->getTodayActivities($user);

        return $response;
    }

    /**
     * Get today's activities performed by the logged-in user from the activities table.
     */
    private function getTodayActivities(User $user): array
    {
        return Activity::where('user_id', $user->id)
            ->whereDate('created_at', today())
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn ($activity) => [
                'id' => $activity->id,
                'activity_type' => $activity->activity_type,
                'related_module' => $activity->related_module,
                'related_id' => $activity->related_id,
                'description' => $activity->description,
                'created_at' => $activity->created_at->toIso8601String(),
            ])
            ->toArray();
    }

    private function getCachedSummary(User $user, string $role, array $projectIds): array
    {
        $cacheKey = "dashboard_summary_{$user->id}";
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $role, $projectIds) {
            return $this->computeSummary($user, $role, $projectIds);
        });
    }

    private function computeSummary(User $user, string $role, array $projectIds): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);

        if ($isAdminOrManager) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();

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

    private function getTodayWorkload(User $user, string $role): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $limit = 10;

        if ($isAdminOrManager) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();

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
                ->latest()
                ->limit($limit)
                ->get();
        } else {
            $tasks = Task::with(['project:id,title', 'assignees:id,name,role'])
                ->where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                      ->orWhere('assigned_to', $user->id);
                })
                ->whereDate('end_date', today())
                ->whereNotIn('status', $this->inactiveTaskStatuses())
                ->latest()
                ->limit($limit)
                ->get();
        }

        return $tasks->map(fn ($task) => array_merge($task->toArray(), [
            'module' => 'task',
            'item_type' => 'task',
            'entity_id' => $task->id,
        ]))->toArray();
    }

    private function getCachedActiveProjects(User $user, array $projectIds): array
    {
        $cacheKey = "dashboard_active_projects_{$user->id}";
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $projectIds) {
            return $this->computeActiveProjects($user, $projectIds);
        });
    }

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

        // Bulk load all assigned user IDs across all projects (eliminates N+1)
        $allUserIds = [];
        foreach ($projects as $project) {
            $ids = $this->normalizeAssignedUserIds($project->assigned_users);
            foreach ($ids as $id) { $allUserIds[$id] = $id; }
        }
        $allUsers = !empty($allUserIds)
            ? User::whereIn('id', $allUserIds)->select('id', 'name')->get()->keyBy('id')
            : collect();

        return $projects->map(function ($project) use ($allUsers) {
            $total = $project->total_tasks ?? 0;
            $done = $project->completed_tasks ?? 0;
            $progress = $total > 0 ? (int) round(($done / $total) * 100) : 0;

            $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
            $assignedUsers = collect();
            if (!empty($assignedUserIds)) {
                $assignedUsers = collect($assignedUserIds)
                    ->map(fn ($id) => $allUsers->get($id))
                    ->filter();
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

    private function getRecentActivity(User $user, string $role, array $projectIds): array
    {
        $cacheKey = "dashboard_recent_activity_{$user->id}";
        return Cache::remember($cacheKey, 60, function () use ($user, $role, $projectIds) {
            $query = DB::table('project_activities')
                ->join('users', 'project_activities.user_id', '=', 'users.id')
                ->join('projects', 'project_activities.project_id', '=', 'projects.id')
                ->where('users.active', true)
                ->select('project_activities.summary', 'project_activities.created_at', 'users.name as user_name', 'projects.title as project_title')
                ->latest('project_activities.created_at')
                ->limit(10);

            if (!in_array($role, ['admin', 'manager'])) {
                $query->whereIn('project_activities.project_id', $projectIds);
            }

            return $query->get()->toArray();
        });
    }

    private function getUpcomingDeadlines(User $user, string $role, array $projectIds): array
    {
        $query = Task::with(['project:id,title'])
            ->whereNotIn('status', $this->inactiveTaskStatuses())
            ->where('end_date', '>=', now())
            ->where('end_date', '<=', now()->addDays(7));

        if (in_array($role, ['admin', 'manager'])) {
            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id')->toArray();
            $query->whereIn('assigned_by', $adminManagerIds);
        } else {
            $query->where(function ($q) use ($user) {
                $q->whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                  ->orWhere('assigned_to', $user->id);
            });
        }

        return $query->limit(10)->get()->map(fn ($task) => [
            'id' => $task->id,
            'entity_id' => $task->id,
            'module' => 'task',
            'title' => $task->title,
            'project' => $task->project?->title,
            'end_date' => $task->end_date?->format('M d, Y h:i A'),
            'sort_date' => $task->end_date,
        ])->sortBy('sort_date')->values()->map(function ($item) {
            unset($item['sort_date']);
            return $item;
        })->toArray();
    }

    // ──────────────────────────────────────────────────────────────────
    // TODAY'S ACTIVITY FEED — own actions + others' actions affecting user
    // ──────────────────────────────────────────────────────────────────

    private function getTodayActivityFeed(User $user, string $role, array $projectIds): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $today = today();
        $activities = [];

        // Bulk load task_user membership for the user (used for non-admin activity filtering)
        $myTaskIds = DB::table('task_user')->where('user_id', $user->id)->pluck('task_id')->toArray();

        // ── TASKS ──
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->limit(50)->get();

        // Bulk-load submitters for approval/rejection/reopen events
        $taskIdsNeedingSub = $taskEvents->filter(fn($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('task.id')->filter()->unique()->toArray();
        $taskSubmitters = [];
        if (!empty($taskIdsNeedingSub)) {
            $subEvents = TaskWorkflowEvent::whereIn('task_id', $taskIdsNeedingSub)
                ->where('action', 'submitted')
                ->with('user:id,name,role')
                ->select('task_id', 'user_id')
                ->get()
                ->groupBy('task_id');
            foreach ($subEvents as $tid => $events) {
                $latest = $events->sortByDesc('id')->first();
                if ($latest && $latest->user) {
                    $taskSubmitters[$tid] = $latest->user;
                }
            }
        }

        foreach ($taskEvents as $event) {
            $task = $event->task;
            if (!$task || !$event->user) continue;

            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToTask($user, $task, $myTaskIds, $isAdminOrManager);
            if (!$isRelated) continue;

            $submitter = $taskSubmitters[$task->id] ?? null;
            $activities[] = $this->formatActivity('task', $event->id, $task->id, $task->title, $event->action, $event->user, $isActor, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── PROJECTS ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->limit(50)->get();

        $projectIdsNeedingSub = $projectEvents->filter(fn($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('project.id')->filter()->unique()->toArray();
        $projectSubmitters = [];
        if (!empty($projectIdsNeedingSub)) {
            $subEvents = ProjectWorkflowEvent::whereIn('project_id', $projectIdsNeedingSub)
                ->where('action', 'submitted')
                ->with('user:id,name,role')
                ->select('project_id', 'user_id')
                ->get()
                ->groupBy('project_id');
            foreach ($subEvents as $pid => $events) {
                $latest = $events->sortByDesc('id')->first();
                if ($latest && $latest->user) {
                    $projectSubmitters[$pid] = $latest->user;
                }
            }
        }

        foreach ($projectEvents as $event) {
            $project = $event->project;
            if (!$project || !$event->user) continue;

            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToProject($user, $project, $isAdminOrManager);
            if (!$isRelated) continue;

            $submitter = $projectSubmitters[$project->id] ?? null;
            $activities[] = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, $isActor, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── DELIVERABLES ──
        $dlvEvents = DeliverableWorkflowEvent::with(['deliverable:id,title,created_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('event_type', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'status_updated', 'field_changed', 'approval', 'rework'])
            ->limit(50)->get();

        $dlvIdsNeedingSub = $dlvEvents->pluck('deliverable.id')->filter()->unique()->toArray();
        $dlvSubmitters = [];
        if (!empty($dlvIdsNeedingSub)) {
            $subs = DeliverableSubmission::whereIn('deliverable_id', $dlvIdsNeedingSub)
                ->with('submittedBy:id,name,role')
                ->select('deliverable_id', 'submitted_by')
                ->get()
                ->groupBy('deliverable_id');
            foreach ($subs as $did => $items) {
                $latest = $items->sortByDesc('id')->first();
                if ($latest && $latest->submittedBy) {
                    $dlvSubmitters[$did] = $latest->submittedBy;
                }
            }
        }

        foreach ($dlvEvents as $event) {
            $dlv = $event->deliverable;
            if (!$dlv || !$event->user) continue;

            $isActor = (int) $event->user->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToDeliverable($user, $dlv);
            if (!$isRelated) continue;

            $action = $event->event_type === 'approval' ? 'approved' : $event->event_type;
            $submitter = $dlvSubmitters[$dlv->id] ?? null;
            $activities[] = $this->formatActivity('deliverable', $event->id, $dlv->id, $dlv->title, $action, $event->user, $isActor, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── DELIVERABLE SUBMISSIONS ──
        $dlvSubmissions = DeliverableSubmission::with(['deliverable:id,title,created_by,assigned_to', 'submittedBy:id,name,role'])
            ->whereDate('created_at', $today)->limit(50)->get();
        foreach ($dlvSubmissions as $sub) {
            $dlv = $sub->deliverable;
            if (!$dlv || !$sub->submittedBy) continue;

            $isActor = (int) $sub->submittedBy->id === (int) $user->id;
            $isRelated = $isActor || $this->isUserRelatedToDeliverable($user, $dlv);
            if (!$isRelated) continue;

            $activities[] = $this->formatActivity('deliverable', "sub_{$sub->id}", $dlv->id, $dlv->title, 'submitted', $sub->submittedBy, $isActor, null, null, $sub->created_at);
        }

        usort($activities, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        return array_slice($activities, 0, 20);
    }

    // ──────────────────────────────────────────────────────────────────
    // TODAY'S NOTIFICATIONS — ONLY other users' actions affecting user
    // ──────────────────────────────────────────────────────────────────

    private function getTodayNotifications(User $user, string $role, array $projectIds): array
    {
        $isAdminOrManager = in_array($role, ['admin', 'manager']);
        $today = today();
        $notifications = [];

        $myTaskIds = DB::table('task_user')->where('user_id', $user->id)->pluck('task_id')->toArray();

        // ── TASKS — only other users' actions on tasks I'm related to ──
        $taskEvents = TaskWorkflowEvent::with(['task:id,title,assigned_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->where('user_id', '!=', $user->id)
            ->limit(50)->get();

        $taskIdsNeedingSub = $taskEvents->filter(fn($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('task.id')->filter()->unique()->toArray();
        $taskSubmitters = [];
        if (!empty($taskIdsNeedingSub)) {
            $subEvents = TaskWorkflowEvent::whereIn('task_id', $taskIdsNeedingSub)
                ->where('action', 'submitted')
                ->with('user:id,name,role')
                ->select('task_id', 'user_id')
                ->get()
                ->groupBy('task_id');
            foreach ($subEvents as $tid => $events) {
                $latest = $events->sortByDesc('id')->first();
                if ($latest && $latest->user) {
                    $taskSubmitters[$tid] = $latest->user;
                }
            }
        }

        foreach ($taskEvents as $event) {
            $task = $event->task;
            if (!$task || !$event->user) continue;

            $isRelated = $this->isUserRelatedToTask($user, $task, $myTaskIds, $isAdminOrManager);
            if (!$isRelated) continue;

            $submitter = $taskSubmitters[$task->id] ?? null;
            $notifications[] = $this->formatActivity('task', $event->id, $task->id, $task->title, $event->action, $event->user, false, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── PROJECTS — only other users' actions on projects I'm related to ──
        $projectEvents = ProjectWorkflowEvent::with(['project:id,title,created_by,assigned_users', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('action', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'field_changed', 'status_updated'])
            ->where('user_id', '!=', $user->id)
            ->limit(50)->get();

        $projectIdsNeedingSub = $projectEvents->filter(fn($e) => in_array($e->action, ['approved', 'rejected', 'reopened']))->pluck('project.id')->filter()->unique()->toArray();
        $projectSubmitters = [];
        if (!empty($projectIdsNeedingSub)) {
            $subEvents = ProjectWorkflowEvent::whereIn('project_id', $projectIdsNeedingSub)
                ->where('action', 'submitted')
                ->with('user:id,name,role')
                ->select('project_id', 'user_id')
                ->get()
                ->groupBy('project_id');
            foreach ($subEvents as $pid => $events) {
                $latest = $events->sortByDesc('id')->first();
                if ($latest && $latest->user) {
                    $projectSubmitters[$pid] = $latest->user;
                }
            }
        }

        foreach ($projectEvents as $event) {
            $project = $event->project;
            if (!$project || !$event->user) continue;

            $isRelated = $this->isUserRelatedToProject($user, $project, $isAdminOrManager);
            if (!$isRelated) continue;

            $submitter = $projectSubmitters[$project->id] ?? null;
            $notifications[] = $this->formatActivity('project', $event->id, $project->id, $project->title, $event->action, $event->user, false, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── DELIVERABLES — only other users' actions on deliverables I'm related to ──
        $dlvEvents = DeliverableWorkflowEvent::with(['deliverable:id,title,created_by,assigned_to', 'user:id,name,role'])
            ->whereDate('created_at', $today)
            ->whereIn('event_type', ['created', 'assigned', 'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'completed', 'status_updated', 'field_changed', 'approval', 'rework'])
            ->where('user_id', '!=', $user->id)
            ->limit(50)->get();

        $dlvIdsNeedingSub = $dlvEvents->pluck('deliverable.id')->filter()->unique()->toArray();
        $dlvSubmitters = [];
        if (!empty($dlvIdsNeedingSub)) {
            $subs = DeliverableSubmission::whereIn('deliverable_id', $dlvIdsNeedingSub)
                ->with('submittedBy:id,name,role')
                ->select('deliverable_id', 'submitted_by')
                ->get()
                ->groupBy('deliverable_id');
            foreach ($subs as $did => $items) {
                $latest = $items->sortByDesc('id')->first();
                if ($latest && $latest->submittedBy) {
                    $dlvSubmitters[$did] = $latest->submittedBy;
                }
            }
        }

        foreach ($dlvEvents as $event) {
            $dlv = $event->deliverable;
            if (!$dlv || !$event->user) continue;

            $isRelated = $this->isUserRelatedToDeliverable($user, $dlv);
            if (!$isRelated) continue;

            $action = $event->event_type === 'approval' ? 'approved' : $event->event_type;
            $submitter = $dlvSubmitters[$dlv->id] ?? null;
            $notifications[] = $this->formatActivity('deliverable', $event->id, $dlv->id, $dlv->title, $action, $event->user, false, $submitter, $event->comment ?? null, $event->created_at);
        }

        // ── DELIVERABLE SUBMISSIONS — only other users ──
        $dlvSubmissions = DeliverableSubmission::with(['deliverable:id,title,created_by,assigned_to', 'submittedBy:id,name,role'])
            ->whereDate('created_at', $today)
            ->where('submitted_by', '!=', $user->id)
            ->limit(50)->get();
        foreach ($dlvSubmissions as $sub) {
            $dlv = $sub->deliverable;
            if (!$dlv || !$sub->submittedBy) continue;

            $isRelated = $this->isUserRelatedToDeliverable($user, $dlv);
            if (!$isRelated) continue;

            $notifications[] = $this->formatActivity('deliverable', "sub_{$sub->id}", $dlv->id, $dlv->title, 'submitted', $sub->submittedBy, false, null, null, $sub->created_at);
        }

        usort($notifications, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        return array_slice($notifications, 0, 20);
    }

    // ──────────────────────────────────────────────────────────────────
    // USER-RELATION HELPERS
    // ──────────────────────────────────────────────────────────────────

    private function isUserRelatedToTask(User $user, $task, array $myTaskIds, bool $isAdminOrManager): bool
    {
        // Assignee via pivot
        if (in_array($task->id, $myTaskIds)) return true;
        // Assignee via assigned_to column
        if ((int) ($task->assigned_to ?? 0) === (int) $user->id) return true;
        // Assigner
        if ((int) ($task->assigned_by ?? 0) === (int) $user->id) return true;
        // Admin/Manager see all
        if ($isAdminOrManager) return true;
        return false;
    }

    private function isUserRelatedToProject(User $user, $project, bool $isAdminOrManager): bool
    {
        // Creator
        if ((int) ($project->created_by ?? 0) === (int) $user->id) return true;
        // Assigned user in JSON
        $assignedUserIds = $this->normalizeAssignedUserIds($project->assigned_users);
        if (in_array((int) $user->id, $assignedUserIds, true)) return true;
        // Admin/Manager see all
        if ($isAdminOrManager) return true;
        return false;
    }

    private function isUserRelatedToDeliverable(User $user, $dlv): bool
    {
        // Assignee
        if ((int) ($dlv->assigned_to ?? 0) === (int) $user->id) return true;
        // Creator
        if ((int) ($dlv->created_by ?? 0) === (int) $user->id) return true;
        return false;
    }

    // ──────────────────────────────────────────────────────────────────
    // FORMAT + UTILITIES
    // ──────────────────────────────────────────────────────────────────

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
            'created_at' => $createdAt ? $createdAt instanceof \Carbon\Carbon ? $createdAt->toIso8601ZuluString() : $createdAt : now()->toIso8601ZuluString(),
        ];

        if ($submitter) {
            $result['submitted_by_name'] = $submitter->name;
            $result['submitted_by_role'] = $submitter->role;
        }

        return $result;
    }

    private function getUserProjectIds(User $user): array
    {
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
                        ->orWhereJsonContains('assigned_users', (int)$user->id);
                  })->whereDoesntHave('visibility', fn ($q) => $q->where('user_id', $user->id)->where('is_visible', false));
              });
        })->pluck('id')->toArray();
    }

    private function inactiveTaskStatuses(): array { return ['completed', 'done', 'approved', 'abandoned']; }
    private function dueTodayCompletedStatuses(): array { return ['approved', 'completed', 'done']; }
    private function inactiveProjectStatuses(): array { return ['completed','Completed','done','Done','approved','Approved','rejected','Rejected','cancelled','Cancelled','canceled','Canceled','abandoned','Abandoned','closed','Closed','archived','Archived']; }

    private function normalizeAssignedUserIds($assignedUsers): array
    {
        if (is_string($assignedUsers)) {
            $assignedUsers = json_decode($assignedUsers, true) ?? [];
        }
        if (!is_array($assignedUsers)) return [];
        return array_map('intval', $assignedUsers);
    }
}
