<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class StorageAlertMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $orgName;
    public string $planName;
    public float $usagePercent;
    public float $usedGb;
    public float $maxGb;
    public float $remainingMb;
    public string $level;
    public string $frontendUrl;
    public string $superAdminTenant;

    public function __construct(
        string $orgName,
        string $planName,
        float $usagePercent,
        float $usedGb,
        float $maxGb,
        float $remainingMb,
        string $level,
        string $frontendUrl,
        string $superAdminTenant = 'techxaro'
    ) {
        $this->orgName = $orgName;
        $this->planName = $planName;
        $this->usagePercent = $usagePercent;
        $this->usedGb = $usedGb;
        $this->maxGb = $maxGb;
        $this->remainingMb = $remainingMb;
        $this->level = $level;
        $this->frontendUrl = $frontendUrl;
        $this->superAdminTenant = $superAdminTenant;

        $this->onQueue('emails');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "[{$this->orgName}] Storage Alert: " . ucfirst($this->level) . " - Action Required",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.storage-alert',
            with: [
                'org_name'         => $this->orgName,
                'plan_name'        => $this->planName,
                'usage_percent'    => $this->usagePercent,
                'used_gb'          => $this->usedGb,
                'max_gb'           => $this->maxGb,
                'remaining_mb'     => $this->remainingMb,
                'level'            => $this->level,
                'frontend_url'     => $this->frontendUrl,
                'super_admin_tenant' => $this->superAdminTenant,
            ],
        );
    }
}
