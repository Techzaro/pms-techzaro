<?php

namespace App\Http\Controllers;

use App\Services\Sharing\SharingNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * SharingNotificationController
 *
 * Manages sharing-related notifications.
 */
class SharingNotificationController extends Controller
{
    public function __construct(
        private SharingNotificationService $notificationService
    ) {}

    /**
     * GET /api/sharing/notifications
     * Get sharing notifications for the current user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $unreadOnly = $request->boolean('unread_only', false);
        $limit = (int) $request->query('limit', 25);

        $notifications = $this->notificationService->getForUser($user->id, $unreadOnly, $limit);

        return response()->json([
            'success' => true,
            'data' => $notifications,
        ]);
    }

    /**
     * GET /api/sharing/notifications/unread-count
     * Get unread notification count.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();
        $count = $this->notificationService->getUnreadCount($user->id);

        return response()->json([
            'success' => true,
            'data' => ['count' => $count],
        ]);
    }

    /**
     * PUT /api/sharing/notifications/{id}/read
     * Mark a notification as read.
     */
    public function markAsRead(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $this->notificationService->markAsRead($id, $user->id);

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read.',
        ]);
    }

    /**
     * PUT /api/sharing/notifications/read-all
     * Mark all notifications as read.
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->notificationService->markAllAsRead($user->id);

        return response()->json([
            'success' => true,
            'message' => 'All notifications marked as read.',
        ]);
    }
}
