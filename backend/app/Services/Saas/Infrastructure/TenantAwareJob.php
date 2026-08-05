<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * TenantAwareJob.
 *
 * Base trait for jobs that need to preserve tenant context.
 * When the job is dispatched, it captures the current tenant.
 * When the job executes, it restores the tenant context.
 *
 * Usage: Use the TenantAwareJob trait in any job class.
 */
trait TenantAwareJob
{
    use Queueable, Dispatchable, InteractsWithQueue, SerializesModels;

    /**
     * The tenant organization ID at dispatch time.
     */
    public ?int $tenantId = null;

    /**
     * The tenant slug at dispatch time.
     */
    public ?string $tenantSlug = null;

    /**
     * The tenant database connection name at dispatch time.
     */
    public ?string $tenantConnectionName = null;

    /**
     * Capture the current tenant context.
     */
    public function setTenantContext(): void
    {
        $org = app()->bound('currentOrganization')
            ? app('currentOrganization')
            : null;

        if ($org) {
            $this->tenantId = $org->id;
            $this->tenantSlug = $org->slug;
            $this->tenantConnectionName = app(\App\Services\Saas\TenantDatabaseManager::class)
                ->getCurrentConnectionName();
        }
    }

    /**
     * Restore the tenant context before job execution.
     */
    public function restoreTenantContext(): void
    {
        if (!$this->tenantId) return;

        $org = Organization::find($this->tenantId);
        if (!$org) {
            Log::warning("Tenant not found for queued job", [
                'tenant_id' => $this->tenantId,
                'job'       => static::class,
            ]);
            return;
        }

        // Restore the organization in the container
        app()->bind('currentOrganization', fn () => $org);

        // Restore the database connection
        $dbManager = app(\App\Services\Saas\TenantDatabaseManager::class);
        try {
            $dbManager->switchTo($org);
        } catch (\Throwable $e) {
            Log::error("Failed to restore tenant DB connection in queued job", [
                'tenant_id' => $this->tenantId,
                'error'     => $e->getMessage(),
                'job'       => static::class,
            ]);
        }
    }

    /**
     * Handle a job with tenant context.
     * Override this method instead of handle().
     */
    abstract public function handleTenant(): mixed;

    /**
     * The job's handle method — restores context then delegates.
     */
    public function handle(): mixed
    {
        $this->restoreTenantContext();

        try {
            return $this->handleTenant();
        } finally {
            // Cleanup after job
            $dbManager = app(\App\Services\Saas\TenantDatabaseManager::class);
            $dbManager->reset();
            app()->offsetUnset('currentOrganization');
        }
    }
}
