<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\HrmCandidate;

class InterviewInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public HrmCandidate $candidate;
    public string $interviewDate;
    public string $interviewTime;
    public string $interviewType;
    public string $meetingLink;
    public string $notes;
    public string $senderEmail;
    public string $senderName;

    public function __construct(
        HrmCandidate $candidate,
        string $interviewDate,
        string $interviewTime,
        string $interviewType = 'Online Video Call',
        string $meetingLink = '',
        string $notes = ''
    ) {
        $this->candidate = $candidate;
        $this->interviewDate = $interviewDate;
        $this->interviewTime = $interviewTime;
        $this->interviewType = $interviewType;
        $this->meetingLink = $meetingLink;
        $this->notes = $notes;
        $this->senderEmail = config('mail.from.address', 'hr@techxaro.com');
        $this->senderName = config('mail.from.name', 'TechXaro Recruitment');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: 'Interview Invitation: TechXaro Recruitment Team',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.interview-invitation',
        );
    }
}
