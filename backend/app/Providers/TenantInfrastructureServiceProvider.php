<?php

namespace App\Providers;

use App\Services\Saas\Infrastructure\TenantCacheManager;
use App\Services\Saas\Infrastructure\TenantSessionManager;
use App\Services\Saas\Infrastructure\TenantStorageManager;
use App\Services\Saas\Infrastructure\TenantMailManager;
use App\Services\Saas\Infrastructure\TenantFilesystemManager;
use App\Services\Saas\Infrastructure\TenantContextLogger;
use App\Services\Saas\Infrastructure\TenantScheduler;
use App\Services\Saas\Infrastructure\HealthCheckService;
use Illuminate\Support\ServiceProvider;

/**
 * TenantInfrastructureServiceProvider.
 *
 * Registers infrastructure services for tenant isolation:
 * - Cache isolation
 * - Session isolation
 * - Storage isolation
 * - Mail isolation
 * - Filesystem isolation
 * - Context logging
 * - Scheduler
 * - Health checks
 */
class TenantInfrastructureServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(TenantCacheManager::class);
        $this->app->singleton(TenantSessionManager::class);
        $this->app->singleton(TenantStorageManager::class);
        $this->app->singleton(TenantMailManager::class);
        $this->app->singleton(TenantFilesystemManager::class);
        $this->app->singleton(TenantContextLogger::class);
        $this->app->singleton(TenantScheduler::class);
        $this->app->singleton(HealthCheckService::class);
    }
}
