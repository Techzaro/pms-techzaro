<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

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
     * @param  Request  $request  Query parameters: search, type, filter (unread|read).
     * @return AnonymousResourceCollection Paginated notification resources.
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

        // Guest users only see notifications related to their projects
        if ($user->role === 'guest') {
            $query->where(function ($q) use ($user) {
                $q->whereNull('related_module')
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'project')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'task')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('tasks')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'deliverable')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('deliverables')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'chat')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('conversations')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    });
            });
        }

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
     * @param  Request  $request  The incoming HTTP request.
     * @return JsonResponse JSON response with unread_count.
     */
    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $query = $user->notifications()
            ->where('is_read', false)
            ->where(function ($q) use ($user) {
                $q->whereNull('sender_user_id')
                    ->orWhere('sender_user_id', '!=', $user->id);
            });

        // Guest users only see notifications related to their projects
        if ($user->role === 'guest') {
            $query->where(function ($q) use ($user) {
                $q->whereNull('related_module')
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'project')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'task')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('tasks')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'deliverable')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('deliverables')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    })
                    ->orWhere(function ($q) use ($user) {
                        $q->where('related_module', 'chat')
                            ->whereIn('related_id', function ($sq) use ($user) {
                                $sq->select('id')->from('conversations')->whereIn('project_id', function ($sq2) use ($user) {
                                    $sq2->select('id')->from('projects')->whereJsonContains('guest_ids', $user->id);
                                });
                            });
                    });
            });
        }

        $count = $query->count();

        return response()->json(['unread_count' => $count]);
    }

    /**
     * Mark a single notification as read.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @param  Notification  $notification  The notification to mark as read.
     * @return JsonResponse JSON response confirming the notification was marked.
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
     * Get the latest unread notifications for desktop notification display.
     *
     * Returns the most recent unread notifications (up to 5) for showing
     * as native desktop/browser notifications. Only returns notifications
     * that have a title and message (not generic count-based).
     *
     * @param  Request  $request  Query parameter: after_id (optional) - only return notifications newer than this ID.
     * @return JsonResponse JSON response with notifications array.
     */
    public function latest(Request $request)
    {
        $user = $request->user();

        $query = Notification::where('user_id', $user->id)
            ->where('is_read', false)
            ->where(function ($q) use ($user) {
                $q->whereNull('sender_user_id')
                    ->orWhere('sender_user_id', '!=', $user->id);
            })
            ->with('sender:id,name')
            ->latest();

        if ($request->filled('after_id')) {
            $query->where('id', '>', $request->input('after_id'));
        }

        $notifications = $query->limit(5)->get();

        return response()->json([
            'notifications' => $notifications->map(function ($n) {
                return [
                    'id' => $n->id,
                    'type' => $n->type,
                    'title' => $n->title,
                    'message' => $n->message,
                    'link' => $n->link,
                    'related_module' => $n->related_module,
                    'related_id' => $n->related_id,
                    'sender' => $n->sender ? ['id' => $n->sender->id, 'name' => $n->sender->name] : null,
                    'created_at' => $n->created_at,
                ];
            }),
        ]);
    }

    /**
     * Mark all unread notifications as read for the authenticated user.
     *
     * @param  Request  $request  The incoming HTTP request.
     * @return JsonResponse JSON response confirming all notifications marked.
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
