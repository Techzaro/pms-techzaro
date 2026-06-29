<?php

namespace App\Mail;

use App\Models\Notification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable for sending in-app notifications via email.
 *
 * Implements ShouldQueue to send emails asynchronously.
 * Uses the 'emails.notification' Blade template.
 */
class NotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /** @var \App\Models\Notification The notification being sent */
    public Notification $notification;

    /** @var string The frontend application URL for deep links */
    public string $frontendUrl;

    /**
     * Create a new mail instance.
     *
     * @param \App\Models\Notification $notification The notification to email
     */
    public function __construct(Notification $notification)
    {
        $this->notification = $notification;
        $this->frontendUrl = rtrim(config('app.frontend_url'), '/');
    }

    /**
     * Build the message envelope with subject line.
     *
     * @return \Illuminate\Mail\Mailables\Envelope
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->notification->title ?: 'PMS Notification',
        );
    }

    /**
     * Define the message content and template.
     *
     * @return \Illuminate\Mail\Mailables\Content
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.notification',
        );
    }
}
