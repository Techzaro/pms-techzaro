<?php

/**
 * Controller for reports and analytics data.
 */

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Report controller.
 * Provides team performance, user performance, and project reports.
 */
class ReportController extends Controller
{
    /**
     * Team performance report.
     * Returns per-member stats: assigned, completed, pending tasks.
     */
    public function teamPerformance(Request $request)
    {
        $user = $request->user();
        $timeFilter = $request->query('period', 'all');

        $query = User::select('id', 'name', 'email', 'role')
            ->where('active', true)
            ->orderBy('name');

        // If team_lead, only show their team members
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

        $members = $query->get()->map(function ($member) use ($timeFilter) {
            $taskQuery = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $member->id));

            $taskQuery = $this->applyTimeFilter($taskQuery, $timeFilter);

            $assigned = (clone $taskQuery)->count();
            $completed = (clone $taskQuery)->clone()->whereIn('status', ['completed', 'done'])->count();
            $pending = (clone $taskQuery)->clone()->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();

            $tasks = (clone $taskQuery)
                ->with('project:id,title')
                ->limit(5)
                ->get()
                ->pluck('project.title')
                ->unique()
                ->values()
                ->toArray();

            return [
                'id' => $member->id,
                'name' => $member->name,
                'email' => $member->email,
                'role' => $member->role,
                'assigned' => $assigned,
                'completed' => $completed,
                'pending' => $pending,
                'projects' => $tasks,
            ];
        });

        // Summary cards
        $totalAssigned = $members->sum('assigned');
        $totalCompleted = $members->sum('completed');
        $totalPending = $members->sum('pending');
        $completionRate = $totalAssigned > 0 ? (int) round(($totalCompleted / $totalAssigned) * 100) : 0;

        return response()->json([
            'summary' => [
                'total_assigned' => $totalAssigned,
                'total_completed' => $totalCompleted,
                'total_pending' => $totalPending,
                'completion_rate' => $completionRate,
            ],
            'members' => $members,
        ]);
    }

    /**
     * Individual user performance.
     */
    public function userPerformance(Request $request, User $user)
    {
        $timeFilter = $request->query('period', 'all');

        $taskQuery = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id));
        $taskQuery = $this->applyTimeFilter($taskQuery, $timeFilter);

        $assigned = (clone $taskQuery)->count();
        $completed = (clone $taskQuery)->clone()->whereIn('status', ['completed', 'done'])->count();
        $pending = (clone $taskQuery)->clone()->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $failed = (clone $taskQuery)->clone()->whereIn('status', ['failed', 'abandoned'])->count();

        $recentTasks = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->with('project:id,title')
            ->latest()
            ->limit(10)
            ->get();

        $projectStats = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
            ->join('projects', 'projects.id', '=', 'tasks.project_id')
            ->select(
                'projects.id as project_id',
                'projects.title as project_title',
                DB::raw('COUNT(*) as total_tasks'),
                DB::raw('SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed_tasks')
            )
            ->groupBy('projects.id', 'projects.title')
            ->get();

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'summary' => [
                'assigned' => $assigned,
                'completed' => $completed,
                'pending' => $pending,
                'failed' => $failed,
            ],
            'recent_tasks' => $recentTasks,
            'project_stats' => $projectStats,
        ]);
    }

    /**
     * Project-specific report.
     */
    public function projectReport(Project $project)
    {
        $tasks = $project->tasks()->with('assignees:id,name,email,role')->get();

        $total = $tasks->count();
        $completed = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['done', 'completed'], true))->count();
        $pending = $tasks->filter(fn ($t) => !in_array(strtolower((string) $t->status), ['done', 'completed', 'failed', 'abandoned'], true))->count();
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

        return response()->json([
            'project' => [
                'id' => $project->id,
                'title' => $project->title,
                'status' => $project->status,
            ],
            'summary' => [
                'total' => $total,
                'completed' => $completed,
                'pending' => $pending,
                'failed' => $failed,
                'progress_percent' => $total > 0 ? (int) round(($completed / $total) * 100) : 0,
            ],
            'by_assignee' => $byAssignee,
            'tasks' => $tasks,
        ]);
    }

    /**
     * Apply time filter to a task query.
     */
    private function applyTimeFilter($query, string $period)
    {
        return match ($period) {
            'today' => $query->whereDate('created_at', today()),
            'week' => $query->where('created_at', '>=', now()->startOfWeek()),
            'month' => $query->where('created_at', '>=', now()->startOfMonth()),
            default => $query,
        };
    }

    /**
     * Summary report overview data.
     * Returns total teams, active projects, task stats, and project progress list.
     */
    public function summaryReport(Request $request)
    {
        $totalTeams = \App\Models\Team::count();

        $activeProjects = Project::whereIn('status', ['In Progress', 'Active', 'planned'])->count();

        $totalTasks = Task::count();
        $completedTasks = Task::whereIn('status', ['completed', 'done'])->count();
        $pendingTasks = Task::whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $overdueTasks = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->count();
        $completionRate = $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0;

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
                    'title' => $p->title,
                    'completion' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
                    'completed_tasks' => $done,
                    'total_tasks' => $total,
                    'end_date' => $p->end_date,
                ];
            });

        return response()->json([
            'total_teams' => $totalTeams,
            'active_projects' => $activeProjects,
            'tasks_created' => $totalTasks,
            'tasks_completed' => $completedTasks,
            'completion_rate' => $completionRate,
            'overdue_tasks' => $overdueTasks,
            'projects' => $projects,
        ]);
    }

    /**
     * Detailed report with overview, projects, teams, overdue tasks, and task details.
     */
    public function detailedReport(Request $request)
    {
        $totalTeams = \App\Models\Team::count();
        $activeProjects = Project::whereIn('status', ['In Progress', 'Active', 'planned'])->count();

        $totalTasks = Task::count();
        $completedTasks = Task::whereIn('status', ['completed', 'done'])->count();
        $pendingTasks = Task::whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $overdueTasks = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->count();
        $completionRate = $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0;

        // Projects progress
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
                    'title' => $p->title,
                    'completion' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
                    'completed_tasks' => $done,
                    'total_tasks' => $total,
                    'status' => $p->status,
                ];
            });

        // Team performance
        $teams = \App\Models\Team::withCount(['members as member_count'])
            ->with(['members:id,name'])
            ->get()
            ->map(function ($team) {
                $memberIds = $team->members->pluck('id');
                $totalTasks = Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))->count();
                $completedTasks = Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))
                    ->whereIn('status', ['completed', 'done'])->count();
                return [
                    'name' => $team->name,
                    'members' => $team->member_count,
                    'completed_tasks' => $completedTasks,
                    'total_tasks' => $totalTasks,
                    'completion_rate' => $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0,
                ];
            });

        // Overdue tasks (attention required)
        $overdueList = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->with('project:id,title')
            ->orderBy('end_date')
            ->limit(10)
            ->get()
            ->map(function ($t) {
                $daysOverdue = now()->diffInDays($t->end_date);
                return [
                    'title' => $t->title,
                    'project' => $t->project?->title ?? '—',
                    'days_overdue' => $daysOverdue,
                ];
            });

        // Recent tasks (task details)
        $recentTasks = Task::with(['project:id,title', 'assignees:id,name'])
            ->latest()
            ->limit(10)
            ->get()
            ->map(function ($t) {
                return [
                    'title' => $t->title,
                    'project' => $t->project?->title ?? '—',
                    'assignee' => $t->assignees->pluck('name')->join(', ') ?: '—',
                    'status' => $t->status,
                    'end_date' => $t->end_date,
                ];
            });

        return response()->json([
            'total_teams' => $totalTeams,
            'active_projects' => $activeProjects,
            'tasks_created' => $totalTasks,
            'tasks_completed' => $completedTasks,
            'completion_rate' => $completionRate,
            'overdue_tasks' => $overdueTasks,
            'projects' => $projects,
            'teams' => $teams,
            'overdue_list' => $overdueList,
            'recent_tasks' => $recentTasks,
        ]);
    }

    /**
     * Team performance report with overview, teams, members, workload, and open tasks.
     */
    public function performanceReport(Request $request)
    {
        $totalAssigned = Task::count();
        $totalCompleted = Task::whereIn('status', ['completed', 'done'])->count();
        $totalPending = Task::whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $totalOverdue = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $completionRate = $totalAssigned > 0 ? (int) round(($totalCompleted / $totalAssigned) * 100) : 0;

        // Team performance
        $teams = \App\Models\Team::withCount(['members as member_count'])
            ->get()
            ->map(function ($team) {
                $memberIds = $team->members()->pluck('users.id');
                $total = Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))->count();
                $done = Task::whereHas('assignees', fn ($q) => $q->whereIn('users.id', $memberIds))
                    ->whereIn('status', ['completed', 'done'])->count();
                return [
                    'name' => $team->name,
                    'members' => $team->member_count,
                    'completed_tasks' => $done,
                    'total_tasks' => $total,
                    'completion_rate' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
                ];
            });

        // Member performance
        $members = User::where('active', true)
            ->select('id', 'name', 'role')
            ->orderBy('name')
            ->get()
            ->map(function ($member) {
                $assigned = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $member->id))->count();
                $completed = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $member->id))
                    ->whereIn('status', ['completed', 'done'])->count();
                $pending = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $member->id))
                    ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
                return [
                    'name' => $member->name,
                    'assigned' => $assigned,
                    'completed' => $completed,
                    'pending' => $pending,
                    'completion_rate' => $assigned > 0 ? (int) round(($completed / $assigned) * 100) : 0,
                ];
            })
            ->filter(fn ($m) => $m['assigned'] > 0)
            ->values();

        // Open tasks & risks (overdue tasks)
        $openTasks = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->with('assignees:id,name')
            ->orderBy('end_date')
            ->limit(10)
            ->get()
            ->map(function ($t) {
                $assignee = $t->assignees->pluck('name')->join(', ') ?: '—';
                $daysLate = now()->diffInDays($t->end_date);
                return [
                    'title' => $t->title,
                    'assignee' => $assignee,
                    'priority' => $t->priority ?? 'Medium',
                    'days_late' => $daysLate,
                ];
            });

        return response()->json([
            'overview' => [
                'assigned' => $totalAssigned,
                'completed' => $totalCompleted,
                'pending' => $totalPending,
                'overdue' => $totalOverdue,
                'completion_rate' => $completionRate,
            ],
            'teams' => $teams,
            'members' => $members,
            'open_tasks' => $openTasks,
        ]);
    }

    /**
     * Project progress report with overview, completion donut, milestones, workload, and open tasks.
     */
    public function progressReport(Request $request)
    {
        $totalAssigned = Task::count();
        $totalCompleted = Task::whereIn('status', ['completed', 'done'])->count();
        $totalPending = Task::whereNotIn('status', ['completed', 'done', 'abandoned'])->count();
        $totalOverdue = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])->count();

        // Top project for overview
        $topProject = Project::withCount(['tasks as total_tasks', 'tasks as completed_tasks' => function ($q) {
            $q->whereIn('status', ['done', 'completed']);
        }])
            ->with(['creator:id,name', 'team:id,name,leader_id'])
            ->latest()
            ->first();

        $projectOverview = null;
        if ($topProject) {
            $memberCount = is_array($topProject->assigned_users) ? count($topProject->assigned_users) : 0;
            $projectOverview = [
                'name' => $topProject->title,
                'client' => $topProject->client_name ?? '—',
                'team_lead' => $topProject->creator?->name ?? '—',
                'members' => $memberCount,
                'start_date' => $topProject->start_date,
                'end_date' => $topProject->end_date,
            ];
        }

        // Member workload (all members with tasks)
        $members = User::where('active', true)
            ->select('id', 'name')
            ->orderBy('name')
            ->get()
            ->map(function ($member) {
                $assigned = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $member->id))->count();
                return ['name' => $member->name, 'assigned' => $assigned];
            })
            ->filter(fn ($m) => $m['assigned'] > 0)
            ->values();

        // Milestones from top project
        $milestones = [];
        if ($topProject) {
            $milestones = $topProject->milestones()->limit(10)->get()->map(function ($m) {
                return [
                    'title' => $m->title ?? '—',
                    'status' => $m->status ?? 'Pending',
                    'target_date' => $m->due_date ?? null,
                    'due_date' => $m->due_date ?? null,
                ];
            })->toArray();
        }

        // Open tasks & risks
        $openTasks = Task::where('end_date', '<', now())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->with('assignees:id,name')
            ->orderBy('end_date')
            ->limit(10)
            ->get()
            ->map(function ($t) {
                $assignee = $t->assignees->pluck('name')->join(', ') ?: '—';
                $daysLate = now()->diffInDays($t->end_date);
                return [
                    'title' => $t->title,
                    'assignee' => $assignee,
                    'priority' => $t->priority ?? 'Medium',
                    'days_late' => $daysLate,
                ];
            });

        return response()->json([
            'overview' => [
                'assigned' => $totalAssigned,
                'completed' => $totalCompleted,
                'pending' => $totalPending,
                'overdue' => $totalOverdue,
            ],
            'project' => $projectOverview,
            'members' => $members,
            'milestones' => $milestones,
            'open_tasks' => $openTasks,
        ]);
    }
}
