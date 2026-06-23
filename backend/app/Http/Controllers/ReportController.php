<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function teamPerformance(Request $request)
    {
        $user = $request->user();
        $timeFilter = $request->query('period', 'all');
        $cacheKey = "report_team_perf_{$user->id}_{$timeFilter}";

        return Cache::remember($cacheKey, 300, function () use ($user, $timeFilter) {
            $query = User::select('id', 'name', 'email', 'role')
                ->where('active', true)
                ->orderBy('name');

            if ($user->role === 'team_lead') {
                $teamIds = DB::table('team_user')
                    ->join('teams', 'teams.id', '=', 'team_user.team_id')
                    ->where('teams.leader_id', $user->id)
                    ->pluck('team_user.team_id');

                $memberIds = DB::table('team_user')
                    ->whereIn('team_id', $teamIds)
                    ->pluck('user_id');

                $query->whereIn('id', $memberIds);
            }

            $members = $query->get();
            $memberIds = $members->pluck('id');

            // Bulk load task stats per user
            $taskStats = Task::selectRaw('
                assignees_users.user_id,
                COUNT(*) as assigned,
                SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed
            ')
                ->join('task_user as assignees_users', 'tasks.id', '=', 'assignees_users.task_id')
                ->whereIn('assignees_users.user_id', $memberIds)
                ->when($timeFilter !== 'all', fn ($q) => $this->applyTimeFilter($q, $timeFilter))
                ->groupBy('assignees_users.user_id')
                ->get()
                ->keyBy('user_id');

            // Bulk load project names per user
            $userProjects = Task::select('assignees_users.user_id', 'projects.title')
                ->join('task_user as assignees_users', 'tasks.id', '=', 'assignees_users.task_id')
                ->join('projects', 'tasks.project_id', '=', 'projects.id')
                ->whereIn('assignees_users.user_id', $memberIds)
                ->when($timeFilter !== 'all', fn ($q) => $this->applyTimeFilter($q, $timeFilter))
                ->distinct()
                ->get()
                ->groupBy('user_id')
                ->map(fn ($items) => $items->pluck('title')->unique()->values()->take(5)->toArray());

            $result = $members->map(function ($member) use ($taskStats, $userProjects) {
                $stats = $taskStats->get($member->id, (object)['assigned' => 0, 'completed' => 0]);
                $assigned = (int) $stats->assigned;
                $completed = (int) $stats->completed;
                $pending = $assigned - $completed;

                return [
                    'id' => $member->id, 'name' => $member->name, 'email' => $member->email, 'role' => $member->role,
                    'assigned' => $assigned, 'completed' => $completed, 'pending' => max($pending, 0),
                    'projects' => $userProjects->get($member->id, []),
                ];
            });

            $totalAssigned = $result->sum('assigned');
            $totalCompleted = $result->sum('completed');

            return [
                'summary' => [
                    'total_assigned' => $totalAssigned,
                    'total_completed' => $totalCompleted,
                    'total_pending' => max($totalAssigned - $totalCompleted, 0),
                    'completion_rate' => $totalAssigned > 0 ? (int) round(($totalCompleted / $totalAssigned) * 100) : 0,
                ],
                'members' => $result,
            ];
        });
    }

    public function userPerformance(Request $request, User $user)
    {
        $timeFilter = $request->query('period', 'all');
        $cacheKey = "report_user_perf_{$user->id}_{$timeFilter}";
        $ttl = 300;

        return Cache::remember($cacheKey, $ttl, function () use ($user, $timeFilter) {
            $taskBase = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id));
            if ($timeFilter !== 'all') $taskBase = $this->applyTimeFilter($taskBase, $timeFilter);

            $taskIds = (clone $taskBase)->pluck('id');

            // Single aggregated stats query
            $stats = $taskIds->isNotEmpty()
                ? Task::selectRaw("
                    COUNT(*) as assigned,
                    SUM(CASE WHEN status IN ('completed','done') THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status IN ('failed','abandoned') THEN 1 ELSE 0 END) as failed
                ")->whereIn('id', $taskIds)->first()
                : (object)['assigned' => 0, 'completed' => 0, 'failed' => 0];

            $assigned = (int) $stats->assigned;
            $completed = (int) $stats->completed;
            $pending = $assigned - $completed - (int) $stats->failed;

            $recentTasks = (clone $taskBase)
                ->with('project:id,title')
                ->latest()
                ->limit(10)
                ->get();

            $projectStats = (clone $taskBase)
                ->join('projects', 'projects.id', '=', 'tasks.project_id')
                ->select(
                    'projects.id as project_id', 'projects.title as project_title',
                    DB::raw('COUNT(*) as total_tasks'),
                    DB::raw('SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed_tasks')
                )
                ->groupBy('projects.id', 'projects.title')
                ->get();

            return [
                'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->role],
                'summary' => ['assigned' => $assigned, 'completed' => $completed, 'pending' => max($pending, 0), 'failed' => (int) $stats->failed],
                'recent_tasks' => $recentTasks,
                'project_stats' => $projectStats,
            ];
        });
    }

    public function projectReport(Project $project)
    {
        $cacheKey = "report_project_{$project->id}";
        return Cache::remember($cacheKey, 300, function () use ($project) {
            $tasks = $project->tasks()->with('assignees:id,name,email,role')->get();

            $total = $tasks->count();
            $completed = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['done', 'completed'], true))->count();
            $failed = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['failed', 'abandoned'], true))->count();

            $byAssignee = $tasks->flatMap(fn ($t) => $t->assignees->map(fn ($a) => ['user' => ['id' => $a->id, 'name' => $a->name], 'task_id' => $t->id, 'status' => $t->status]))
                ->groupBy('user.id')
                ->map(function ($items, $userId) {
                    return [
                        'user' => $items->first()['user'],
                        'total' => $items->count(),
                        'completed' => $items->filter(fn ($i) => in_array(strtolower((string) $i['status']), ['done', 'completed'], true))->count(),
                    ];
                })->values();

            return [
                'project' => ['id' => $project->id, 'title' => $project->title, 'status' => $project->status],
                'summary' => [
                    'total' => $total, 'completed' => $completed,
                    'pending' => $total - $completed - $failed, 'failed' => $failed,
                    'progress_percent' => $total > 0 ? (int) round(($completed / $total) * 100) : 0,
                ],
                'by_assignee' => $byAssignee,
                'tasks' => $tasks,
            ];
        });
    }

    public function summaryReport(Request $request)
    {
        return Cache::remember('report_summary', 300, function () {
            $totalTeams = Team::count();

            $projectStats = Project::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('In Progress','Active','planned') THEN 1 ELSE 0 END) as active
            ")->first();

            $taskStats = Task::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','done') THEN 1 ELSE 0 END) as completed
            ")->first();

            $overdueTasks = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])
                ->count();

            $totalTasks = (int) $taskStats->total;
            $completedTasks = (int) $taskStats->completed;

            $projects = Project::withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['done', 'completed']);
            }])
                ->latest()
                ->limit(10)
                ->get()
                ->map(function ($p) {
                    $total = $p->total_tasks;
                    $done = $p->completed_tasks;
                    return [
                        'title' => $p->title, 'completion' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
                        'completed_tasks' => $done, 'total_tasks' => $total, 'end_date' => $p->end_date,
                    ];
                });

            return [
                'total_teams' => $totalTeams,
                'active_projects' => (int) $projectStats->active,
                'tasks_created' => $totalTasks,
                'tasks_completed' => $completedTasks,
                'completion_rate' => $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0,
                'overdue_tasks' => $overdueTasks,
                'projects' => $projects,
            ];
        });
    }

    public function detailedReport(Request $request)
    {
        return Cache::remember('report_detailed', 300, function () {
            $totalTeams = Team::count();

            $taskStats = Task::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','done') THEN 1 ELSE 0 END) as completed
            ")->first();

            $totalTasks = (int) $taskStats->total;
            $completedTasks = (int) $taskStats->completed;
            $overdueTasks = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();

            $projects = Project::withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['done', 'completed']);
            }])->latest()->limit(10)->get()->map(function ($p) {
                $total = $p->total_tasks; $done = $p->completed_tasks;
                return ['title' => $p->title, 'completion' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
                    'completed_tasks' => $done, 'total_tasks' => $total, 'status' => $p->status];
            });

            $teams = Team::withCount(['members as member_count'])->get()->map(function ($team) {
                $memberIds = $team->members()->pluck('users.id');
                $taskStats = $memberIds->isNotEmpty()
                    ? Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))
                        ->selectRaw('COUNT(*) as total, SUM(CASE WHEN status IN ("completed","done") THEN 1 ELSE 0 END) as completed')
                        ->first()
                    : (object)['total' => 0, 'completed' => 0];
                return ['name' => $team->name, 'members' => $team->member_count,
                    'completed_tasks' => (int) $taskStats->completed, 'total_tasks' => (int) $taskStats->total,
                    'completion_rate' => (int) $taskStats->total > 0 ? (int) round(((int) $taskStats->completed / (int) $taskStats->total) * 100) : 0];
            });

            $overdueList = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])
                ->with('project:id,title')->orderBy('end_date')->limit(10)->get()
                ->map(fn ($t) => ['title' => $t->title, 'project' => $t->project?->title ?? '—', 'days_overdue' => now()->diffInDays($t->end_date)]);

            $recentTasks = Task::with(['project:id,title', 'assignees:id,name'])
                ->latest()->limit(10)->get()
                ->map(fn ($t) => ['title' => $t->title, 'project' => $t->project?->title ?? '—',
                    'assignee' => $t->assignees->pluck('name')->join(', ') ?: '—', 'status' => $t->status, 'end_date' => $t->end_date]);

            return compact('totalTeams', 'completedTasks', 'overdueTasks', 'projects', 'teams', 'overdueList', 'recentTasks') + [
                'active_projects' => Project::whereIn('status', ['In Progress', 'Active', 'planned'])->count(),
                'tasks_created' => $totalTasks, 'tasks_completed' => $completedTasks,
                'completion_rate' => $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0,
            ];
        });
    }

    public function performanceReport(Request $request)
    {
        return Cache::remember('report_performance', 300, function () {
            $taskStats = Task::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','done') THEN 1 ELSE 0 END) as completed
            ")->first();

            $totalAssigned = (int) $taskStats->total;
            $totalCompleted = (int) $taskStats->completed;
            $totalOverdue = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();

            $teams = Team::withCount(['members as member_count'])->get()->map(function ($team) {
                $memberIds = $team->members()->pluck('users.id');
                $stats = $memberIds->isNotEmpty()
                    ? Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))
                        ->selectRaw('COUNT(*) as total, SUM(CASE WHEN status IN ("completed","done") THEN 1 ELSE 0 END) as completed')
                        ->first()
                    : (object)['total' => 0, 'completed' => 0];
                return ['name' => $team->name, 'members' => $team->member_count,
                    'completed_tasks' => (int) $stats->completed, 'total_tasks' => (int) $stats->total,
                    'completion_rate' => (int) $stats->total > 0 ? (int) round(((int) $stats->completed / (int) $stats->total) * 100) : 0];
            });

            $members = User::where('active', true)->select('id', 'name', 'role')->orderBy('name')->get();
            $memberIds = $members->pluck('id');

            $memberStats = $memberIds->isNotEmpty()
                ? Task::join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->selectRaw('task_user.user_id, COUNT(*) as assigned, SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed')
                    ->whereIn('task_user.user_id', $memberIds)
                    ->groupBy('task_user.user_id')
                    ->get()->keyBy('user_id')
                : collect();

            $memberResults = $members->map(function ($member) use ($memberStats) {
                $stats = $memberStats->get($member->id, (object)['assigned' => 0, 'completed' => 0]);
                $assigned = (int) $stats->assigned;
                $completed = (int) $stats->completed;
                return ['name' => $member->name, 'assigned' => $assigned, 'completed' => $completed,
                    'pending' => max($assigned - $completed, 0),
                    'completion_rate' => $assigned > 0 ? (int) round(($completed / $assigned) * 100) : 0];
            })->filter(fn ($m) => $m['assigned'] > 0)->values();

            $openTasks = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])
                ->with('assignees:id,name')->orderBy('end_date')->limit(10)->get()
                ->map(fn ($t) => ['title' => $t->title, 'assignee' => $t->assignees->pluck('name')->join(', ') ?: '—',
                    'priority' => $t->priority ?? 'Medium', 'days_late' => now()->diffInDays($t->end_date)]);

            return [
                'overview' => ['assigned' => $totalAssigned, 'completed' => $totalCompleted,
                    'pending' => max($totalAssigned - $totalCompleted, 0), 'overdue' => $totalOverdue,
                    'completion_rate' => $totalAssigned > 0 ? (int) round(($totalCompleted / $totalAssigned) * 100) : 0],
                'teams' => $teams, 'members' => $memberResults, 'open_tasks' => $openTasks,
            ];
        });
    }

    public function progressReport(Request $request)
    {
        return Cache::remember('report_progress', 300, function () {
            $taskStats = Task::selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','done') THEN 1 ELSE 0 END) as completed
            ")->first();

            $totalAssigned = (int) $taskStats->total;
            $totalCompleted = (int) $taskStats->completed;
            $totalOverdue = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();

            $topProject = Project::withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
                $q->whereIn('status', ['done', 'completed']);
            }])->with(['creator:id,name', 'team:id,name,leader_id'])->latest()->first();

            $projectOverview = null;
            $milestones = [];
            if ($topProject) {
                $memberCount = is_array($topProject->assigned_users) ? count($topProject->assigned_users) : 0;
                $projectOverview = ['name' => $topProject->title, 'client' => $topProject->client_name ?? '—',
                    'team_lead' => $topProject->creator?->name ?? '—', 'members' => $memberCount,
                    'start_date' => $topProject->start_date, 'end_date' => $topProject->end_date];
                $milestones = $topProject->milestones()->limit(10)->get()->map(fn ($m) => [
                    'title' => $m->title ?? '—', 'status' => $m->status ?? 'Pending',
                    'target_date' => $m->due_date, 'due_date' => $m->due_date,
                ])->toArray();
            }

            $members = User::where('active', true)->select('id', 'name')->orderBy('name')->get();
            $memberIds = $members->pluck('id');
            $memberWorkload = $memberIds->isNotEmpty()
                ? Task::join('task_user', 'tasks.id', '=', 'task_user.task_id')
                    ->selectRaw('task_user.user_id, COUNT(*) as assigned')
                    ->whereIn('task_user.user_id', $memberIds)
                    ->groupBy('task_user.user_id')
                    ->get()->keyBy('user_id')
                : collect();

            $memberResults = $members->map(function ($m) use ($memberWorkload) {
                return ['name' => $m->name, 'assigned' => (int) ($memberWorkload->get($m->id)?->assigned ?? 0)];
            })->filter(fn ($m) => $m['assigned'] > 0)->values();

            $openTasks = Task::where('end_date', '<', now())
                ->whereNotIn('status', ['completed', 'done', 'abandoned'])
                ->with('assignees:id,name')->orderBy('end_date')->limit(10)->get()
                ->map(fn ($t) => ['title' => $t->title, 'assignee' => $t->assignees->pluck('name')->join(', ') ?: '—',
                    'priority' => $t->priority ?? 'Medium', 'days_late' => now()->diffInDays($t->end_date)]);

            return [
                'overview' => ['assigned' => $totalAssigned, 'completed' => $totalCompleted,
                    'pending' => max($totalAssigned - $totalCompleted, 0), 'overdue' => $totalOverdue],
                'project' => $projectOverview, 'members' => $memberResults,
                'milestones' => $milestones, 'open_tasks' => $openTasks,
            ];
        });
    }

    private function applyTimeFilter($query, string $period)
    {
        return match ($period) {
            'today' => $query->whereDate('created_at', today()),
            'week' => $query->where('created_at', '>=', now()->startOfWeek()),
            'month' => $query->where('created_at', '>=', now()->startOfMonth()),
            default => $query,
        };
    }
}
