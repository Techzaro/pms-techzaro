<?php

namespace App\Services;

use App\Models\Activity;
use Carbon\Carbon;

class ActivityService
{
    /**
     * Log an activity for a user.
     */
    public function log(int $userId, string $activityType, string $description, ?string $module = null, ?int $relatedId = null): ?Activity
    {
        return Activity::create([
            'user_id' => $userId,
            'activity_type' => $activityType,
            'related_module' => $module,
            'related_id' => $relatedId,
            'description' => $description,
        ]);
    }

    /**
     * Get today's activities for a user.
     */
    public function getTodayActivities(int $userId, int $limit = 20)
    {
        return Activity::where('user_id', $userId)
            ->whereDate('created_at', Carbon::today())
            ->latest()
            ->limit($limit)
            ->get();
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
