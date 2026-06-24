<?php

namespace App\Services;

use App\Models\Activity;
use Carbon\Carbon;

class ActivityService
{
    /**
     * Log an activity for a user.
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
     * Get today's activities for a user.
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
     * Get past activities for a user, grouped by date.
     */
    public function getPastActivities(int $userId, int $limit = 100): array
    {
        $activities = Activity::where('user_id', $userId)
            ->whereDate('created_at', '<', Carbon::today())
            ->latest()
            ->limit($limit)
            ->get();

        $grouped = [];
        foreach ($activities as $activity) {
            $dateKey = $activity->created_at->format('Y-m-d');
            $grouped[$dateKey][] = $activity;
        }

        return $grouped;
    }

    /**
     * Get activities for a user with optional date filter.
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
     * Get activity count for a user on a specific date.
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
