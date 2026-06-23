<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class NotificationService
{
    /**
     * Create a single notification for a user.
     */
    public function create(array $data): ?Notification
    {
        if (empty($data['user_id'])) return null;
        if (isset($data['sender_user_id']) && (int) $data['user_id'] === (int) $data['sender_user_id']) return null;

        return Notification::create($data);
    }

    /**
     * Create notifications for multiple users at once.
     */
    public function createBulk(array $notifications): void
    {
        if (empty($notifications)) return;

        $filtered = array_filter($notifications, function ($n) {
            return !empty($n['user_id']) && (!isset($n['sender_user_id']) || (int) $n['user_id'] !== (int) $n['sender_user_id']);
        });

        if (!empty($filtered)) {
            Notification::insert(array_values($filtered));
        }
    }

    /**
     * Notify a single user about an action.
     */
    public function notify(int $userId, int $senderId, string $type, string $module, int $relatedId, string $title, string $message, ?string $link = null): ?Notification
    {
        return $this->create([
            'user_id' => $userId,
            'sender_user_id' => $senderId,
            'type' => $type,
            'related_module' => $module,
            'related_id' => $relatedId,
            'title' => $title,
            'message' => $message,
            'link' => $link,
        ]);
    }

    /**
     * Notify multiple users about an action.
     */
    public function notifyMultiple(array $userIds, int $senderId, string $type, string $module, int $relatedId, string $title, string $message, ?string $link = null): void
    {
        $notifications = array_map(fn(int $userId) => [
            'user_id' => $userId,
            'sender_user_id' => $senderId,
            'type' => $type,
            'related_module' => $module,
            'related_id' => $relatedId,
            'title' => $title,
            'message' => $message,
            'link' => $link,
        ], $userIds);

        $this->createBulk($notifications);
    }

    /**
     * Mark a notification as read.
     */
    public function markAsRead(int $notificationId, int $userId): bool
    {
        $notification = Notification::where('id', $notificationId)->where('user_id', $userId)->first();
        if (!$notification) return false;

        $notification->update(['is_read' => true]);
        return true;
    }

    /**
     * Mark all notifications for a user as read.
     */
    public function markAllAsRead(int $userId): void
    {
        Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->update(['is_read' => true]);
    }

    /**
     * Get unread count for a user.
     */
    public function getUnreadCount(int $userId): int
    {
        return Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->where(function ($q) use ($userId) {
                $q->whereNull('sender_user_id')
                  ->orWhere('sender_user_id', '!=', $userId);
            })
            ->count();
    }
}
