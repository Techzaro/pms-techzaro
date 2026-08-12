<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

/**
 * TenantMailManager.
 *
 * Manages tenant-aware email configuration.
 * Supports shared SMTP or per-tenant SMTP credentials.
 * Mail configuration can be switched at runtime.
 */
class TenantMailManager
{
    protected ?Organization $organization = null;

    /**
     * Set the current tenant context.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
        $this->configureMail($organization);
    }

    /**
     * Get the mail configuration for an organization.
     *
     * If the organization has custom SMTP settings, use them.
     * Otherwise, fall back to the global/shared SMTP.
     */
    public function getMailConfig(Organization $organization): array
    {
        $settings = $organization->settings ?? [];

        // Check for per-tenant SMTP settings
        if (!empty($settings['smtp_host'])) {
            return [
                'mailer' => 'tenant_smtp',
                'host'   => $settings['smtp_host'],
                'port'   => $settings['smtp_port'] ?? 587,
                'encryption' => $settings['smtp_encryption'] ?? 'tls',
                'username' => $settings['smtp_username'] ?? '',
                'password' => $settings['smtp_password'] ?? '',
                'from' => [
                    'address' => $settings['mail_from_address'] ?? config('mail.from.address'),
                    'name'    => $settings['mail_from_name'] ?? config('mail.from.name'),
                ],
            ];
        }

        // Fall back to shared SMTP
        return [
            'mailer' => config('mail.default', 'log'),
            'from' => [
                'address' => config('mail.from.address'),
                'name'    => config('mail.from.name'),
            ],
        ];
    }

    /**
     * Configure the mailer for the current tenant.
     */
    protected function configureMail(Organization $organization): void
    {
        $config = $this->getMailConfig($organization);

        // Override the global mail from address
        if (!empty($config['from'])) {
            config()->set('mail.from.address', $config['from']['address']);
            config()->set('mail.from.name', $config['from']['name']);
        }

        // If tenant has custom SMTP, configure it
        if ($config['mailer'] === 'tenant_smtp') {
            config()->set('mail.mailers.tenant_smtp', [
                'transport'  => 'smtp',
                'host'       => $config['host'],
                'port'       => $config['port'],
                'encryption' => $config['encryption'],
                'username'   => $config['username'],
                'password'   => $config['password'],
                'timeout'    => null,
                'local_domain' => null,
            ]);

            config()->set('mail.default', 'tenant_smtp');
        }
    }

    /**
     * Get the from address for the current tenant.
     */
    public function getFromAddress(): string
    {
        if ($this->organization) {
            $settings = $this->organization->settings ?? [];
            return $settings['mail_from_address'] ?? config('mail.from.address');
        }

        return config('mail.from.address');
    }

    /**
     * Get the from name for the current tenant.
     */
    public function getFromName(): string
    {
        if ($this->organization) {
            $settings = $this->organization->settings ?? [];
            return $settings['mail_from_name'] ?? config('mail.from.name');
        }

        return config('mail.from.name');
    }

    /**
     * Clear the tenant mail context.
     */
    public function clearTenant(): void
    {
        $this->organization = null;

        // Restore default mail config
        config()->set('mail.default', env('MAIL_MAILER', 'log'));
    }
}
