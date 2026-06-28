<?php

namespace App\Mail;

use App\Models\Notification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class NotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public Notification $notification;
    public string $frontendUrl;

    public function __construct(Notification $notification)
    {
        $this->notification = $notification;
        $this->frontendUrl = rtrim(config('app.frontend_url'), '/');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->notification->title ?: 'PMS Notification',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.notification',
        );
    }
}
