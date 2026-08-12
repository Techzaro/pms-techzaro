<?php

namespace App\Jobs;

use App\Mail\OrganizationWelcome;
use App\Models\Master\Organization;
use Illuminate\Bus\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendOrganizationWelcomeEmail
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 5;

    public function __construct(
        public Organization $organization,
        public string $adminName,
        public string $adminEmail,
        public string $plainPassword,
        public string $loginUrl,
    ) {
    }

    public function handle(): void
    {
        try {
            Mail::to($this->adminEmail)->send(
                new OrganizationWelcome(
                    $this->organization,
                    $this->adminName,
                    $this->adminEmail,
                    $this->plainPassword,
                    $this->loginUrl,
                )
            );
            Log::info("Welcome email sent to {$this->adminEmail} for org {$this->organization->name}");
        } catch (\Throwable $e) {
            Log::warning("Welcome email failed for {$this->adminEmail}: " . $e->getMessage());
            throw $e;
        }
    }
}
