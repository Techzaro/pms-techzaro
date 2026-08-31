<?php

namespace App\Notifications;

use App\Models\Event;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EventNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Event $event,
        public string $action = 'created', // created, updated, cancelled, participant_added, reminder
        public ?User $sender = null,
        public ?string $customMessage = null
    ) {}

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        $actionTitle = match ($this->action) {
            'created' => 'New Event Scheduled',
            'updated' => 'Event Updated',
            'cancelled' => 'Event Cancelled',
            'participant_added' => 'You Were Added to an Event',
            'reminder' => 'Upcoming Event Reminder',
            default => 'Event Notification',
        };

        $mail = (new MailMessage)
            ->subject("{$actionTitle}: {$this->event->title}")
            ->line($this->getMessage($notifiable))
            ->line("Date: " . ($this->event->start_date ? $this->event->start_date->format('d M Y, h:i A') : 'N/A'));

        if (!empty($this->event->meeting_link)) {
            $mail->action('Join Meeting', $this->event->meeting_link);
        }

        return $mail;
    }

    /**
     * Get the array representation of the notification for database storage.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'event_id' => $this->event->id,
            'title' => $this->getTitle(),
            'message' => $this->getMessage($notifiable),
            'action' => $this->action,
            'type' => "event_{$this->action}",
            'related_module' => 'event',
            'related_id' => $this->event->id,
            'sender_id' => $this->sender?->id ?? $this->event->user_id,
            'sender_name' => $this->sender?->name ?? ($this->event->user?->name ?? 'System'),
            'link' => "/events/{$this->event->id}",
            'meeting_link' => $this->event->meeting_link,
            'start_date' => $this->event->start_date?->toIso8601String(),
        ];
    }

    /**
     * Compute notification title.
     */
    public function getTitle(): string
    {
        return match ($this->action) {
            'created' => "New Event: {$this->event->title}",
            'updated' => "Updated: {$this->event->title}",
            'cancelled' => "Cancelled: {$this->event->title}",
            'participant_added' => "Added to Event: {$this->event->title}",
            'reminder' => "Reminder: {$this->event->title}",
            default => "Event: {$this->event->title}",
        };
    }

    /**
     * Compute notification body message.
     */
    public function getMessage(object $notifiable): string
    {
        if (!empty($this->customMessage)) {
            return $this->customMessage;
        }

        $dateStr = $this->event->start_date ? $this->event->start_date->format('d M Y, h:i A') : 'Upcoming';

        return match ($this->action) {
            'created' => "You have been invited to '{$this->event->title}' scheduled for {$dateStr}.",
            'updated' => "Event '{$this->event->title}' has been updated. Date: {$dateStr}.",
            'cancelled' => "Event '{$this->event->title}' scheduled for {$dateStr} has been cancelled.",
            'participant_added' => "You were added as a participant to '{$this->event->title}' scheduled for {$dateStr}.",
            'reminder' => "Reminder: '{$this->event->title}' is starting soon ({$dateStr}).",
            default => "Event '{$this->event->title}' notification.",
        };
    }
}
