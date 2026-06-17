<?php

/**
 * Controller for providing dashboard data based on user role.
 */

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
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
            'todayWorkload' => $this->getTodayWorkload($user),
            'activeProjects' => $this->getActiveProjects($user, $role),
            'recentActivity' => $this->getRecentActivity($user, $role),
            'upcomingDeadlines' => $this->getUpcomingDeadlines($user, $role),
            'completedToday' => $this->getCompletedToday($user),
        ]);
    }

    /**
     * Summary cards: active projects, tasks due, completed, pending.
     */
    private function getSummary(User $user, string $role): array
    {
        $projectQuery = Project::query();
        $taskQuery = Task::query();

        if ($role === 'team_lead' || $role === 'member') {
            $projectIds = $this->getUserProjectIds($user);
            $projectQuery->whereIn('id', $projectIds);
            $taskQuery->whereIn('project_id', $projectIds)->where(function ($q) use ($user) {
                $q->where('assigned_by', $user->id)
                  ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
            });
        }

        $activeProjects = $projectQuery->clone()
            ->whereIn('status', ['In Progress', 'Active', 'planned'])
            ->count();

        $tasksDueToday = $taskQuery->clone()
            ->whereDate('end_date', today())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->count();

        $completedTasks = $taskQuery->clone()
            ->whereIn('status', ['completed', 'done'])
            ->count();

        $pendingTasks = $taskQuery->clone()
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->count();

        $totalTasks = $taskQuery->clone()->count();

        return [
            'active_projects' => $activeProjects,
            'tasks_due_today' => $tasksDueToday,
            'completed_tasks' => $completedTasks,
            'pending_tasks' => $pendingTasks,
            'total_tasks' => $totalTasks,
        ];
    }

    /**
     * Today's tasks: tasks due today assigned to the logged-in user.
     */
    private function getTodayWorkload(User $user): array
    {
        return Task::with(['project:id,title', 'assignees:id,name'])
            ->whereDate('end_date', today())
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->whereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
            ->latest()
            ->limit(10)
            ->get()
            ->toArray();
    }

    /**
     * Active projects with progress.
     */
    private function getActiveProjects(User $user, string $role): array
    {
        $projects = Project::with(['creator:id,name', 'team:id,name'])
            ->whereIn('status', ['In Progress', 'Active', 'planned'])
            ->whereIn('id', $this->getUserProjectIds($user))
            ->latest()
            ->limit(6)
            ->get();

        return $projects->map(function ($project) {
            $tasks = $project->tasks;
            $total = $tasks->count();
            $done = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['done', 'completed'], true))->count();
            $progress = $total > 0 ? (int) round(($done / $total) * 100) : 0;

            return [
                'id' => $project->id,
                'name' => $project->title,
                'client' => $project->client_name,
                'progress' => $progress,
                'deadline' => $project->end_date?->format('M d, Y h:i A'),
                'team' => $project->team?->name,
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
        $query = Task::with(['project:id,title'])
            ->whereNotIn('status', ['completed', 'done', 'abandoned'])
            ->where('end_date', '>=', now())
            ->where('end_date', '<=', now()->addDays(7))
            ->orderBy('end_date')
            ->limit(10);

        if ($role === 'team_lead' || $role === 'member') {
            $query->whereIn('project_id', $this->getUserProjectIds($user))
                  ->where(function ($q) use ($user) {
                      $q->where('assigned_by', $user->id)
                        ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
                  });
        }

        return $query->get()->map(fn ($task) => [
            'id' => $task->id,
            'title' => $task->title,
            'project' => $task->project?->title,
            'end_date' => $task->end_date?->format('M d, Y h:i A'),
        ])->toArray();
    }

    /**
     * Completed today: tasks completed/submitted today by the logged-in user.
     */
    private function getCompletedToday(User $user): array
    {
        return Task::with(['project:id,title'])
            ->whereIn('status', ['completed', 'done'])
            ->whereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
            ->whereDate('updated_at', today())
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($task) => [
                'id' => $task->id,
                'title' => $task->title,
                'project' => $task->project?->title,
                'completed_at' => $task->updated_at?->format('M d, Y h:i A'),
            ])
            ->toArray();
    }

    /**
     * Get project IDs accessible to a user.
     * Admin and Manager see all projects.
     * Team Leads and Members see projects they created, team membership, or manually visible.
     * IMPORTANT: Assigned projects do NOT appear on dashboard - only in /my-tasks endpoint
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
                        ->orWhereHas('team', fn ($t) => $t->where('leader_id', $user->id));
                  })->whereDoesntHave('visibility', fn ($q) => $q->where('user_id', $user->id)->where('is_visible', false));
              });
        })->pluck('id');
    }
}
