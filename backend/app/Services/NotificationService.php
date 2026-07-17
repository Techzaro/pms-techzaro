<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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

        $filtered = array_filter($notifications, function ($n) {
            return !empty($n['user_id']) && (!isset($n['sender_user_id']) || (int) $n['user_id'] !== (int) $n['sender_user_id']);
        });

        if (empty($filtered)) {
            Log::info('createBulk: all notifications filtered out (self-notifications or missing user_id)', [
                'count' => count($notifications),
            ]);
            return;
        }

        $filtered = array_values($filtered);
        $now = now()->toDateTimeString();

        $rows = array_map(function ($n) use ($now) {
            $changesValue = $n['changes'] ?? null;
            if (is_array($changesValue)) {
                $changesValue = json_encode($changesValue);
            }
            return [
                'user_id' => $n['user_id'],
                'sender_user_id' => $n['sender_user_id'] ?? null,
                'type' => $n['type'],
                'related_module' => $n['related_module'],
                'related_id' => $n['related_id'],
                'title' => $n['title'],
                'message' => $n['message'],
                'changes' => $changesValue,
                'link' => $n['link'] ?? null,
                'is_read' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }, $filtered);

        DB::table('notifications')->insert($rows);

        $firstId = (int) DB::getPdo()->lastInsertId();
        $ids = range($firstId, $firstId + count($rows) - 1);

        $createdNotifications = Notification::whereIn('id', $ids)
            ->with(['user.emailPreference', 'sender'])
            ->get();

        Log::info('createBulk: fetched notifications for email', [
            'expected' => count($rows),
            'fetched' => $createdNotifications->count(),
            'ids' => $ids,
        ]);

        foreach ($createdNotifications as $notification) {
            if (!$notification->user) {
                Log::info('createBulk email skipped: user not found', ['notification_id' => $notification->id, 'user_id' => $notification->user_id]);
                continue;
            }
            if (empty($notification->user->professional_email)) {
                Log::info('createBulk email skipped: no professional_email', ['notification_id' => $notification->id, 'user_id' => $notification->user_id]);
                continue;
            }
            if ($notification->type === 'user_updated') continue;

            // Chat messages: in-app only — no email or push
            if ($notification->related_module === 'chat') continue;

            if (Notification::wantsChannel($notification, 'email')) {
                try {
                    $senderEmail = $notification->sender?->professional_email ?? '';
                    $senderName = $notification->sender?->name ?? config('mail.from.name', 'PMS Techxaro');
                    $mail = new \App\Mail\NotificationMail(
                        $notification,
                        $senderEmail,
                        $senderName
                    );
                    if (config('queue.default') !== 'sync') {
                        Mail::to($notification->user->professional_email)->queue($mail);
                    } else {
                        Mail::to($notification->user->professional_email)->send($mail);
                    }
                    Log::info('createBulk email sent', [
                        'notification_id' => $notification->id,
                        'recipient' => $notification->user->professional_email,
                        'type' => $notification->type,
                    ]);
                } catch (\Throwable $e) {
                    Log::error('createBulk email FAILED', [
                        'notification_id' => $notification->id,
                        'user_id' => $notification->user_id,
                        'error' => $e->getMessage(),
                        'file' => $e->getFile(),
                        'line' => $e->getLine(),
                    ]);
                }
            } else {
                Log::info('createBulk email skipped: wantsChannel false', [
                    'notification_id' => $notification->id,
                    'module' => $notification->related_module,
                ]);
            }

            if (Notification::wantsChannel($notification, 'mobile_push')) {
                try {
                    \App\Jobs\SendFcmNotification::dispatch($notification);
                } catch (\Throwable $e) {
                    Log::error('Failed to dispatch FCM push', [
                        'notification_id' => $notification->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
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
    public function notify(int $userId, ?int $senderId, string $type, string $module, int $relatedId, string $title, string $message, ?string $link = null, ?array $changes = null): ?Notification
    {
        return $this->create([
            'user_id' => $userId,
            'sender_user_id' => $senderId,
            'type' => $type,
            'related_module' => $module,
            'related_id' => $relatedId,
            'title' => $title,
            'message' => $message,
            'changes' => $changes,
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
    public function notifyMultiple(array $userIds, int $senderId, string $type, string $module, int $relatedId, string $title, string $message, ?string $link = null, ?array $changes = null): void
    {
        $notifications = array_map(fn(int $userId) => [
            'user_id' => $userId,
            'sender_user_id' => $senderId,
            'type' => $type,
            'related_module' => $module,
            'related_id' => $relatedId,
            'title' => $title,
            'message' => $message,
            'changes' => $changes,
            'link' => $link,
        ], $userIds);

        $this->createBulk($notifications);
    }

    /**
     * Notify users that a new deliverable has been added to their assigned task or project.
     *
     * Sends both an in-app notification and triggers an email (via model boot).
     * The notification includes context data (project name, task name, deliverable name,
     * who added it) stored in the `changes` JSON field for the email template.
     *
     * @param \App\Models\Deliverable $deliverable The newly created deliverable
     * @param \App\Models\User       $adder       The user who added the deliverable
     * @param array                  $recipientIds User IDs to notify (task/project assignees)
     * @param string                 $contextType  Either 'task' or 'project'
     *
     * @return void
     */
    public function notifyDeliverableAdded($deliverable, $adder, array $recipientIds, string $contextType = 'task'): void
    {
        $deliverable->loadMissing(['project:id,title', 'task:id,title']);

        $projectName = $deliverable->project->title ?? '';
        $taskName = $deliverable->task->title ?? '';
        $deliverableName = $deliverable->title;

        $contextLabel = $contextType === 'project' ? 'project' : 'task';
        $message = 'A new deliverable "' . $deliverableName . '" has been added';
        if ($taskName) $message .= ' under Task "' . $taskName . '"';
        if ($projectName) $message .= ' in Project "' . $projectName . '"';
        $message .= ' by ' . $adder->name . '.';

        $changes = [
            'project_name' => $projectName,
            'task_name' => $taskName,
            'deliverable_name' => $deliverableName,
            'deliverable_description' => $deliverable->description ?? '',
            'added_by_name' => $adder->name,
            'context_type' => $contextType,
        ];

        $filteredIds = array_values(array_filter($recipientIds, fn($id) => (int) $id !== (int) $adder->id));

        $notifications = [];
        foreach ($filteredIds as $userId) {
            $notifications[] = [
                'user_id' => $userId,
                'sender_user_id' => $adder->id,
                'type' => 'deliverable_added',
                'related_module' => 'deliverable',
                'related_id' => $deliverable->id,
                'title' => 'New Deliverable Added',
                'message' => $message,
                'changes' => $changes,
                'link' => '/deliveries?selectedDeliverable=' . $deliverable->id,
            ];
        }

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

    /**
     * Send a confirmation email to the user who performed an action.
     *
     * This provides an audit trail and confirmation that the action was completed.
     * No in-app notification is created — only an email is sent.
     *
     * @param \App\Models\User $performer   The user who performed the action
     * @param string           $actionVerb  Description of the action (e.g., "Assigned", "Approved", "Updated")
     * @param string           $entityType  Type of entity (e.g., "project", "task", "deliverable", "event")
     * @param string           $entityName  Name/title of the entity
     * @param array            $details     Key-value pairs of additional details to show
     *
     * @return void
     */
    public function confirmAction($performer, string $actionVerb, string $entityType, string $entityName, array $details = []): void
    {
        if (!$performer) {
            return;
        }

        // Sirf professional email (Outlook) pe bhejo
        // Personal email pe sirf first time welcome email jata hai
        if (empty($performer->professional_email)) {
            return;
        }

        $loginUrl = rtrim(config('app.frontend_url'), '/');

        try {
            $mail = new \App\Mail\ActionConfirmationMail(
                $performer->name,
                $actionVerb,
                $entityType,
                $entityName,
                $details,
                $loginUrl,
                $performer->professional_email,
                $performer->name
            );
            if (config('queue.default') !== 'sync') {
                Mail::to($performer->professional_email)->queue($mail);
            } else {
                Mail::to($performer->professional_email)->send($mail);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Failed to send action confirmation email', [
                'user_id' => $performer->id,
                'email' => $performer->professional_email,
                'action' => $actionVerb,
                'entity_type' => $entityType,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
