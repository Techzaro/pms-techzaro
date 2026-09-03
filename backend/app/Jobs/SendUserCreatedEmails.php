<?php

namespace App\Jobs;

use App\Mail\UserCreated;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Foundation\Queue\Queueable as QueueableTrait;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendUserCreatedEmails
{
    use QueueableTrait, InteractsWithQueue, SerializesModels;

    public int $tries = 3;
    public int $timeout = 60;

    public function __construct(
        public User $user,
        public string $plainPassword,
        public string $profEmail = '',
        public string $profPassword,
        public string $loginUrl,
        public array $emailAttachments,
        public ?string $personalEmail = null,
        public ?string $adderEmail = null,
        public string $adderName = 'PMS Techxaro',
        public string $emailMode = 'single',
    ) {}

    public function handle(): void
    {
        // Send welcome email only to the new user (not to admin — admin already knows they created the user)
        $recipientEmail = $this->personalEmail ?: $this->profEmail;
        if ($recipientEmail) {
            try {
                Mail::to($recipientEmail)->send(
                    new UserCreated($this->user, $this->plainPassword, $this->profEmail, $this->profPassword, $this->loginUrl, $this->emailAttachments, false, '', $this->adderEmail, $this->adderName, $this->emailMode)
                );
                Log::info("Welcome email sent to {$recipientEmail} for user ID {$this->user->id}");
            } catch (\Throwable $e) {
                Log::error("Failed to send welcome email to {$recipientEmail}: " . $e->getMessage());
            }
        }
    }
}
