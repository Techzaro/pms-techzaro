<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Team;
use App\Models\Deliverable;
use App\Models\TaskWorkflowEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Controller for generating various reports and analytics.
 * Provides team performance, individual user performance, project reports,
 * summary cards, detailed breakdowns, and company-wide employee reports.
 * Results are cached to reduce database load on repeated requests.
 */
class ReportController extends Controller
{
    /**
     * Get team performance report with task stats per member.
     *
     * Team leads only see members from their teams and tasks they assigned.
     * Supports time period filtering (today, week, month, all).
     *
     * @param  \Illuminate\Http\Request  $request  Query parameter: period (today|week|month|all).
     * @return \Illuminate\Http\JsonResponse  JSON response with team summary and per-member stats.
     */
    public function teamPerformance(Request $request)
    {
        $user = $request->user();
        $timeFilter = $request->query('period', 'all');
        $cacheKey = "report_team_perf_{$user->id}_{$timeFilter}";

        return Cache::remember($cacheKey, 300, function () use ($user, $timeFilter) {
            $isTeamLead = $user->role === 'team_lead' || $user->role === 'teamlead';
            
            $query = User::select('id', 'name', 'email', 'role')
                ->where('active', true)
                ->orderBy('name');

            if ($isTeamLead) {
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

            // Bulk load task stats per user - only tasks assigned BY the team lead
            $taskStatsQuery = Task::selectRaw('
                assignees_users.user_id,
                COUNT(*) as assigned,
                SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed
            ')
                ->join('task_user as assignees_users', 'tasks.id', '=', 'assignees_users.task_id')
                ->whereIn('assignees_users.user_id', $memberIds);

            // For team_lead, only count tasks they assigned
            if ($isTeamLead) {
                $taskStatsQuery->where('tasks.assigned_by', $user->id);
            }

            $taskStats = $taskStatsQuery
                ->when($timeFilter !== 'all', fn ($q) => $this->applyTimeFilter($q, $timeFilter))
                ->groupBy('assignees_users.user_id')
                ->get()
                ->keyBy('user_id');

            // Bulk load project names per user - only projects created BY the team lead
            $userProjectsQuery = Task::select('assignees_users.user_id', 'projects.title')
                ->join('task_user as assignees_users', 'tasks.id', '=', 'assignees_users.task_id')
                ->join('projects', 'tasks.project_id', '=', 'projects.id')
                ->whereIn('assignees_users.user_id', $memberIds);

            // For team_lead, only count tasks from projects they created
            if ($isTeamLead) {
                $userProjectsQuery->where('projects.created_by', $user->id);
            }

            $userProjects = $userProjectsQuery
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

    /**
     * Get detailed performance report for a specific user.
     *
     * Includes task stats, project-as-task stats, deliverable summary,
     * recent tasks, and project breakdowns. Team leads viewing members
     * only see tasks they assigned and projects they created.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameter: period (today|week|month|all).
     * @param  \App\Models\User  $user  The user to generate the report for.
     * @return \Illuminate\Http\JsonResponse  JSON response with user profile, stats, deliverables, and projects.
     */
    public function userPerformance(Request $request, User $user)
    {
        $requestingUser = $request->user();
        $timeFilter = $request->query('period', 'all');
        $isTeamLeadViewingMember = ($requestingUser->role === 'team_lead' || $requestingUser->role === 'teamlead') 
            && $requestingUser->id !== $user->id;

        // --- TASKS ASSIGNED TO USER ---
        $taskBase = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id));
        
        // If team lead is viewing member, only show tasks assigned BY the team lead
        if ($isTeamLeadViewingMember) {
            $taskBase->where('tasks.assigned_by', $requestingUser->id);
        }
        
        if ($timeFilter !== 'all') $taskBase = $this->applyTimeFilter($taskBase, $timeFilter);

        $taskIds = (clone $taskBase)->pluck('id');

        // Single aggregated stats query for tasks
        $taskAgg = $taskIds->isNotEmpty()
            ? Task::selectRaw("
                COUNT(*) as assigned,
                SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('submitted','reopened') THEN 1 ELSE 0 END) as in_review,
                SUM(CASE WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue
            ")->whereIn('id', $taskIds)->first()
            : (object)['assigned' => 0, 'completed' => 0, 'in_review' => 0, 'overdue' => 0];

        // Task status breakdown
        $taskStatusBreakdown = $taskIds->isNotEmpty()
            ? Task::selectRaw("status, COUNT(*) as count")
                ->whereIn('id', $taskIds)->groupBy('status')->get()
            : collect();

        // --- PROJECTS ASSIGNED AS TASKS ---
        $projectQuery = Project::whereJsonContains('assigned_users', $user->id)
            ->whereNotNull('assigned_users');
        
        // If team lead is viewing member, only show projects created BY the team lead
        if ($isTeamLeadViewingMember) {
            $projectQuery->where('projects.created_by', $requestingUser->id);
        }
        
        if ($timeFilter !== 'all') {
            $this->applyTimeFilter($projectQuery, $timeFilter);
        }
        $projectAsTaskStats = $projectQuery->selectRaw("
            COUNT(*) as assigned,
            SUM(CASE WHEN status IN ('approved','completed','done') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status IN ('submitted','reopened') THEN 1 ELSE 0 END) as in_review,
            SUM(CASE WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue
        ")->first();

        // Project-as-task status breakdown (mapped to task statuses)
        $projectAsTaskBreakdown = $projectQuery->selectRaw("
            CASE
                WHEN status IN ('approved','completed','done') THEN 'completed'
                WHEN status IN ('submitted','reopened') THEN 'submitted'
                WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 'overdue'
                ELSE 'pending'
            END as mapped_status,
            COUNT(*) as count
        ")->groupBy('mapped_status')->get();

        // --- MERGE TASK + PROJECT-AS-TASK COUNTS ---
        $assigned = (int) $taskAgg->assigned + (int) $projectAsTaskStats->assigned;
        $completed = (int) $taskAgg->completed + (int) $projectAsTaskStats->completed;
        $inReview = (int) $taskAgg->in_review + (int) $projectAsTaskStats->in_review;
        $overdue = (int) $taskAgg->overdue + (int) $projectAsTaskStats->overdue;
        $pending = max($assigned - $completed - $inReview - $overdue, 0);

        // Merge status breakdowns
        $mergedBreakdown = ['completed' => $completed, 'pending' => $pending, 'in_review' => $inReview, 'overdue' => $overdue, 'total' => $assigned];

        // --- RECENT TASKS (tasks + project-as-task items) ---
        $recentTasks = (clone $taskBase)
            ->with('project:id,title')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'project' => $t->project?->title ?? '—',
                'status' => $t->status,
                'priority' => $t->priority ?? 'Medium',
                'end_date' => $t->end_date,
                'item_type' => 'task',
            ]);

        $recentProjectTasks = $projectQuery->latest()->limit(10)->get()
            ->map(fn ($p) => [
                'id' => 'proj_' . $p->id,
                'title' => $p->title,
                'project' => $p->title,
                'status' => $p->status,
                'priority' => $p->priority ?? 'Medium',
                'end_date' => $p->end_date,
                'item_type' => 'project',
            ]);

        $allRecentTasks = collect($recentTasks)->merge(collect($recentProjectTasks))
            ->sortByDesc('end_date')
            ->take(10)
            ->values();

        // --- PROJECTS WITH TASK COUNTS (projects tab) ---
        $projectStats = (clone $taskBase)
            ->join('projects', 'projects.id', '=', 'tasks.project_id')
            ->select(
                'projects.id as project_id', 'projects.title as project_title', 'projects.status as project_status',
                'projects.start_date', 'projects.end_date',
                DB::raw('COUNT(*) as total_tasks'),
                DB::raw('SUM(CASE WHEN tasks.status IN ("completed","done","approved") THEN 1 ELSE 0 END) as completed_tasks')
            )
            ->groupBy('projects.id', 'projects.title', 'projects.status', 'projects.start_date', 'projects.end_date')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->project_id,
                'name' => $p->project_title,
                'status' => $p->project_status,
                'start_date' => $p->start_date,
                'end_date' => $p->end_date,
                'total_tasks' => (int) $p->total_tasks,
                'completed_tasks' => (int) $p->completed_tasks,
                'progress' => $p->total_tasks > 0 ? (int) round(($p->completed_tasks / $p->total_tasks) * 100) : 0,
            ]);

        // Also include projects assigned directly as tasks (not via tasks table)
        $directProjectStatsQuery = Project::whereJsonContains('assigned_users', $user->id)
            ->whereNotNull('assigned_users');
        
        // If team lead is viewing member, only show projects created BY the team lead
        if ($isTeamLeadViewingMember) {
            $directProjectStatsQuery->where('projects.created_by', $requestingUser->id);
        }
        
        $directProjectStats = $directProjectStatsQuery
            ->select('id', 'title', 'status', 'start_date', 'end_date')
            ->get()
            ->filter(fn ($p) => !$projectStats->contains('id', $p->id))
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->title,
                'status' => $p->status,
                'start_date' => $p->start_date,
                'end_date' => $p->end_date,
                'total_tasks' => 0,
                'completed_tasks' => 0,
                'progress' => 0,
            ]);

        $allProjects = collect($projectStats)->merge(collect($directProjectStats))->values();

        // Build status distribution from task breakdown + project breakdown
        $statusDistribution = [
            'approved' => $completed,
            'pending' => $pending,
            'submitted' => 0,
            'reopened' => 0,
            'rejected' => 0,
            'overdue' => $overdue,
        ];
        foreach ($taskStatusBreakdown as $ts) {
            $s = strtolower($ts->status);
            if (isset($statusDistribution[$s])) {
                // already counted via merged logic
            } elseif ($s === 'submitted') {
                $statusDistribution['submitted'] = $ts->count;
            } elseif ($s === 'reopened') {
                $statusDistribution['reopened'] = $ts->count;
            } elseif ($s === 'rejected') {
                $statusDistribution['rejected'] = $ts->count;
            }
        }

        // --- PRIORITY DISTRIBUTION (user's tasks + project-as-tasks) ---
        $priorityStats = $taskIds->isNotEmpty()
            ? Task::selectRaw("
                SUM(CASE WHEN `priority` = 'high' THEN 1 ELSE 0 END) as p_high,
                SUM(CASE WHEN `priority` = 'medium' THEN 1 ELSE 0 END) as p_medium,
                SUM(CASE WHEN `priority` = 'low' THEN 1 ELSE 0 END) as p_low
            ")->whereIn('id', $taskIds)->first()
            : (object)['p_high' => 0, 'p_medium' => 0, 'p_low' => 0];

        $projectPriorityStatsResult = (clone $projectQuery)->selectRaw("
            SUM(CASE WHEN `priority` = 'high' THEN 1 ELSE 0 END) as p_high,
            SUM(CASE WHEN `priority` = 'medium' THEN 1 ELSE 0 END) as p_medium,
            SUM(CASE WHEN `priority` = 'low' THEN 1 ELSE 0 END) as p_low
        ")->first();
        $projectPriorityStats = $projectPriorityStatsResult ?: (object)['p_high' => 0, 'p_medium' => 0, 'p_low' => 0];

        $priorityDistribution = [
            'high' => (int) $priorityStats->p_high + (int) $projectPriorityStats->p_high,
            'medium' => (int) $priorityStats->p_medium + (int) $projectPriorityStats->p_medium,
            'low' => (int) $priorityStats->p_low + (int) $projectPriorityStats->p_low,
        ];

        $team = $user->teams()->first();

        // --- DELIVERABLES ---
        $deliverableQuery = Deliverable::where('assigned_to', $user->id);
        
        // If team lead is viewing member, only show deliverables created BY the team lead
        if ($isTeamLeadViewingMember) {
            $deliverableQuery->where('deliverables.created_by', $requestingUser->id);
        }
        
        $deliverableStats = (clone $deliverableQuery)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submitted,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_review,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN status = 'reopened' THEN 1 ELSE 0 END) as reopened
            ")->first();

        $deliverables = (clone $deliverableQuery)
            ->with('task:id,title', 'project:id,title')
            ->latest()
            ->get()
            ->map(fn ($d) => [
                'id' => $d->id,
                'title' => $d->title,
                'task' => $d->task?->title ?? null,
                'project' => $d->project?->title ?? null,
                'status' => $d->status,
                'submitted_at' => $d->submitted_at,
                'approved_at' => $d->approved_at,
            ]);

        // Reporting To (team leader)
        $reportingTo = null;
        if ($team) {
            $leader = $team->leader;
            $reportingTo = $leader ? $leader->name : null;
        }

        // --- WORKLOAD BY DAY ---
        $workloadPeriod = $request->query('workload_period', 'week');
        if ($workloadPeriod === 'month') {
            $workloadStart = now()->startOfMonth();
            $workloadEnd = now()->endOfMonth();
        } elseif ($workloadPeriod === 'last_week') {
            $workloadStart = now()->subWeek()->startOfWeek();
            $workloadEnd = now()->subWeek()->endOfWeek();
        } else {
            $workloadStart = now()->startOfWeek();
            $workloadEnd = now()->endOfWeek();
        }

        $workloadData = [['day' => 'Mon', 'count' => 0], ['day' => 'Tue', 'count' => 0], ['day' => 'Wed', 'count' => 0], ['day' => 'Thu', 'count' => 0], ['day' => 'Fri', 'count' => 0], ['day' => 'Sat', 'count' => 0], ['day' => 'Sun', 'count' => 0]];

        if ($taskIds->isNotEmpty()) {
            $workflowEvents = TaskWorkflowEvent::whereIn('task_id', $taskIds)
                ->whereBetween('created_at', [$workloadStart, $workloadEnd])
                ->selectRaw("DAYNAME(created_at) as day_name, COUNT(*) as count")
                ->groupBy('day_name')
                ->get()
                ->keyBy('day_name');

            $dayMap = ['Mon' => 'Monday', 'Tue' => 'Tuesday', 'Wed' => 'Wednesday', 'Thu' => 'Thursday', 'Fri' => 'Friday', 'Sat' => 'Saturday', 'Sun' => 'Sunday'];
            foreach ($workloadData as &$w) {
                $fullDay = $dayMap[$w['day']] ?? $w['day'];
                $w['count'] = (int) ($workflowEvents->get($fullDay)?->count ?? 0);
            }
        }

        $counts = array_column($workloadData, 'count');
        $maxWorkload = max($counts) > 0 ? max($counts) : 1;
        foreach ($workloadData as &$w) {
            $w['percent'] = (int) round(($w['count'] / $maxWorkload) * 100);
        }

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'employee_id' => $user->employee_id ?? 'EMP-' . str_pad($user->id, 4, '0', STR_PAD_LEFT),
                'team' => $team?->name ?? null,
                'reporting_to' => $reportingTo,
            ],
            'summary' => [
                'total_assigned' => $assigned,
                'approved' => $completed,
                'pending' => $pending,
                'overdue' => $overdue,
            ],
            'status_breakdown' => $mergedBreakdown,
            'status_distribution' => $statusDistribution,
            'priority_distribution' => $priorityDistribution,
            'workload' => $workloadData,
            'deliverable_summary' => [
                'total' => (int) $deliverableStats->total,
                'submitted' => (int) $deliverableStats->submitted,
                'approved' => (int) $deliverableStats->approved,
                'pending_review' => (int) $deliverableStats->pending_review,
                'rejected' => (int) $deliverableStats->rejected,
                'reopened' => (int) $deliverableStats->reopened,
            ],
            'deliverables' => $deliverables,
            'recent_tasks' => $allRecentTasks,
            'projects' => $allProjects,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /**
     * Get a report for a specific project including task completion and per-assignee breakdown.
     *
     * @param  \App\Models\Project  $project  The project to generate the report for.
     * @return \Illuminate\Http\JsonResponse  JSON response with project summary, per-assignee stats, and tasks.
     */
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

    /**
     * Get an organization-wide summary report.
     *
     * Returns total teams, active projects, task completion stats, overdue tasks,
     * and the top 10 projects by recency.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with summary stats and top projects.
     */
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

    /**
     * Get a detailed report including project breakdown, team stats, overdue tasks, and recent tasks.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with detailed stats, projects, teams, and overdue list.
     */
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

            $teams = $this->getTeamsWithTaskStats();

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

    /**
     * Get a performance report with team stats, member completion rates, and open overdue tasks.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with overview, teams, members, and open tasks.
     */
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

            $teams = $this->getTeamsWithTaskStats();

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

    /**
     * Get a progress report with top project overview, member workload, milestones, and overdue tasks.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with overview, project details, members, and milestones.
     */
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

    /**
     * Get summary card data (total assigned, approved, pending, overdue) for the dashboard.
     *
     * Supports role-based filtering and team view for team leads.
     * Merges task and project-as-task counts.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: period, view (self|team).
     * @return \Illuminate\Http\JsonResponse  JSON response with summary card stats.
     */
    public function summaryCards(Request $request)
    {
        $user = $request->user();
        $timeFilter = $request->query('period', 'all');
        $view = $request->query('view', 'self'); // 'self' or 'team'
        $role = $user->role === 'teamlead' ? 'team_lead' : $user->role;

        // For team_lead viewing 'team' tab, get stats for team members
        $isTeamView = ($role === 'team_lead' && $view === 'team');
        
        if ($isTeamView) {
            // Get team member IDs for team_lead
            $teamIds = DB::table('team_user')
                ->join('teams', 'teams.id', '=', 'team_user.team_id')
                ->where('teams.leader_id', $user->id)
                ->pluck('team_user.team_id');

            $memberIds = DB::table('team_user')
                ->whereIn('team_id', $teamIds)
                ->pluck('user_id')
                ->toArray();
        }

        // --- TASKS ---
        $taskQuery = Task::query();
        switch ($role) {
            case 'admin':
            case 'manager':
                break;
            case 'team_lead':
                if ($isTeamView) {
                    // Get tasks assigned BY team lead TO team members
                    $taskQuery->whereIn('assigned_to', $memberIds)
                        ->where('assigned_by', $user->id);
                } else {
                    $taskQuery->where('assigned_to', $user->id);
                }
                break;
            case 'member':
                $taskQuery->where('assigned_to', $user->id);
                break;
        }
        if ($timeFilter !== 'all') {
            $this->applyTimeFilter($taskQuery, $timeFilter);
        }
        $taskStats = $taskQuery->selectRaw("
            COUNT(*) as total_assigned,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue,
            SUM(CASE WHEN `priority` = 'high' THEN 1 ELSE 0 END) as p_high,
            SUM(CASE WHEN `priority` = 'medium' THEN 1 ELSE 0 END) as p_medium,
            SUM(CASE WHEN `priority` = 'low' THEN 1 ELSE 0 END) as p_low
        ")->first();

        // --- PROJECTS ASSIGNED AS TASKS ---
        $projectQuery = Project::whereNotNull('assigned_users');
        switch ($role) {
            case 'admin':
            case 'manager':
                $projectQuery->whereRaw('JSON_LENGTH(assigned_users) > 0');
                break;
            case 'team_lead':
                if ($isTeamView) {
                    // Get projects created BY team lead where team members are assigned
                    $projectQuery->where('created_by', $user->id)
                        ->where(function ($q) use ($memberIds) {
                            foreach ($memberIds as $memberId) {
                                $q->orWhereJsonContains('assigned_users', $memberId);
                            }
                        });
                } else {
                    $projectQuery->whereJsonContains('assigned_users', $user->id);
                }
                break;
            case 'member':
                $projectQuery->whereJsonContains('assigned_users', $user->id);
                break;
        }
        if ($timeFilter !== 'all') {
            $this->applyTimeFilter($projectQuery, $timeFilter);
        }
        $projectStats = $projectQuery->selectRaw("
            COUNT(*) as total_assigned,
            SUM(CASE WHEN status IN ('approved','completed','done') THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue,
            SUM(CASE WHEN `priority` = 'high' THEN 1 ELSE 0 END) as p_high,
            SUM(CASE WHEN `priority` = 'medium' THEN 1 ELSE 0 END) as p_medium,
            SUM(CASE WHEN `priority` = 'low' THEN 1 ELSE 0 END) as p_low
        ")->first();

        // Merge task + project-as-task counts
        $totalAssigned = (int) $taskStats->total_assigned + (int) $projectStats->total_assigned;
        $approved = (int) $taskStats->approved + (int) $projectStats->approved;
        $pending = max($totalAssigned - $approved, 0);
        $overdue = (int) $taskStats->overdue + (int) $projectStats->overdue;
        $highPriority = (int) $taskStats->p_high + (int) $projectStats->p_high;
        $mediumPriority = (int) $taskStats->p_medium + (int) $projectStats->p_medium;
        $lowPriority = (int) $taskStats->p_low + (int) $projectStats->p_low;

        return response()->json([
            'total_assigned' => $totalAssigned,
            'approved' => $approved,
            'pending' => $pending,
            'overdue' => $overdue,
            'high_priority' => $highPriority,
            'medium_priority' => $mediumPriority,
            'low_priority' => $lowPriority,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /**
     * Get a table of user performance stats (assigned, completed, pending, overdue) for all active users.
     *
     * Team leads only see members from their teams. Merges task and project-as-task counts.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameter: period.
     * @return \Illuminate\Http\JsonResponse  JSON response with per-user performance stats.
     */
    public function userPerformanceTable(Request $request)
    {
        $user = $request->user();
        $timeFilter = $request->query('period', 'all');

        // For team_lead, only show members from their teams
        if ($user->role === 'team_lead' || $user->role === 'teamlead') {
            $teamIds = DB::table('team_user')
                ->join('teams', 'teams.id', '=', 'team_user.team_id')
                ->where('teams.leader_id', $user->id)
                ->pluck('team_user.team_id');

            $memberIds = DB::table('team_user')
                ->whereIn('team_id', $teamIds)
                ->pluck('user_id')
                ->toArray();
            
            // Exclude team lead themselves from the list
            $memberIds = array_filter($memberIds, fn($id) => $id != $user->id);
        }

        // --- TASK STATS PER USER (from tasks table via task_user pivot) ---
        $isTeamLead = $user->role === 'team_lead' || $user->role === 'teamlead';
        
        $taskQuery = User::query()
            ->select('users.id', 'users.name', 'users.role')
            ->where('users.active', true)
            ->leftJoin('task_user', 'users.id', '=', 'task_user.user_id')
            ->leftJoin('tasks', 'tasks.id', '=', 'task_user.task_id');

        if ($timeFilter !== 'all') {
            $this->applyTimeFilter($taskQuery, $timeFilter);
        }

        // Filter by team members for team_lead
        if ($isTeamLead) {
            $taskQuery->whereIn('users.id', $memberIds)
                ->where('tasks.assigned_by', $user->id);
        }

        $taskStats = $taskQuery->addSelect(DB::raw("
            COUNT(task_user.task_id) as assigned,
            SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN tasks.end_date < NOW() AND tasks.status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue
        "))
            ->groupBy('users.id', 'users.name', 'users.role')
            ->get()
            ->keyBy('id');

        // --- PROJECT-AS-TASK STATS PER USER — single query instead of N+1 ---
        $allUsers = User::where('active', true)->select('id', 'name', 'role');
        
        // Filter by team members for team_lead
        if ($isTeamLead) {
            $allUsers->whereIn('users.id', $memberIds);
        }
        
        $allUsers = $allUsers->orderBy('name')->get();
        $projectStats = $this->getProjectAsTaskStatsForTeamLead($allUsers->pluck('id'), $timeFilter, $isTeamLead ? $user->id : null);

        // --- MERGE TASK + PROJECT-AS-TASK COUNTS ---
        $stats = $allUsers->map(function ($user) use ($taskStats, $projectStats) {
            $ts = $taskStats->get($user->id);
            $ps = $projectStats->get($user->id);

            $assigned = (int) ($ts->assigned ?? 0) + (int) ($ps->assigned ?? 0);
            $completed = (int) ($ts->completed ?? 0) + (int) ($ps->completed ?? 0);
            $overdue = (int) ($ts->overdue ?? 0) + (int) ($ps->overdue ?? 0);
            $pending = max($assigned - $completed, 0);

            return [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'assigned' => $assigned,
                'completed' => $completed,
                'pending' => $pending,
                'overdue' => $overdue,
            ];
        })->values();

        return response()->json($stats)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /**
     * Get a company-wide employee report with per-employee stats, team summaries, status distribution, and weekly trend.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameter: period.
     * @return \Illuminate\Http\JsonResponse  JSON response with overview, employees, teams, distribution, and trend data.
     */
    public function companyEmployeesReport(Request $request)
    {
        $timeFilter = $request->query('period', 'all');

        $allUsers = User::where('active', true)->select('id', 'name', 'role')->orderBy('name')->get();
        $totalEmployees = $allUsers->count();

        // --- TASK STATS PER USER ---
        $taskQuery = User::query()
            ->select('users.id', 'users.name', 'users.role')
            ->where('users.active', true)
            ->leftJoin('task_user', 'users.id', '=', 'task_user.user_id')
            ->leftJoin('tasks', 'tasks.id', '=', 'task_user.task_id');

        if ($timeFilter !== 'all') {
            $this->applyTimeFilter($taskQuery, $timeFilter);
        }

        $taskStats = $taskQuery->addSelect(DB::raw("
            COUNT(task_user.task_id) as assigned,
            SUM(CASE WHEN tasks.status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN tasks.end_date < NOW() AND tasks.status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue
        "))
            ->groupBy('users.id', 'users.name', 'users.role')
            ->get()
            ->keyBy('id');

        // --- PROJECT-AS-TASK STATS PER USER — single query instead of N+1 ---
        $projectStats = $this->getProjectAsTaskStats($allUsers->pluck('id'), $timeFilter);

        // --- MERGE TASK + PROJECT-AS-TASK COUNTS PER USER ---
        $employeeStats = $allUsers->map(function ($user) use ($taskStats, $projectStats) {
            $ts = $taskStats->get($user->id);
            $ps = $projectStats->get($user->id);

            $assigned = (int) ($ts->assigned ?? 0) + (int) ($ps->assigned ?? 0);
            $completed = (int) ($ts->completed ?? 0) + (int) ($ps->completed ?? 0);
            $overdue = (int) ($ts->overdue ?? 0) + (int) ($ps->overdue ?? 0);
            $pending = max($assigned - $completed, 0);
            $completionRate = $assigned > 0 ? (int) round(($completed / $assigned) * 100) : 0;

            return [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'assigned' => $assigned,
                'completed' => $completed,
                'pending' => $pending,
                'overdue' => $overdue,
                'completion_rate' => $completionRate,
            ];
        });

        $totalAssigned = $employeeStats->sum('assigned');
        $totalCompleted = $employeeStats->sum('completed');
        $totalPending = $employeeStats->sum('pending');
        $totalOverdue = $employeeStats->sum('overdue');

        // --- STATUS DISTRIBUTION (OVERALL) ---
        $statusDistribution = Task::selectRaw("
            SUM(CASE WHEN status IN ('completed','done','approved') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status IN ('pending','assigned') THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status IN ('submitted','reopened') THEN 1 ELSE 0 END) as in_review,
            SUM(CASE WHEN end_date < NOW() AND status NOT IN ('completed','done','abandoned','approved') THEN 1 ELSE 0 END) as overdue
        ")->first();

        // --- PRIORITY DISTRIBUTION (OVERALL) ---
        $priorityDistribution = Task::selectRaw("
            SUM(CASE WHEN `priority` = 'high' THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN `priority` = 'medium' THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN `priority` = 'low' THEN 1 ELSE 0 END) as low
        ")->first();

        // --- TEAM WISE SUMMARY (bulk-loaded, 2 total queries instead of 2N) ---
        $teams = $this->getTeamsWithTaskStats($timeFilter)->map(function ($t) {
            return [
                'name' => $t['name'],
                'members' => $t['members'],
                'assigned' => $t['total_tasks'],
                'completed' => $t['completed_tasks'],
                'pending' => max($t['total_tasks'] - $t['completed_tasks'], 0),
                'overdue' => 0,
                'completion_rate' => $t['completion_rate'],
            ];
        });

        // --- TASKS TREND (weekly data by day of week) ---
        $weekStart = now()->startOfWeek();
        $tasksTrend = Task::where('created_at', '>=', $weekStart)
            ->selectRaw("DAYNAME(created_at) as day_name, COUNT(*) as count")
            ->groupBy('day_name')
            ->get()
            ->pluck('count', 'day_name')
            ->toArray();

        $dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        $trendData = collect($dayOrder)->map(fn ($d) => $tasksTrend[$d] ?? 0)->values();

        return response()->json([
            'overview' => [
                'total_employees' => $totalEmployees,
                'company_name' => 'Techxaro Solutions',
            ],
            'summary' => [
                'total_assigned' => $totalAssigned,
                'completed' => $totalCompleted,
                'pending' => $totalPending,
                'overdue' => $totalOverdue,
            ],
            'employees' => $employeeStats->values(),
            'status_distribution' => [
                'completed' => (int) ($statusDistribution->completed ?? 0),
                'pending' => (int) ($statusDistribution->pending ?? 0),
                'in_review' => (int) ($statusDistribution->in_review ?? 0),
                'overdue' => (int) ($statusDistribution->overdue ?? 0),
                'total' => $totalAssigned,
            ],
            'priority_distribution' => [
                'high' => (int) ($priorityDistribution->high ?? 0),
                'medium' => (int) ($priorityDistribution->medium ?? 0),
                'low' => (int) ($priorityDistribution->low ?? 0),
            ],
            'teams' => $teams,
            'tasks_trend' => $trendData,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /**
     * Apply a time period filter to a query.
     *
     * @param  \Illuminate\Database\Eloquent\Builder|\Illuminate\Database\Query\Builder  $query  The query to filter.
     * @param  string  $period  The period filter: 'today', 'week', 'month', or 'all'.
     * @return mixed  The filtered query.
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
     * Bulk compute project-as-task stats for all user IDs in a single pass.
     * Replaces N+1 pattern where one query ran per user.
     */
    private function getProjectAsTaskStats($userIds, string $timeFilter): \Illuminate\Support\Collection
    {
        $results = collect();
        $allProjects = Project::whereNotNull('assigned_users')
            ->when($timeFilter !== 'all', fn ($q) => $this->applyTimeFilter($q, $timeFilter))
            ->select('id', 'assigned_users', 'status', 'end_date', 'created_at')
            ->get();

        foreach ($userIds as $uid) {
            $assigned = 0; $completed = 0; $overdue = 0;
            foreach ($allProjects as $p) {
                $ids = is_string($p->assigned_users) ? json_decode($p->assigned_users, true) ?? [] : ($p->assigned_users ?? []);
                if (!in_array((int) $uid, array_map('intval', $ids), true)) continue;
                $assigned++;
                if (in_array(strtolower((string) $p->status), ['approved', 'completed', 'done'])) $completed++;
                if ($p->end_date && now()->greaterThan($p->end_date) && !in_array(strtolower((string) $p->status), ['completed', 'done', 'abandoned', 'approved'])) $overdue++;
            }
            $results->put($uid, (object)['assigned' => $assigned, 'completed' => $completed, 'overdue' => $overdue]);
        }

        return $results;
    }

    /**
     * Bulk compute project-as-task stats for team lead - only projects created by the team lead.
     */
    private function getProjectAsTaskStatsForTeamLead($userIds, string $timeFilter, ?int $teamLeadId = null): \Illuminate\Support\Collection
    {
        $results = collect();
        
        if (!$teamLeadId) {
            return $this->getProjectAsTaskStats($userIds, $timeFilter);
        }
        
        // Only get projects created by the team lead
        $allProjects = Project::whereNotNull('assigned_users')
            ->where('created_by', $teamLeadId)
            ->when($timeFilter !== 'all', fn ($q) => $this->applyTimeFilter($q, $timeFilter))
            ->select('id', 'assigned_users', 'status', 'end_date', 'created_at')
            ->get();

        foreach ($userIds as $uid) {
            $assigned = 0; $completed = 0; $overdue = 0;
            foreach ($allProjects as $p) {
                $ids = is_string($p->assigned_users) ? json_decode($p->assigned_users, true) ?? [] : ($p->assigned_users ?? []);
                if (!in_array((int) $uid, array_map('intval', $ids), true)) continue;
                $assigned++;
                if (in_array(strtolower((string) $p->status), ['approved', 'completed', 'done'])) $completed++;
                if ($p->end_date && now()->greaterThan($p->end_date) && !in_array(strtolower((string) $p->status), ['completed', 'done', 'abandoned', 'approved'])) $overdue++;
            }
            $results->put($uid, (object)['assigned' => $assigned, 'completed' => $completed, 'overdue' => $overdue]);
        }

        return $results;
    }

    /**
     * Bulk compute team task stats in 2 queries instead of N+1 per team.
     */
    private function getTeamsWithTaskStats(string $timeFilter = 'all'): \Illuminate\Support\Collection
    {
        $teams = Team::with('members:id')->withCount(['members as member_count'])->get();

        $teamMemberMap = [];
        foreach ($teams as $team) {
            $teamMemberMap[$team->id] = $team->members->pluck('id')->toArray();
        }

        $allMemberIds = collect($teamMemberMap)->flatten()->unique()->toArray();
        $userTaskCounts = [];
        if (!empty($allMemberIds)) {
            $query = DB::table('task_user')
                ->join('tasks', 'tasks.id', '=', 'task_user.task_id')
                ->whereIn('task_user.user_id', $allMemberIds);

            if ($timeFilter !== 'all') {
                $query->where('tasks.created_at', '>=', match ($timeFilter) {
                    'today' => today(),
                    'week' => now()->startOfWeek(),
                    'month' => now()->startOfMonth(),
                    'quarter' => now()->startOfQuarter(),
                    'year' => now()->startOfYear(),
                    default => now()->subDays((int) $timeFilter),
                });
            }

            $rows = $query->selectRaw('task_user.user_id, COUNT(*) as total, SUM(CASE WHEN tasks.status IN ("completed","done") THEN 1 ELSE 0 END) as completed')
                ->groupBy('task_user.user_id')
                ->get();
            foreach ($rows as $r) {
                $userTaskCounts[$r->user_id] = ['total' => (int) $r->total, 'completed' => (int) $r->completed];
            }
        }

        return $teams->map(function ($team) use ($teamMemberMap, $userTaskCounts) {
            $memberIds = $teamMemberMap[$team->id] ?? [];
            $total = 0; $completed = 0;
            foreach ($memberIds as $uid) {
                if (isset($userTaskCounts[$uid])) {
                    $total += $userTaskCounts[$uid]['total'];
                    $completed += $userTaskCounts[$uid]['completed'];
                }
            }
            return [
                'name' => $team->name,
                'members' => $team->member_count,
                'completed_tasks' => $completed,
                'total_tasks' => $total,
                'completion_rate' => $total > 0 ? (int) round(($completed / $total) * 100) : 0,
            ];
        })->values();
    }
}
