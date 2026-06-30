<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Service for creating, managing, and querying user notifications.
 *
 * Supports single and bulk notification creation, read-status
 * management, and unread count retrieval.
 */
class NotificationService
{
    /**
     * Create a single notification for a user.
     *
     * Returns null if user_id is missing or the sender is notifying
     * themselves (self-notifications are suppressed).
     *
     * @param array $data Notification attributes
     *
     * @return \App\Models\Notification|null
     */
    public function create(array $data): ?Notification
    {
        if (empty($data['user_id'])) return null;
        if (isset($data['sender_user_id']) && (int) $data['user_id'] === (int) $data['sender_user_id']) return null;

        return Notification::create($data);
    }

    /**
     * Create multiple notifications in a single database insert.
     *
     * Filters out entries with missing user_id and self-notifications
     * before performing the bulk insert.
     *
     * @param array $notifications Array of notification data arrays
     *
     * @return void
     */
    public function createBulk(array $notifications): void
    {
        if (empty($notifications)) return;

        // Filter out invalid entries and self-notifications
        $filtered = array_filter($notifications, function ($n) {
            return !empty($n['user_id']) && (!isset($n['sender_user_id']) || (int) $n['user_id'] !== (int) $n['sender_user_id']);
        });

        if (!empty($filtered)) {
            $now = now()->toDateTimeString();
            $data = array_values(array_map(function ($n) use ($now) {
                $n['created_at'] = $n['created_at'] ?? $now;
                $n['updated_at'] = $n['updated_at'] ?? $now;
                return $n;
            }, $filtered));
            Notification::insert($data);
        }
    }

    /**
     * Convenience method to notify a single user about an action.
     *
     * @param int         $userId    Recipient user ID
     * @param int         $senderId  Sender user ID
     * @param string      $type      Notification type identifier
     * @param string      $module    Related module name
     * @param int         $relatedId ID of the related entity
     * @param string      $title     Notification title
     * @param string      $message   Notification body text
     * @param string|null $link      Optional deep-link URL
     *
     * @return \App\Models\Notification|null
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
     * Notify multiple users about the same action in bulk.
     *
     * @param array       $userIds   Array of recipient user IDs
     * @param int         $senderId  Sender user ID
     * @param string      $type      Notification type identifier
     * @param string      $module    Related module name
     * @param int         $relatedId ID of the related entity
     * @param string      $title     Notification title
     * @param string      $message   Notification body text
     * @param string|null $link      Optional deep-link URL
     *
     * @return void
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
     * Mark a single notification as read.
     *
     * Only succeeds if the notification belongs to the specified user.
     *
     * @param int $notificationId Notification ID
     * @param int $userId         Owner user ID
     *
     * @return bool True if marked as read, false if not found
     */
    public function markAsRead(int $notificationId, int $userId): bool
    {
        $notification = Notification::where('id', $notificationId)->where('user_id', $userId)->first();
        if (!$notification) return false;

        $notification->update(['is_read' => true]);
        return true;
    }

    /**
     * Mark all unread notifications for a user as read.
     *
     * @param int $userId Owner user ID
     *
     * @return void
     */
    public function markAllAsRead(int $userId): void
    {
        Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->update(['is_read' => true]);
    }

    /**
     * Get the count of unread notifications for a user.
     *
     * Excludes self-notifications (where sender_user_id matches user_id).
     *
     * @param int $userId Owner user ID
     *
     * @return int
     */
    public function getUnreadCount(int $userId): int
    {
        return Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->where(function ($q) use ($userId) {
                // Exclude self-notifications from unread count
                $q->whereNull('sender_user_id')
                  ->orWhere('sender_user_id', '!=', $userId);
            })
            ->count();
    }
}
