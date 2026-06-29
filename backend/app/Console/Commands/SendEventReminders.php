<?php

namespace App\Console\Commands;

use App\Models\Event;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Artisan command that sends reminder notifications for upcoming events.
 *
 * Checks for events starting at 24 hours, 1 hour, and 15 minutes from now,
 * and sends notification reminders to assigned users (or all users for global events).
 * Prevents duplicate reminders within a 12-hour window.
 *
 * Usage: php artisan events:send-reminders
 */
class SendEventReminders extends Command
{
    /** @var string The artisan command signature */
    protected $signature = 'events:send-reminders';

    /** @var string Command description shown in artisan help */
    protected $description = 'Send reminder notifications for upcoming events';

    /**
     * Execute the command: scan upcoming events and send reminders.
     *
     * Iterates through three time intervals (24h, 1h, 15m), finds events
     * starting within each window, and creates notification records for
     * each recipient. Skips duplicates found within the last 12 hours.
     *
     * @return int Command exit code
     */
    public function handle(): int
    {
        $now = now();

        // Define reminder intervals before event start
        $intervals = [
            ['label' => '24 hours', 'minutes' => 1440],
            ['label' => '1 hour', 'minutes' => 60],
            ['label' => '15 minutes', 'minutes' => 15],
        ];

        $sent = 0;
        $duplicates = 0;

        foreach ($intervals as $interval) {
            // Calculate the time window for this interval
            $targetStart = $now->copy()->addMinutes($interval['minutes']);
            $targetEnd = $targetStart->copy()->addMinute();

            // Find events starting within this 1-minute window
            $events = Event::where('start_date', '>=', $targetStart)
                ->where('start_date', '<', $targetEnd)
                ->get();

            foreach ($events as $event) {
                $recipientIds = $this->getEventRecipientIds($event);

                foreach ($recipientIds as $recipientId) {
                    // Check for duplicate reminder within the last 12 hours
                    $exists = Notification::where('user_id', $recipientId)
                        ->where('type', 'event_reminder')
                        ->where('related_module', 'event')
                        ->where('related_id', $event->id)
                        ->where('created_at', '>=', now()->subHours(12))
                        ->exists();

                    // Skip if duplicate reminder already sent recently
                    if ($exists) {
                        $duplicates++;
                        continue;
                    }

                    // Create the reminder notification
                    Notification::create([
                        'user_id' => $recipientId,
                        'sender_user_id' => $event->user_id,
                        'type' => 'event_reminder',
                        'related_module' => 'event',
                        'related_id' => $event->id,
                        'title' => 'Event Reminder',
                        'message' => "Reminder: '" . $event->title . "' starts in " . $interval['label'] . ".",
                        'link' => '/calender',
                    ]);

                    $sent++;
                }
            }
        }

        $this->info("Sent {$sent} reminder(s). Skipped {$duplicates} duplicate(s).");

        return Command::SUCCESS;
    }

    /**
     * Determine which user IDs should receive the event reminder.
     *
     * Returns all active users for global events, assigned users for
     * team events, or falls back to the event creator if no users are assigned.
     *
     * @param \App\Models\Event $event The event to check recipients for
     *
     * @return array<int> Array of user IDs
     */
    private function getEventRecipientIds(Event $event): array
    {
        // Global events notify all active users
        if ($event->is_global) {
            return User::where('active', true)->pluck('id')->toArray();
        }

        // Use assigned users if any exist
        $assignedIds = $event->assignedUsers()->pluck('user_id')->toArray();

        if (!empty($assignedIds)) {
            return $assignedIds;
        }

        // Fall back to the event creator
        return [$event->user_id];
    }
}
