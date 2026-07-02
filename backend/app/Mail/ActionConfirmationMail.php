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
    public string $senderEmail;
    public string $senderName;

    public function __construct(
        string $performerName,
        string $actionVerb,
        string $entityType,
        string $entityName,
        array $details = [],
        string $loginUrl = '',
        string $senderEmail = '',
        string $senderName = 'PMS Techxaro'
    ) {
        $this->performerName = $performerName;
        $this->actionVerb = $actionVerb;
        $this->entityType = $entityType;
        $this->entityName = $entityName;
        $this->details = $details;
        $this->loginUrl = $loginUrl;
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');
    }

    public function envelope(): Envelope
    {
        $subject = ucfirst($this->entityType) . ' ' . $this->actionVerb . ' Confirmation';
        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
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
