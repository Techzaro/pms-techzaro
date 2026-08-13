<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Storage;

/**
 * TenantFilesystemManager.
 *
 * Manages tenant-aware filesystem configuration.
 * Prepares the infrastructure for local, S3, R2, and Azure storage.
 * Each tenant gets isolated storage paths.
 */
class TenantFilesystemManager
{
    protected ?Organization $organization = null;

    /**
     * Set the current tenant context.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
        $this->configureFilesystem($organization);
    }

    /**
     * Get the filesystem configuration for an organization.
     */
    public function getFilesystemConfig(Organization $organization): array
    {
        $settings = $organization->settings ?? [];

        // Check for per-tenant cloud storage settings
        if (!empty($settings['s3_key'])) {
            return [
                'disk' => 'tenant_s3',
                'config' => [
                    'driver' => 's3',
                    'key'    => $settings['s3_key'],
                    'secret' => $settings['s3_secret'],
                    'region' => $settings['s3_region'] ?? 'us-east-1',
                    'bucket' => $settings['s3_bucket'],
                    'url'    => $settings['s3_url'] ?? null,
                    'endpoint' => $settings['s3_endpoint'] ?? null,
                ],
            ];
        }

        if (!empty($settings['r2_key'])) {
            return [
                'disk' => 'tenant_r2',
                'config' => [
                    'driver' => 's3',
                    'key'    => $settings['r2_key'],
                    'secret' => $settings['r2_secret'],
                    'region' => 'auto',
                    'bucket' => $settings['r2_bucket'],
                    'endpoint' => $settings['r2_endpoint'],
                    'url'    => $settings['r2_url'] ?? null,
                ],
            ];
        }

        // Default: local storage with tenant isolation
        return [
            'disk' => 'tenant_local',
            'config' => [
                'driver' => 'local',
                'root'   => storage_path('app/tenants/' . $organization->slug),
                'url'    => env('APP_URL') . '/storage/tenants/' . $organization->slug,
                'visibility' => 'private',
            ],
        ];
    }

    /**
     * Configure the filesystem for the current tenant.
     */
    protected function configureFilesystem(Organization $organization): void
    {
        $fsConfig = $this->getFilesystemConfig($organization);

        // Register the tenant disk dynamically
        config()->set("filesystems.disks.tenant", $fsConfig['config']);
        config()->set('filesystems.default', 'tenant');
    }

    /**
     * Get the current disk name for the tenant.
     */
    public function getDisk(): string
    {
        if (!$this->organization) {
            return config('filesystems.default', 'local');
        }

        $fsConfig = $this->getFilesystemConfig($this->organization);
        return $fsConfig['disk'];
    }

    /**
     * Clear the tenant filesystem context.
     */
    public function clearTenant(): void
    {
        $this->organization = null;
        config()->set('filesystems.default', env('FILESYSTEM_DISK', 'local'));
    }
}
