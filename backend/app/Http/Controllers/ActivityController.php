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
     * Get past activities for the logged-in user, grouped by date.
     */
    public function past(Request $request)
    {
        $user = $request->user();
        $limit = $request->input('limit', 100);
        $grouped = $this->activityService->getPastActivities($user->id, $limit);

        $result = [];
        foreach ($grouped as $date => $activities) {
            $result[] = [
                'date' => $date,
                'label' => \Carbon\Carbon::parse($date)->format('d M Y'),
                'activities' => $activities->map(fn ($a) => [
                    'id' => $a->id,
                    'activity_type' => $a->activity_type,
                    'action' => $a->action,
                    'related_module' => $a->related_module,
                    'related_id' => $a->related_id,
                    'entity_name' => $a->entity_name,
                    'description' => $a->description,
                    'created_at' => $a->created_at->toIso8601String(),
                ])->toArray(),
            ];
        }

        return response()->json([
            'data' => $result,
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
