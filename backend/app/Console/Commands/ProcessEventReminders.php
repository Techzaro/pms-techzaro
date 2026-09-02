<?php

namespace App\Console\Commands;

use App\Models\Event;
use App\Models\EventReminder;
use App\Models\Notification;
use App\Models\User;
use App\Notifications\EventNotification;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Artisan command that processes and dispatches dynamic event reminders.
 *
 * Checks configured event_reminders records and default intervals,
 * and sends reminder notifications to assigned attendees or specific users.
 *
 * Usage: php artisan events:process-reminders
 */
class ProcessEventReminders extends Command
{
    /** @var string The artisan command signature */
    protected $signature = 'events:process-reminders';

    /** @var string Command description */
    protected $description = 'Process and dispatch scheduled dynamic event reminders';

    public function handle(): int
    {
        $now = now();
        $processedCount = 0;

        // 1. Process custom dynamic reminders from event_reminders table
        $reminders = EventReminder::with(['event.assignedUsers', 'event.participants', 'user'])
            ->where('is_sent', false)
            ->whereHas('event', function ($q) {
                $q->whereNotIn('status', ['cancelled', 'completed'])
                  ->where('start_date', '>=', now()->subHours(2));
            })
            ->get();

        foreach ($reminders as $reminder) {
            $event = $reminder->event;
            if (!$event || !$event->start_date) {
                continue;
            }

            $startDate = Carbon::parse($event->start_date);

            // Compute trigger time = start_date - value (in unit)
            $triggerTime = match (strtolower($reminder->unit)) {
                'days', 'day' => $startDate->copy()->subDays($reminder->value),
                'hours', 'hour' => $startDate->copy()->subHours($reminder->value),
                default => $startDate->copy()->subMinutes($reminder->value),
            };

            // If the current time has reached or passed the trigger time (within a reasonable window before event end)
            if ($now->greaterThanOrEqualTo($triggerTime) && $now->lessThanOrEqualTo($startDate->copy()->addMinutes(15))) {
                $recipients = $this->resolveRecipients($event, $reminder->user_id);

                foreach ($recipients as $recipient) {
                    $userTz = NotificationService::resolveUserTimezone($recipient);
                    $localTime = $startDate->copy()->setTimezone($userTz)->format('d M Y, g:i A');
                    $timeString = "{$reminder->value} {$reminder->unit}";

                    $title = "Event Reminder: {$event->title}";
                    $message = "Reminder: '{$event->title}' starts in {$timeString} (at {$localTime} {$userTz}).";

                    // Create database notification
                    Notification::create([
                        'user_id' => $recipient->id,
                        'sender_user_id' => $event->user_id,
                        'type' => 'event_reminder',
                        'related_module' => 'event',
                        'related_id' => $event->id,
                        'title' => $title,
                        'message' => $message,
                        'link' => "/events/{$event->id}",
                    ]);

                    // Send Laravel notification if needed
                    try {
                        $recipient->notify(new EventNotification($event, 'reminder', $event->user, $message));
                    } catch (\Throwable $e) {
                        // Keep resilient if mail is unconfigured
                    }
                }

                $reminder->update([
                    'is_sent' => true,
                    'sent_at' => $now,
                ]);

                $processedCount++;
            }
        }

        // 2. Default fallback intervals for events with NO custom reminders
        $defaultEvents = Event::with(['assignedUsers', 'participants'])
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->whereDoesntHave('reminders')
            ->where('start_date', '>=', $now)
            ->where('start_date', '<=', $now->copy()->addDay())
            ->get();

        $defaultIntervals = [
            ['value' => 1440, 'label' => '24 hours'],
            ['value' => 60, 'label' => '1 hour'],
            ['value' => 15, 'label' => '15 minutes'],
        ];

        foreach ($defaultEvents as $event) {
            $startDate = Carbon::parse($event->start_date);
            $diffInMinutes = $now->diffInMinutes($startDate, false);

            foreach ($defaultIntervals as $interval) {
                if ($diffInMinutes >= ($interval['value'] - 2) && $diffInMinutes <= $interval['value']) {
                    $recipients = $this->resolveRecipients($event, null);
                    foreach ($recipients as $recipient) {
                        $exists = Notification::where('user_id', $recipient->id)
                            ->where('type', 'event_reminder')
                            ->where('related_module', 'event')
                            ->where('related_id', $event->id)
                            ->where('created_at', '>=', now()->subHours(6))
                            ->exists();

                        if ($exists) continue;

                        $userTz = NotificationService::resolveUserTimezone($recipient);
                        $localTime = $startDate->copy()->setTimezone($userTz)->format('d M Y, g:i A');

                        Notification::create([
                            'user_id' => $recipient->id,
                            'sender_user_id' => $event->user_id,
                            'type' => 'event_reminder',
                            'related_module' => 'event',
                            'related_id' => $event->id,
                            'title' => "Event Reminder: {$event->title}",
                            'message' => "Reminder: '{$event->title}' starts in {$interval['label']} (at {$localTime} {$userTz}).",
                            'link' => "/events/{$event->id}",
                        ]);
                    }
                }
            }
        }

        $this->info("Processed {$processedCount} dynamic event reminders.");
        return 0;
    }

    private ?\Illuminate\Support\Collection $cachedActiveUsers = null;

    /**
     * Resolve users who should receive the reminder.
     *
     * @return \Illuminate\Support\Collection<int, User>
     */
    private function resolveRecipients(Event $event, ?int $specificUserId)
    {
        if ($specificUserId) {
            $u = User::find($specificUserId);
            return $u ? collect([$u]) : collect();
        }

        if ($event->is_global || $event->visibility_level === 'organization') {
            if ($this->cachedActiveUsers === null) {
                $this->cachedActiveUsers = User::where('status', 'active')->orWhereNull('status')->get();
            }
            return $this->cachedActiveUsers;
        }

        $users = collect();
        if ($event->assignedUsers && $event->assignedUsers->isNotEmpty()) {
            $users = $users->merge($event->assignedUsers);
        }
        if ($event->participants && $event->participants->isNotEmpty()) {
            $participantUserIds = $event->participants->pluck('user_id')->toArray();
            $pUsers = User::whereIn('id', $participantUserIds)->get();
            $users = $users->merge($pUsers);
        }

        if ($users->isEmpty() && $event->user_id) {
            $creator = User::find($event->user_id);
            if ($creator) $users->push($creator);
        }

        return $users->unique('id');
    }
}
