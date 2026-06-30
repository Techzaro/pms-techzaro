<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * Controller for managing user notifications.
 * Provides endpoints to list notifications with filtering/search,
 * get unread counts, and mark notifications as read individually or in bulk.
 * Excludes notifications triggered by the user themselves.
 */
class NotificationController extends Controller
{
    /**
     * Get paginated notifications for the authenticated user.
     *
     * Excludes notifications the user triggered themselves. Supports search
     * by title/message, filtering by type, and read/unread filtering.
     *
     * @param  \Illuminate\Http\Request  $request  Query parameters: search, type, filter (unread|read).
     * @return \Illuminate\Http\Resources\Json\AnonymousResourceCollection  Paginated notification resources.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = Notification::where('user_id', $user->id)
            ->where(function ($q) use ($user) {
                // Exclude notifications triggered by the user themselves
                $q->whereNull('sender_user_id')
                  ->orWhere('sender_user_id', '!=', $user->id);
            })
            ->with('sender:id,name')
            ->latest();

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('message', 'like', "%{$search}%");
            });
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('filter')) {
            $filter = $request->input('filter');
            if ($filter === 'unread') {
                $query->where('is_read', false);
            } elseif ($filter === 'read') {
                $query->where('is_read', true);
            }
        }

        return NotificationResource::collection($query->paginate(20));
    }

    /**
     * Get the count of unread notifications for the authenticated user.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with unread_count.
     */
    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $count = $user->notifications()
            ->where('is_read', false)
            ->where(function ($q) use ($user) {
                $q->whereNull('sender_user_id')
                  ->orWhere('sender_user_id', '!=', $user->id);
            })
            ->count();

        return response()->json(['unread_count' => $count]);
    }

    /**
     * Mark a single notification as read.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\Notification  $notification  The notification to mark as read.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming the notification was marked.
     */
    public function markAsRead(Request $request, Notification $notification)
    {
        if ($notification->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $notification->update(['is_read' => true]);

        return response()->json(['success' => true, 'message' => 'Notification marked as read']);
    }

    /**
     * Mark all unread notifications as read for the authenticated user.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming all notifications marked.
     */
    public function markAllAsRead(Request $request)
    {
        $user = $request->user();
        $user->notifications()
            ->where('is_read', false)
            ->where(function ($q) use ($user) {
                $q->whereNull('sender_user_id')
                  ->orWhere('sender_user_id', '!=', $user->id);
            })
            ->update(['is_read' => true]);

        return response()->json(['success' => true, 'message' => 'All notifications marked as read']);
    }
}
