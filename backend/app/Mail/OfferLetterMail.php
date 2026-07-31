<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\HrmOfferLetter;

class OfferLetterMail extends Mailable
{
    use Queueable, SerializesModels;

    public HrmOfferLetter $offer;
    public string $portalUrl;
    public string $senderEmail;
    public string $senderName;

    public function __construct(HrmOfferLetter $offer, string $portalUrl)
    {
        $this->offer = $offer;
        $this->portalUrl = $portalUrl;
        $this->senderEmail = config('mail.from.address', 'noreply@techxaro.com');
        $this->senderName = config('mail.from.name', 'PMS Techxaro');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: 'Job Offer: ' . $this->offer->job_title . ' at Techzaro',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.offer-letter',
        );
    }
}
