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
}
