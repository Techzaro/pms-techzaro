<?php

namespace App\Http\Controllers;

use App\Services\ActivityService;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function __construct(
        private ActivityService $activityService
    ) {}

    /**
     * Get today's activities for the logged-in user.
     */
    public function today(Request $request)
    {
        $user = $request->user();
        $activities = $this->activityService->getTodayActivities($user->id, 50);

        return response()->json([
            'data' => $activities,
            'total' => $activities->count(),
        ]);
    }

    /**
     * Get activities for the logged-in user with optional date filter.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $date = $request->input('date');
        $limit = $request->input('limit', 50);
        $offset = $request->input('offset', 0);

        $activities = $this->activityService->getActivities($user->id, $date, $limit, $offset);
        $total = $this->activityService->getActivityCount($user->id, $date);

        return response()->json([
            'data' => $activities,
            'total' => $total,
        ]);
    }
}
