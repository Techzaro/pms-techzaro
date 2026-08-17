<?php

namespace App\Services;

use App\Models\Activity;
use Carbon\Carbon;

/**
 * Service for logging and querying user activity records.
 *
 * Handles creation and retrieval of activity entries
 * tracked across the project management system.
 */
class ActivityService
{
    /**
     * Log an activity for a user.
     */
    /**
     * Create a new activity log entry for the given user.
     *
     * @param int         $userId        ID of the user performing the activity
     * @param string      $activityType  Category of activity (e.g. 'task', 'project')
     * @param string      $description   Human-readable description of the activity
     * @param string|null $module        Related module name
     * @param int|null    $relatedId     ID of the related entity
     * @param string|null $action        Action verb (e.g. 'created', 'updated')
     * @param string|null $entityName    Name of the related entity
     * @param int|null    $relatedUserId ID of a related user
     * @param array|null  $metadata      Additional key-value metadata
     *
     * @return \App\Models\Activity|null
     */
    public function log(
        int $userId,
        string $activityType,
        string $description,
        ?string $module = null,
        ?int $relatedId = null,
        ?string $action = null,
        ?string $entityName = null,
        ?int $relatedUserId = null,
        ?array $metadata = null
    ): ?Activity {
        return Activity::create([
            'user_id' => $userId,
            'activity_type' => $activityType,
            'action' => $action,
            'related_module' => $module,
            'related_id' => $relatedId,
            'entity_name' => $entityName,
            'related_user_id' => $relatedUserId,
            'description' => $description,
            'metadata' => $metadata,
        ]);
    }

    /**
     * Retrieve today's activities for a user, ordered by newest first.
     *
     * @param int $userId ID of the user
     * @param int $limit  Maximum number of activities to return
     *
     * @return \Illuminate\Database\Eloquent\Collection
     */
    public function getTodayActivities(int $userId, int $limit = 50)
    {
        return Activity::where('user_id', $userId)
            ->whereDate('created_at', Carbon::today())
            ->latest()
            ->limit($limit)
            ->get();
    }

    /**
     * Retrieve past activities for a user, grouped by date.
     *
     * Activities are grouped under date keys (Y-m-d) with an array
     * of activity models for each date, ordered newest first.
     *
     * @param int $userId ID of the user
     * @param int $limit  Maximum number of activities to retrieve
     *
     * @return array<string, \Illuminate\Database\Eloquent\Collection>
     */
    public function getPastActivities(int $userId, int $limit = 100): array
    {
        $activities = Activity::where('user_id', $userId)
            ->whereDate('created_at', '<', Carbon::today())
            ->latest()
            ->limit($limit)
            ->get();

        // Group activities by their creation date
        $grouped = [];
        foreach ($activities as $activity) {
            $dateKey = $activity->created_at->format('Y-m-d');
            $grouped[$dateKey][] = $activity;
        }

        return $grouped;
    }

    /**
     * Retrieve activities for a user with optional date, module, action, search filters and pagination.
     */
    public function getActivities(
        int $userId,
        ?string $date = null,
        int $limit = 50,
        int $offset = 0,
        ?string $module = null,
        ?string $action = null,
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?string $search = null
    ) {
        $query = Activity::query();
        if ($userId > 0) {
            $query->where('user_id', $userId);
        }

        if ($date) {
            $query->whereDate('created_at', $date);
        }
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }
        if ($module) {
            $cleanModule = strtolower(trim($module));
            $moduleVariants = [
                'user' => ['user', 'User', 'users', 'Users', 'user_management'],
                'users' => ['user', 'User', 'users', 'Users', 'user_management'],
                'user_management' => ['user', 'User', 'users', 'Users', 'user_management'],
                'auth' => ['auth', 'Auth', 'authentication'],
                'task' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'tasks' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'task_management' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'project' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'projects' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'project_management' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'deliverable' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'deliverables' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'subtask' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'deliverable_management' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'team' => ['team', 'Team', 'teams', 'team_management'],
                'teams' => ['team', 'Team', 'teams', 'team_management'],
                'event' => ['event', 'Event', 'events'],
                'events' => ['event', 'Event', 'events'],
            ];
            $allowedModules = $moduleVariants[$cleanModule] ?? [$module, strtolower($module), ucfirst($module)];

            $query->where(function ($q) use ($allowedModules) {
                $q->whereIn('related_module', $allowedModules)
                  ->orWhereIn('activity_type', $allowedModules);
            });
        }

        if ($action) {
            $cleanAction = strtolower(trim($action));
            $actionVariants = [
                'create' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created'],
                'created' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created'],
                'update' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status'],
                'updated' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status'],
                'delete' => ['delete', 'Delete', 'deleted', 'Deleted'],
                'deleted' => ['delete', 'Delete', 'deleted', 'Deleted'],
                'approve' => ['approve', 'Approve', 'approved', 'Approved'],
                'approved' => ['approve', 'Approve', 'approved', 'Approved'],
                'reject' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
                'rejected' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
                'submit' => ['submit', 'Submit', 'submitted', 'Submitted'],
                'submitted' => ['submit', 'Submit', 'submitted', 'Submitted'],
                'login' => ['login', 'Login', 'auth_login'],
                'auth_login' => ['login', 'Login', 'auth_login'],
                'logout' => ['logout', 'Logout'],
            ];
            $allowedActions = $actionVariants[$cleanAction] ?? [$action, strtolower($action), ucfirst($action)];

            $query->where(function ($q) use ($allowedActions) {
                $q->whereIn('action', $allowedActions)
                  ->orWhereIn('activity_type', $allowedActions);
            });
        }
        if ($search) {
            $cleanSearch = trim($search);
            $query->where(function ($q) use ($cleanSearch) {
                $q->where('description', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('entity_name', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('action', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('related_module', 'like', '%'.$cleanSearch.'%');
            });
        }

        return $query->latest()
            ->skip($offset)
            ->limit($limit)
            ->get();
    }

    /**
     * Count activities for a user, optionally filtered by date, module, action, search.
     */
    public function getActivityCount(
        int $userId,
        ?string $date = null,
        ?string $module = null,
        ?string $action = null,
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?string $search = null
    ): int {
        $query = Activity::query();
        if ($userId > 0) {
            $query->where('user_id', $userId);
        }

        if ($date) {
            $query->whereDate('created_at', $date);
        }
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }
        if ($module) {
            $cleanModule = strtolower(trim($module));
            $moduleVariants = [
                'user' => ['user', 'User', 'users', 'Users', 'user_management'],
                'users' => ['user', 'User', 'users', 'Users', 'user_management'],
                'user_management' => ['user', 'User', 'users', 'Users', 'user_management'],
                'auth' => ['auth', 'Auth', 'authentication'],
                'task' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'tasks' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'task_management' => ['task', 'Task', 'tasks', 'Tasks', 'task_management'],
                'project' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'projects' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'project_management' => ['project', 'Project', 'projects', 'Projects', 'project_management'],
                'deliverable' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'deliverables' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'subtask' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'deliverable_management' => ['deliverable', 'Deliverable', 'deliverables', 'subtask', 'deliverable_management'],
                'team' => ['team', 'Team', 'teams', 'team_management'],
                'teams' => ['team', 'Team', 'teams', 'team_management'],
                'event' => ['event', 'Event', 'events'],
                'events' => ['event', 'Event', 'events'],
            ];
            $allowedModules = $moduleVariants[$cleanModule] ?? [$module, strtolower($module), ucfirst($module)];

            $query->where(function ($q) use ($allowedModules) {
                $q->whereIn('related_module', $allowedModules)
                  ->orWhereIn('activity_type', $allowedModules);
            });
        }

        if ($action) {
            $cleanAction = strtolower(trim($action));
            $actionVariants = [
                'create' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created'],
                'created' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created'],
                'update' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status'],
                'updated' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status'],
                'delete' => ['delete', 'Delete', 'deleted', 'Deleted'],
                'deleted' => ['delete', 'Delete', 'deleted', 'Deleted'],
                'approve' => ['approve', 'Approve', 'approved', 'Approved'],
                'approved' => ['approve', 'Approve', 'approved', 'Approved'],
                'reject' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
                'rejected' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
                'submit' => ['submit', 'Submit', 'submitted', 'Submitted'],
                'submitted' => ['submit', 'Submit', 'submitted', 'Submitted'],
                'login' => ['login', 'Login', 'auth_login'],
                'auth_login' => ['login', 'Login', 'auth_login'],
                'logout' => ['logout', 'Logout'],
            ];
            $allowedActions = $actionVariants[$cleanAction] ?? [$action, strtolower($action), ucfirst($action)];

            $query->where(function ($q) use ($allowedActions) {
                $q->whereIn('action', $allowedActions)
                  ->orWhereIn('activity_type', $allowedActions);
            });
        }
        if ($search) {
            $cleanSearch = trim($search);
            $query->where(function ($q) use ($cleanSearch) {
                $q->where('description', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('entity_name', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('action', 'like', '%'.$cleanSearch.'%')
                    ->orWhere('related_module', 'like', '%'.$cleanSearch.'%');
            });
        }

        return $query->count();
    }
}
