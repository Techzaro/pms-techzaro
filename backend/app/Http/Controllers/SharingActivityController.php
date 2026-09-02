<?php

namespace App\Http\Controllers;

use App\Models\SharedResourceActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * SharingActivityController
 *
 * Provides access to sharing activity logs.
 */
class SharingActivityController extends Controller
{
    /**
     * GET /api/sharing/activities
     * Get sharing activity logs for the current organization.
     */
    public function index(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();
        $limit = (int) $request->query('limit', 50);
        $offset = (int) $request->query('offset', 0);
        $action = $request->query('action');
        $resourceType = $request->query('resource_type');
        $days = (int) $request->query('days', 30);

        $query = SharedResourceActivityLog::forOrganization($currentOrg->id)
            ->recent($days);

        if ($action) {
            $query->where('action', $action);
        }

        if ($resourceType) {
            $query->where('resource_type', $resourceType);
        }

        $total = $query->count();
        $activities = $query->with('user')
            ->offset($offset)
            ->limit($limit)
            ->latest('acted_at')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'total' => $total,
                'activities' => $activities->map(function ($activity) {
                    return [
                        'id' => $activity->id,
                        'action' => $activity->action,
                        'resource_type' => $activity->resource_type,
                        'resource_id' => $activity->resource_id,
                        'user' => $activity->user ? [
                            'id' => $activity->user->id,
                            'name' => $activity->user->name,
                            'avatar' => $activity->user->avatar,
                        ] : null,
                        'old_permission' => $activity->old_permission,
                        'new_permission' => $activity->new_permission,
                        'ip_address' => $activity->ip_address,
                        'details' => $activity->details,
                        'acted_at' => $activity->acted_at,
                    ];
                }),
            ],
        ]);
    }
}
