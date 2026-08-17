<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class StorageLimitChangedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $orgName;
    public string $action;
    public float $oldLimit;
    public float $newLimit;
    public string $adminName;
    public string $frontendUrl;
    public string $superAdminTenant;

    public function __construct(
        string $orgName,
        string $action,
        float $oldLimit,
        float $newLimit,
        string $adminName,
        string $frontendUrl,
        string $superAdminTenant = 'techxaro'
    ) {
        $this->orgName = $orgName;
        $this->action = $action;
        $this->oldLimit = $oldLimit;
        $this->newLimit = $newLimit;
        $this->adminName = $adminName;
        $this->frontendUrl = $frontendUrl;
        $this->superAdminTenant = $superAdminTenant;

        $this->onQueue('emails');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "[{$this->orgName}] Storage Limit " . ucfirst($this->action),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.storage-limit-changed',
            with: [
                'org_name'          => $this->orgName,
                'action'            => $this->action,
                'old_limit'         => $this->oldLimit,
                'new_limit'         => $this->newLimit,
                'admin_name'        => $this->adminName,
                'frontend_url'      => $this->frontendUrl,
                'super_admin_tenant' => $this->superAdminTenant,
            ],
        );
    }
}
