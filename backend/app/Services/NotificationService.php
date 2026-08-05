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
 * management, category preference filtering, and unread count retrieval.
 */
class NotificationService
{
    /**
     * Check if a user has enabled notifications for a specific event type and channel.
     *
     * @param User $user Recipient user
     * @param string $eventType Notification event type (e.g. task_assigned, project_created)
     * @param string $channel 'email' or 'desktop'
     *
     * @return bool
     */
    public function shouldSendNotification(User $user, string $eventType, string $channel = 'email'): bool
    {
        $mapping = config('notifications.event_mapping', []);
        $category = $mapping[$eventType] ?? 'task'; // Default to 'task' if unmapped

        $preferences = $user->notification_preferences;

        if (is_string($preferences)) {
            $preferences = json_decode($preferences, true);
        }
        if (is_string($preferences)) {
            $preferences = json_decode($preferences, true); // Handle double-encoded JSON
        }
        if (!is_array($preferences)) {
            $preferences = [];
        }

        // If preferences are entirely empty or missing this specific category/channel
        if (empty($preferences) || !isset($preferences[$category][$channel])) {
            // Self-actions & draft default to FALSE. Everything else defaults to TRUE.
            return in_array($category, ['self_actions', 'draft']) ? false : true;
        }

        // Strictly evaluate user's matrix toggle state in DB using robust boolean filtering (handles true, "true", 1, "1")
        $val = $preferences[$category][$channel];
        return filter_var($val, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Create a single notification for a user.
     *
     * Returns null if user_id is missing, the sender is notifying
     * themselves, or the user disabled desktop notifications for this category.
     *
     * @param array $data Notification attributes
     *
     * @return \App\Models\Notification|null
     */
    public function create(array $data): ?Notification
    {
        if (empty($data['user_id'])) return null;

        $recipient = User::find($data['user_id']);
        if ($recipient) {
            $this->dispatchWebhooks($recipient, $data);
        }

        if (isset($data['sender_user_id']) && (int) $data['user_id'] !== (int) $data['sender_user_id']) {
            $sender = User::find($data['sender_user_id']);
            if ($sender && (!empty($sender->slack_webhook_url) || !empty($sender->google_chat_webhook_url) || !empty($sender->ms_teams_webhook_url))) {
                $this->dispatchWebhooks($sender, $data);
            }
        }

        if (isset($data['sender_user_id']) && (int) $data['user_id'] === (int) $data['sender_user_id']) {
            return null;
        }

        if ($recipient && !empty($data['type'])) {
            if (!$this->shouldSendNotification($recipient, $data['type'], 'desktop')) {
                Log::info('Notification creation skipped due to user desktop preference', [
                    'user_id' => $data['user_id'],
                    'type' => $data['type'],
                ]);
                return null;
            }
        }

        return Notification::create($data);
    }

    /**
     * Create multiple notifications in a single database insert.
     *
     * Filters out missing user_ids, self-notifications, and users who
     * disabled desktop notifications for the event category.
     *
     * @param array $notifications Array of notification data arrays
     *
     * @return void
     */
    public function createBulk(array $notifications): void
    {
        if (empty($notifications)) return;

        // Extract all involved user IDs (both recipient user_id AND sender_user_id)
        $recipientIds = array_column($notifications, 'user_id');
        $senderIds = array_column($notifications, 'sender_user_id');
        $allUserIds = array_unique(array_filter(array_merge($recipientIds, $senderIds)));

        if (empty($allUserIds)) return;

        // Fetch valid users with preferences and webhook URLs loaded
        $usersMap = User::whereIn('id', $allUserIds)
            ->get(['id', 'notification_preferences', 'slack_webhook_url', 'google_chat_webhook_url', 'ms_teams_webhook_url'])
            ->keyBy('id');

        // Dispatch Webhooks for all notification events (for both recipients and senders with configured webhooks)
        foreach ($notifications as $n) {
            if (!empty($n['user_id'])) {
                $recipient = $usersMap->get($n['user_id']);
                if ($recipient) {
                    $this->dispatchWebhooks($recipient, $n);
                }
            }

            if (!empty($n['sender_user_id']) && (int) ($n['sender_user_id']) !== (int) ($n['user_id'] ?? 0)) {
                $sender = $usersMap->get($n['sender_user_id']);
                if ($sender && (!empty($sender->slack_webhook_url) || !empty($sender->google_chat_webhook_url) || !empty($sender->ms_teams_webhook_url))) {
                    $this->dispatchWebhooks($sender, $n);
                }
            }
        }

        // Basic filter: user_id present and not self-notification
        $filtered = array_filter($notifications, function ($n) {
            return !empty($n['user_id']) && (!isset($n['sender_user_id']) || (int) $n['user_id'] !== (int) $n['sender_user_id']);
        });

        if (empty($filtered)) {
            Log::info('createBulk: all internal DB notifications filtered out (self-notifications)', [
                'count' => count($notifications),
            ]);
            return;
        }

        $filtered = array_values($filtered);

        // Filter based on user desktop category preferences for DB insertion
        $filtered = array_filter($filtered, function ($n) use ($usersMap) {
            $user = $usersMap->get($n['user_id']);
            if (!$user) return false;

            if (!empty($n['type'])) {
                return $this->shouldSendNotification($user, $n['type'], 'desktop');
            }

            return true;
        });

        if (empty($filtered)) return;


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

        \App\Jobs\SendBulkNotificationEmails::dispatch($ids);
    }

    /**
     * Convenience method to notify a single user about an action.
     *
     * @param int    $userId  Recipient user ID
     * @param string $title   Notification title
     * @param string $message Notification body text
     * @param string $type    Category/event type
     *
     * @return \App\Models\Notification|null
     */
    public function notify(int $userId, string $title, string $message, string $type = 'system'): ?Notification
    {
        return $this->create([
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'related_module' => 'system',
            'related_id' => 0,
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
     * @param array|null  $changes   Optional changes metadata
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
     * @param \App\Models\Deliverable $deliverable The newly created deliverable
     * @param \App\Models\User       $adder       The user who added the deliverable
     * @param array                  $recipientIds User IDs to notify (task/project assignees)
     * @param string                 $contextType  Either 'task' or 'project'
     *
     * @return void
     */
    public function notifyDeliverableAdded($deliverable, $adder, array $recipientIds, string $contextType = 'task'): void
    {
        $deliverable->loadMissing(['project:id,title,business_id', 'task:id,title,business_id']);

        $projectName = $deliverable->project->title ?? '';
        $projectCode = $deliverable->project->business_id ?? '';
        $taskName = $deliverable->task->title ?? '';
        $taskCode = $deliverable->task->business_id ?? '';
        $deliverableName = $deliverable->title;
        $subtaskCode = $deliverable->business_id ?? '';

        $message = 'A new deliverable "'.$deliverableName.'"';
        if ($subtaskCode) $message .= ' ('.$subtaskCode.')';
        $message .= ' has been added';
        if ($taskName) $message .= ' under Task "'.$taskName.'"';
        if ($taskCode) $message .= ' ('.$taskCode.')';
        if ($projectName) $message .= ' in Project "'.$projectName.'"';
        if ($projectCode) $message .= ' ('.$projectCode.')';
        $message .= ' by '.$adder->name.'.';

        $changes = [
            'project_name' => $projectName,
            'task_name' => $taskName,
            'deliverable_name' => $deliverableName,
            'subtask_code' => $subtaskCode,
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
     * @param int $userId Owner user ID
     *
     * @return int
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

    /**
     * Dispatch third-party webhook alerts for Slack, Google Chat, and Microsoft Teams.
     */
    public function dispatchWebhooks(User $user, array $notificationData): void
    {
        $eventType = $notificationData['type'] ?? 'task';
        $title = $notificationData['title'] ?? 'Notification Alert';
        $message = $notificationData['message'] ?? '';
        $link = $notificationData['link'] ?? null;

        $cleanMessage = strip_tags($message);
        $textPayload = "🔔 *{$title}*\n{$cleanMessage}";
        if ($link) {
            $baseUrl = rtrim(config('app.url', 'http://localhost:5173'), '/');
            $fullLink = $baseUrl . '/' . ltrim($link, '/');
            $textPayload .= "\n🔗 <{$fullLink}|View Details>";
        }

        // 1. Slack Webhook (Strictly requires Content-Type: application/json and "text" key)
        if (!empty($user->slack_webhook_url)) {
            $shouldSend = $this->shouldSendNotification($user, $eventType, 'slack');
            if ($shouldSend) {
                Log::info('Attempting Slack webhook dispatch', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                    'url' => $user->slack_webhook_url,
                    'payload' => ['text' => $textPayload],
                ]);
                try {
                    $response = \Illuminate\Support\Facades\Http::withHeaders([
                        'Content-Type' => 'application/json',
                        'Accept' => 'application/json',
                    ])->post($user->slack_webhook_url, [
                        'text' => $textPayload,
                    ]);

                    if ($response->failed()) {
                        Log::error('Slack webhook dispatch failed', [
                            'status' => $response->status(),
                            'response' => $response->body(),
                            'user_id' => $user->id,
                            'url' => $user->slack_webhook_url,
                        ]);
                    } else {
                        Log::info('Slack webhook sent successfully', ['user_id' => $user->id, 'status' => $response->status()]);
                    }
                } catch (\Throwable $e) {
                    Log::error('Slack webhook dispatch exception', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
                }
            } else {
                Log::info('Slack webhook skipped due to category preference settings', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                ]);
            }
        }

        // 2. Google Chat Webhook (Requires URL + Category Matrix Toggle ON)
        if (!empty($user->google_chat_webhook_url)) {
            $shouldSend = $this->shouldSendNotification($user, $eventType, 'google_chat');
            if ($shouldSend) {
                Log::info('Attempting Google Chat webhook dispatch', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                    'url' => $user->google_chat_webhook_url,
                ]);
                try {
                    $response = \Illuminate\Support\Facades\Http::withHeaders([
                        'Content-Type' => 'application/json',
                        'Accept' => 'application/json',
                    ])->post($user->google_chat_webhook_url, [
                        'text' => $textPayload,
                    ]);

                    if ($response->failed()) {
                        Log::error('Google Chat webhook dispatch failed', [
                            'status' => $response->status(),
                            'response' => $response->body(),
                            'user_id' => $user->id,
                            'url' => $user->google_chat_webhook_url,
                        ]);
                    } else {
                        Log::info('Google Chat webhook sent successfully', ['user_id' => $user->id, 'status' => $response->status()]);
                    }
                } catch (\Throwable $e) {
                    Log::error('Google Chat webhook dispatch exception', ['error' => $e->getMessage()]);
                }
            } else {
                Log::info('Google Chat webhook skipped due to Category Matrix Toggle OFF', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                ]);
            }
        }

        // 3. Microsoft Teams Webhook (Requires URL + Category Matrix Toggle ON)
        if (!empty($user->ms_teams_webhook_url)) {
            $shouldSend = $this->shouldSendNotification($user, $eventType, 'teams_channel');
            if ($shouldSend) {
                Log::info('Attempting MS Teams webhook dispatch', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                    'url' => $user->ms_teams_webhook_url,
                ]);
                try {
                    $baseUrl = rtrim(config('app.url', 'http://localhost:5173'), '/');
                    $fullLink = $link ? $baseUrl . '/' . ltrim($link, '/') : null;

                    $teamsPayload = [
                        '@type' => 'MessageCard',
                        '@context' => 'http://schema.org/extensions',
                        'summary' => $title,
                        'themeColor' => '6366F1',
                        'title' => '🔔 ' . $title,
                        'text' => $cleanMessage . ($fullLink ? "\n\n[View Details](" . $fullLink . ")" : ""),
                    ];

                    $response = \Illuminate\Support\Facades\Http::withHeaders([
                        'Content-Type' => 'application/json',
                        'Accept' => 'application/json',
                    ])->post($user->ms_teams_webhook_url, $teamsPayload);

                    if ($response->failed()) {
                        // Fallback to simple text payload for Power Automate / Workflows
                        $fallbackResponse = \Illuminate\Support\Facades\Http::withHeaders([
                            'Content-Type' => 'application/json',
                            'Accept' => 'application/json',
                        ])->post($user->ms_teams_webhook_url, [
                            'text' => $textPayload,
                        ]);

                        if ($fallbackResponse->failed()) {
                            Log::error('MS Teams webhook dispatch failed', [
                                'status' => $fallbackResponse->status(),
                                'response' => $fallbackResponse->body(),
                                'user_id' => $user->id,
                                'url' => $user->ms_teams_webhook_url,
                            ]);
                        } else {
                            Log::info('MS Teams fallback webhook sent successfully', ['user_id' => $user->id]);
                        }
                    } else {
                        Log::info('MS Teams webhook sent successfully', ['user_id' => $user->id, 'status' => $response->status()]);
                    }
                } catch (\Throwable $e) {
                    Log::error('MS Teams webhook dispatch exception', ['error' => $e->getMessage()]);
                }
            } else {
                Log::info('MS Teams webhook skipped due to Category Matrix Toggle OFF', [
                    'user_id' => $user->id,
                    'event_type' => $eventType,
                ]);
            }
        }
    }

    /**
     * Send a confirmation email to the user who performed an action.
     *
     * Respects the user's 'self_actions' email notification settings.
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
        // Per Receiver-Only notification rule: Senders (performers) do NOT receive confirmation emails for actions they trigger.
        // Only receivers/recipients receive email notifications.
        if ($performer) {
            Log::info('Action confirmation email skipped (Receiver-Only notification policy enforced)', [
                'user_id' => $performer->id,
                'entity_type' => $entityType,
                'action' => $actionVerb,
            ]);
        }
        return;
    }
}