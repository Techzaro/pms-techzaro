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
     * Parse and format any incoming date string strictly to YYYY-MM-DD for whereDate query matching.
     */
    public static function parseQueryDate(?string $date): ?string
    {
        if (empty($date)) {
            return null;
        }
        $clean = trim($date);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $clean)) {
            return $clean;
        }
        if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $clean, $m)) {
            $p1 = (int) $m[1];
            $p2 = (int) $m[2];
            $year = $m[3];
            if ($p1 > 12) {
                return sprintf('%04d-%02d-%02d', $year, $p2, $p1);
            } else {
                return sprintf('%04d-%02d-%02d', $year, $p1, $p2);
            }
        }
        try {
            return Carbon::parse($clean)->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
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
            $formattedDate = self::parseQueryDate($date);
            if ($formattedDate) {
                $query->whereDate('created_at', $formattedDate);
            }
        }
        if ($dateFrom) {
            $formattedFrom = self::parseQueryDate($dateFrom);
            if ($formattedFrom) {
                $query->whereDate('created_at', '>=', $formattedFrom);
            }
        }
        if ($dateTo) {
            $formattedTo = self::parseQueryDate($dateTo);
            if ($formattedTo) {
                $query->whereDate('created_at', '<=', $formattedTo);
            }
        }
        if ($module) {
            $cleanModule = strtolower(trim($module));
            $moduleVariants = [
                'user' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
                'users' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
                'user_management' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
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
                'event' => ['event', 'Event', 'events', 'event_created', 'event_updated', 'rsvp', 'rescheduled'],
                'events' => ['event', 'Event', 'events', 'event_created', 'event_updated', 'rsvp', 'rescheduled'],
                'knowledge_base' => ['knowledge_base', 'KnowledgeBase', 'kb', 'knowledge-base', 'knowledge_bases', 'kb_created', 'kb_updated', 'kb_deleted', 'kb_duplicated', 'kb_archived', 'kb_restored', 'kb_favorited', 'kb_unfavorited', 'kb_shared', 'kb_downloaded', 'kb_version_restored'],
                'kb' => ['knowledge_base', 'KnowledgeBase', 'kb', 'knowledge-base', 'knowledge_bases', 'kb_created', 'kb_updated', 'kb_deleted', 'kb_duplicated', 'kb_archived', 'kb_restored', 'kb_favorited', 'kb_unfavorited', 'kb_shared', 'kb_downloaded', 'kb_version_restored'],
                'regional_settings' => ['regional_settings', 'regional-settings', 'regional', 'user_settings', 'organization_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'user_settings' => ['user_settings', 'regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'organization_settings' => ['organization_settings', 'regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
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
                'create' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created', 'kb_created', 'event_created'],
                'created' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created', 'kb_created', 'event_created'],
                'update' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status', 'kb_updated', 'event_updated', 'update_regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'updated' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status', 'kb_updated', 'event_updated', 'update_regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'delete' => ['delete', 'Delete', 'deleted', 'Deleted', 'kb_deleted'],
                'deleted' => ['delete', 'Delete', 'deleted', 'Deleted', 'kb_deleted'],
                'duplicate' => ['duplicate', 'Duplicate', 'duplicated', 'kb_duplicated'],
                'duplicated' => ['duplicate', 'Duplicate', 'duplicated', 'kb_duplicated'],
                'archive' => ['archive', 'Archive', 'archived', 'kb_archived'],
                'archived' => ['archive', 'Archive', 'archived', 'kb_archived'],
                'restore' => ['restore', 'Restore', 'restored', 'kb_restored', 'kb_version_restored'],
                'restored' => ['restore', 'Restore', 'restored', 'kb_restored', 'kb_version_restored'],
                'favorite' => ['favorite', 'Favorite', 'favorited', 'kb_favorited', 'unfavorite', 'unfavorited', 'kb_unfavorited'],
                'favorited' => ['favorite', 'Favorite', 'favorited', 'kb_favorited', 'unfavorite', 'unfavorited', 'kb_unfavorited'],
                'share' => ['share', 'Share', 'shared', 'kb_shared'],
                'shared' => ['share', 'Share', 'shared', 'kb_shared'],
                'download' => ['download', 'Download', 'downloaded', 'kb_downloaded'],
                'downloaded' => ['download', 'Download', 'downloaded', 'kb_downloaded'],
                'timezone_updated' => ['timezone_updated', 'timezone', 'update_regional_settings', 'configuration_changed'],
                'timezone' => ['timezone_updated', 'timezone', 'update_regional_settings', 'configuration_changed'],
                'language_updated' => ['language_updated', 'language', 'update_regional_settings', 'configuration_changed'],
                'language' => ['language_updated', 'language', 'update_regional_settings', 'configuration_changed'],
                'date_format_updated' => ['date_format_updated', 'date_format', 'update_regional_settings', 'configuration_changed'],
                'date_format' => ['date_format_updated', 'date_format', 'update_regional_settings', 'configuration_changed'],
                'time_format_updated' => ['time_format_updated', 'time_format', 'update_regional_settings', 'configuration_changed'],
                'time_format' => ['time_format_updated', 'time_format', 'update_regional_settings', 'configuration_changed'],
                'working_hours_updated' => ['working_hours_updated', 'working_hours', 'update_regional_settings', 'configuration_changed'],
                'working_hours' => ['working_hours_updated', 'working_hours', 'update_regional_settings', 'configuration_changed'],
                'configuration_changed' => ['configuration_changed', 'update_regional_settings', 'update_settings', 'update', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'update_regional_settings' => ['update_regional_settings', 'configuration_changed', 'update_settings', 'update', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
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
            $formattedDate = self::parseQueryDate($date);
            if ($formattedDate) {
                $query->whereDate('created_at', $formattedDate);
            }
        }
        if ($dateFrom) {
            $formattedFrom = self::parseQueryDate($dateFrom);
            if ($formattedFrom) {
                $query->whereDate('created_at', '>=', $formattedFrom);
            }
        }
        if ($dateTo) {
            $formattedTo = self::parseQueryDate($dateTo);
            if ($formattedTo) {
                $query->whereDate('created_at', '<=', $formattedTo);
            }
        }
        if ($module) {
            $cleanModule = strtolower(trim($module));
            $moduleVariants = [
                'user' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
                'users' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
                'user_management' => ['user', 'User', 'users', 'Users', 'user_management', 'user_settings'],
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
                'event' => ['event', 'Event', 'events', 'event_created', 'event_updated', 'rsvp', 'rescheduled'],
                'events' => ['event', 'Event', 'events', 'event_created', 'event_updated', 'rsvp', 'rescheduled'],
                'knowledge_base' => ['knowledge_base', 'KnowledgeBase', 'kb', 'knowledge-base', 'knowledge_bases', 'kb_created', 'kb_updated', 'kb_deleted', 'kb_duplicated', 'kb_archived', 'kb_restored', 'kb_favorited', 'kb_unfavorited', 'kb_shared', 'kb_downloaded', 'kb_version_restored'],
                'kb' => ['knowledge_base', 'KnowledgeBase', 'kb', 'knowledge-base', 'knowledge_bases', 'kb_created', 'kb_updated', 'kb_deleted', 'kb_duplicated', 'kb_archived', 'kb_restored', 'kb_favorited', 'kb_unfavorited', 'kb_shared', 'kb_downloaded', 'kb_version_restored'],
                'regional_settings' => ['regional_settings', 'regional-settings', 'regional', 'user_settings', 'organization_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'user_settings' => ['user_settings', 'regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'organization_settings' => ['organization_settings', 'regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
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
                'create' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created', 'kb_created', 'event_created'],
                'created' => ['create', 'Create', 'created', 'Created', 'deliverable_created', 'task_created', 'kb_created', 'event_created'],
                'update' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status', 'kb_updated', 'event_updated', 'update_regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'updated' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'status', 'kb_updated', 'event_updated', 'update_regional_settings', 'configuration_changed', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'delete' => ['delete', 'Delete', 'deleted', 'Deleted', 'kb_deleted'],
                'deleted' => ['delete', 'Delete', 'deleted', 'Deleted', 'kb_deleted'],
                'duplicate' => ['duplicate', 'Duplicate', 'duplicated', 'kb_duplicated'],
                'duplicated' => ['duplicate', 'Duplicate', 'duplicated', 'kb_duplicated'],
                'archive' => ['archive', 'Archive', 'archived', 'kb_archived'],
                'archived' => ['archive', 'Archive', 'archived', 'kb_archived'],
                'restore' => ['restore', 'Restore', 'restored', 'kb_restored', 'kb_version_restored'],
                'restored' => ['restore', 'Restore', 'restored', 'kb_restored', 'kb_version_restored'],
                'favorite' => ['favorite', 'Favorite', 'favorited', 'kb_favorited', 'unfavorite', 'unfavorited', 'kb_unfavorited'],
                'favorited' => ['favorite', 'Favorite', 'favorited', 'kb_favorited', 'unfavorite', 'unfavorited', 'kb_unfavorited'],
                'share' => ['share', 'Share', 'shared', 'kb_shared'],
                'shared' => ['share', 'Share', 'shared', 'kb_shared'],
                'download' => ['download', 'Download', 'downloaded', 'kb_downloaded'],
                'downloaded' => ['download', 'Download', 'downloaded', 'kb_downloaded'],
                'timezone_updated' => ['timezone_updated', 'timezone', 'update_regional_settings', 'configuration_changed'],
                'timezone' => ['timezone_updated', 'timezone', 'update_regional_settings', 'configuration_changed'],
                'language_updated' => ['language_updated', 'language', 'update_regional_settings', 'configuration_changed'],
                'language' => ['language_updated', 'language', 'update_regional_settings', 'configuration_changed'],
                'date_format_updated' => ['date_format_updated', 'date_format', 'update_regional_settings', 'configuration_changed'],
                'date_format' => ['date_format_updated', 'date_format', 'update_regional_settings', 'configuration_changed'],
                'time_format_updated' => ['time_format_updated', 'time_format', 'update_regional_settings', 'configuration_changed'],
                'time_format' => ['time_format_updated', 'time_format', 'update_regional_settings', 'configuration_changed'],
                'working_hours_updated' => ['working_hours_updated', 'working_hours', 'update_regional_settings', 'configuration_changed'],
                'working_hours' => ['working_hours_updated', 'working_hours', 'update_regional_settings', 'configuration_changed'],
                'configuration_changed' => ['configuration_changed', 'update_regional_settings', 'update_settings', 'update', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
                'update_regional_settings' => ['update_regional_settings', 'configuration_changed', 'update_settings', 'update', 'timezone_updated', 'language_updated', 'date_format_updated', 'time_format_updated', 'working_hours_updated'],
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
