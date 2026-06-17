<?php

namespace App\Console\Commands;

use App\Models\Event;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Console\Command;

class SendEventReminders extends Command
{
    protected $signature = 'events:send-reminders';
    protected $description = 'Send reminder notifications for upcoming events';

    public function handle(): int
    {
        $now = now();
        $intervals = [
            ['label' => '24 hours', 'minutes' => 1440],
            ['label' => '1 hour', 'minutes' => 60],
            ['label' => '15 minutes', 'minutes' => 15],
        ];

        $sent = 0;
        $duplicates = 0;

        foreach ($intervals as $interval) {
            $targetStart = $now->copy()->addMinutes($interval['minutes']);
            $targetEnd = $targetStart->copy()->addMinute();

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

                    if ($exists) {
                        $duplicates++;
                        continue;
                    }

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

    private function getEventRecipientIds(Event $event): array
    {
        if ($event->is_global) {
            return User::where('active', true)->pluck('id')->toArray();
        }

        $assignedIds = $event->assignedUsers()->pluck('user_id')->toArray();

        if (!empty($assignedIds)) {
            return $assignedIds;
        }

        return [$event->user_id];
    }
}
