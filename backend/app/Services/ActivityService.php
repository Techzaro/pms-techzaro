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
     * Retrieve activities for a user with optional date filter and pagination.
     *
     * @param int         $userId  ID of the user
     * @param string|null $date    Optional date string (Y-m-d) to filter by
     * @param int         $limit   Maximum number of results
     * @param int         $offset  Number of results to skip
     *
     * @return \Illuminate\Database\Eloquent\Collection
     */
    public function getActivities(int $userId, ?string $date = null, int $limit = 50, int $offset = 0)
    {
        $query = Activity::where('user_id', $userId);

        if ($date) {
            $query->whereDate('created_at', $date);
        }

        return $query->latest()
            ->skip($offset)
            ->limit($limit)
            ->get();
    }

    /**
     * Count activities for a user, optionally filtered by date.
     *
     * @param int         $userId ID of the user
     * @param string|null $date   Optional date string (Y-m-d) to filter by
     *
     * @return int
     */
    public function getActivityCount(int $userId, ?string $date = null): int
    {
        $query = Activity::where('user_id', $userId);

        if ($date) {
            $query->whereDate('created_at', $date);
        }

        return $query->count();
    }
}
