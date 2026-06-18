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
            'todayWorkload' => $this->getTodayWorkload($user, $role),
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

        if (in_array($role, ['admin', 'manager'])) {
            // Admin/Manager: see all projects and tasks
        } else {
            $projectIds = $this->getUserProjectIds($user);
            $projectQuery->whereIn('id', $projectIds);
            $taskQuery->whereIn('project_id', $projectIds)->where(function ($q) use ($user) {
                $q->where('assigned_by', $user->id)
                  ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
            });
        }

        $activeProjects = $projectQuery->clone()
            ->whereNotIn('status', ['completed', 'done'])
            ->count();

        // Admin/Manager: all tasks due today (unrestricted)
        // Other roles: scoped to their projects/tasks
        $tasksDueToday = in_array($role, ['admin', 'manager'])
            ? Task::query()
                ->whereDate('end_date', today())
                ->whereNotIn('status', ['completed', 'done', 'approved', 'abandoned'])
                ->count()
            : Task::query()
                ->whereDate('end_date', today())
                ->whereNotIn('status', ['completed', 'done', 'approved', 'abandoned'])
                ->where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
                      ->orWhere('assigned_to', $user->id);
                })
                ->count();

        // Admin/Manager: all completed/approved tasks (unrestricted)
        // Other roles: tasks assigned to them that are completed/approved
        $completedTasks = in_array($role, ['admin', 'manager'])
            ? Task::query()
                ->whereIn('status', ['completed', 'done', 'approved'])
                ->count()
            : Task::query()
                ->whereIn('status', ['completed', 'done', 'approved'])
                ->where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
                      ->orWhere('assigned_to', $user->id);
                })
                ->count();

        // Admin/Manager: all pending/active tasks (unrestricted)
        // Other roles: scoped to their projects/tasks
        $pendingTasks = in_array($role, ['admin', 'manager'])
            ? Task::query()
                ->whereNotIn('status', ['completed', 'done', 'approved', 'abandoned'])
                ->count()
            : Task::query()
                ->whereNotIn('status', ['completed', 'done', 'approved', 'abandoned'])
                ->where(function ($q) use ($user) {
                    $q->whereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id))
                      ->orWhere('assigned_to', $user->id);
                })
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
     * Today's tasks: tasks due today.
     * Admin/Manager: tasks they assigned to others, not yet submitted/approved/completed.
     * Other roles: tasks assigned to them due today.
     */
    private function getTodayWorkload(User $user, string $role): array
    {
        if (in_array($role, ['admin', 'manager'])) {
            return Task::with(['project:id,title', 'assignees:id,name,role'])
                ->where('assigned_by', $user->id)
                ->whereDate('end_date', today())
                ->whereNotIn('status', ['completed', 'done', 'approved', 'abandoned'])
                ->latest()
                ->limit(10)
                ->get()
                ->toArray();
        }

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
            ->whereNotIn('status', ['completed', 'done', 'cancelled', 'archived'])
            ->whereIn('id', $this->getUserProjectIds($user))
            ->latest()
            ->limit(6)
            ->get();

        return $projects->map(function ($project) {
            $tasks = $project->tasks;
            $total = $tasks->count();
            $done = $tasks->filter(fn ($t) => in_array(strtolower((string) $t->status), ['done', 'completed'], true))->count();
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
        $submittedTasks = Task::with(['project:id,title', 'assignees:id,name,role'])
            ->whereDate('submitted_at', today())
            ->where(function ($q) use ($user) {
                $q->where('assigned_by', $user->id)
                  ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
            })
            ->latest('submitted_at')
            ->limit(10)
            ->get()
            ->map(fn ($task) => [
                'id' => $task->id,
                'type' => 'task',
                'title' => $task->title,
                'project' => $task->project?->title,
                'submitted_at' => $task->submitted_at?->format('Y-m-d\TH:i:s'),
                'time_ago' => $task->submitted_at?->diffForHumans(),
                'assignees' => $task->assignees->map(fn ($u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'role' => $u->role,
                ])->toArray(),
            ]);

        $submittedDeliverables = \App\Models\Deliverable::with(['project:id,title', 'assignee:id,name,role'])
            ->whereDate('submitted_at', today())
            ->where(function ($q) use ($user) {
                $q->where('created_by', $user->id)
                  ->orWhere('assigned_to', $user->id);
            })
            ->latest('submitted_at')
            ->limit(10)
            ->get()
            ->map(fn ($dlv) => [
                'id' => $dlv->id,
                'type' => 'deliverable',
                'title' => $dlv->title,
                'project' => $dlv->project?->title,
                'submitted_at' => $dlv->submitted_at?->format('Y-m-d\TH:i:s'),
                'time_ago' => $dlv->submitted_at?->diffForHumans(),
                'assignees' => $dlv->assignee ? [[
                    'id' => $dlv->assignee->id,
                    'name' => $dlv->assignee->name,
                    'role' => $dlv->assignee->role,
                ]] : [],
            ]);

        return $submittedTasks->concat($submittedDeliverables)
            ->sortByDesc('submitted_at')
            ->values()
            ->toArray();
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
}
