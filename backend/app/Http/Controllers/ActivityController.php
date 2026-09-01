<?php

namespace App\Http\Controllers;

use App\Services\ActivityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Controller for managing user activity logs.
 * Provides endpoints to retrieve today's activities, past activities grouped by date,
 * and a paginated list of all activities with optional date filtering.
 */
class ActivityController extends Controller
{
    public function __construct(
        private ActivityService $activityService
    ) {}

    /**
     * Get today's activities for the logged-in user.
     *
     * @param  Request  $request  The incoming HTTP request containing the authenticated user.
     * @return JsonResponse JSON response with today's activities and total count.
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
     *
     * Uses DashboardController::getPastActivityFeed() to query all four workflow
     * tables (tasks, projects, deliverables, user management) for past dates,
     * returning the same rich data format as today's activity feed.
     *
     * @param  Request  $request  The incoming HTTP request with optional 'limit' parameter.
     * @return JsonResponse JSON response with activities grouped by date.
     */
    public function past(Request $request)
    {
        $user = $request->user();
        $limit = $request->input('limit', 100);

        $dashboard = app(DashboardController::class);
        $projectIds = $dashboard->getUserProjectIds($user);
        $result = $dashboard->getPastActivityFeed($user, $user->role, $projectIds, $limit);

        return response()->json([
            'data' => $result,
        ]);
    }

    /**
     * Get activities for the logged-in user with optional module, action, date, search filters and pagination.
     *
     * @param  Request  $request  The incoming HTTP request with filter parameters.
     * @return JsonResponse JSON response with paginated activities and total count.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $date = $request->input('date');
        $module = $request->input('module');
        $action = $request->input('action') ?: $request->input('type');
        if ($action === 'all') {
            $action = null;
        }
        $dateFrom = $request->input('start_date') ?: $request->input('date_from');
        $dateTo = $request->input('end_date') ?: $request->input('date_to');
        $search = $request->input('search');

        $perPage = (int) ($request->input('per_page') ?: $request->input('limit') ?: 50);
        $page = (int) ($request->input('page') ?: 1);
        $offset = (int) ($request->input('offset') ?: (($page - 1) * $perPage));

        $userId = $request->filled('user_id')
            ? (int) $request->input('user_id')
            : (in_array($user->role, ['admin', 'manager']) || $module ? 0 : $user->id);

        $activities = $this->activityService->getActivities(
            $userId, $date, $perPage, $offset, $module, $action, $dateFrom, $dateTo, $search
        );
        $total = $this->activityService->getActivityCount(
            $userId, $date, $module, $action, $dateFrom, $dateTo, $search
        );

        $lastPage = max(1, (int) ceil($total / $perPage));

        return response()->json([
            'data' => $activities,
            'total' => $total,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => $lastPage,
        ]);
    }
}
