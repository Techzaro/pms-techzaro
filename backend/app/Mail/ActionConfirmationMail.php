<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ActionConfirmationMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $performerName;
    public string $actionVerb;
    public string $entityType;
    public string $entityName;
    public array $details;
    public string $loginUrl;

    public function __construct(
        string $performerName,
        string $actionVerb,
        string $entityType,
        string $entityName,
        array $details = [],
        string $loginUrl = ''
    ) {
        $this->performerName = $performerName;
        $this->actionVerb = $actionVerb;
        $this->entityType = $entityType;
        $this->entityName = $entityName;
        $this->details = $details;
        $this->loginUrl = $loginUrl;
    }

    public function envelope(): Envelope
    {
        $subject = ucfirst($this->entityType) . ' ' . $this->actionVerb . ' Confirmation';
        return new Envelope(
            subject: $subject,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.action-confirmation',
        );
    }
}
