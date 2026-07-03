<?php

namespace App\Jobs;

use App\Mail\UserCreated;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable as QueueableTrait;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendUserCreatedEmails implements ShouldQueue
{
    use QueueableTrait, InteractsWithQueue, SerializesModels;

    public int $tries = 3;
    public int $timeout = 60;

    public function __construct(
        public User $user,
        public string $plainPassword,
        public string $profEmail,
        public string $profPassword,
        public string $loginUrl,
        public array $emailAttachments,
        public string $personalEmail,
        public string $adderEmail,
        public string $adderName,
    ) {}

    public function handle(): void
    {
        if ($this->personalEmail) {
            try {
                Mail::to($this->personalEmail)->send(
                    new UserCreated($this->user, $this->plainPassword, $this->profEmail, $this->profPassword, $this->loginUrl, $this->emailAttachments, false, '', $this->adderEmail, $this->adderName)
                );
                Log::info("Welcome email sent to {$this->personalEmail} for user ID {$this->user->id}");
            } catch (\Throwable $e) {
                Log::error("Failed to send welcome email to {$this->personalEmail}: " . $e->getMessage());
            }
        }

        if ($this->adderEmail) {
            try {
                Mail::to($this->adderEmail)->send(
                    new UserCreated($this->user, $this->plainPassword, $this->profEmail, $this->profPassword, $this->loginUrl, $this->emailAttachments, true, $this->adderName, $this->adderEmail, $this->adderName)
                );
                Log::info("Confirmation email sent to {$this->adderEmail} for user ID {$this->user->id}");
            } catch (\Throwable $e) {
                Log::error("Failed to send confirmation email to {$this->adderEmail}: " . $e->getMessage());
            }
        }
    }
}
