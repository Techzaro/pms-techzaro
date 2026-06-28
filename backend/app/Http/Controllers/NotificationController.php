<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
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

        return response()->json([
            'data' => NotificationResource::collection($query->paginate(20)),
        ]);
    }

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

    public function markAsRead(Request $request, Notification $notification)
    {
        if ($notification->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $notification->update(['is_read' => true]);

        return response()->json(['success' => true, 'message' => 'Notification marked as read']);
    }

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
