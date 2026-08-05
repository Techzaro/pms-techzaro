<?php

namespace App\Providers;

use App\Services\Saas\TenantResolver;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\OrganizationService;
use App\Services\Saas\SubscriptionService;
use App\Services\Saas\ModuleService;
use App\Services\Saas\TenantDatabaseManager;
use App\Services\Saas\Provisioning\DatabaseCreator;
use App\Services\Saas\Provisioning\TenantMigrationRunner;
use App\Services\Saas\Provisioning\TenantSeederRunner;
use App\Services\Saas\Provisioning\AdministratorCreator;
use App\Services\Saas\Provisioning\DomainRegistrar;
use App\Services\Saas\Provisioning\PlanAssigner;
use App\Services\Saas\Provisioning\ProvisioningOrchestrator;
use App\Services\Saas\Lifecycle\OrganizationStateMachine;
use App\Services\Saas\Lifecycle\LifecycleLogger;
use App\Services\Saas\Lifecycle\TenantLifecycleService;
use App\Services\Saas\Lifecycle\DatabaseBackupService;
use App\Services\Saas\Lifecycle\DatabaseRestoreService;
use App\Services\Saas\Lifecycle\IsolationValidator;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\ServiceProvider;

/**
 * TenantServiceProvider.
 *
 * Registers SaaS service singletons and the master database connection.
 *
 * Responsibilities:
 * - Register service singletons (no business logic)
 * - Ensure the mysql_master connection is available
 *
 * Does NOT:
 * - Resolve tenants (that's TenantResolver's job, called by middleware)
 * - Provision databases (that's DatabaseProvisionService's job)
 * - Handle subscriptions (that's SubscriptionService's job)
 */
class TenantServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Core SaaS services
        $this->app->singleton(TenantResolver::class);
        $this->app->singleton(DatabaseProvisionService::class);
        $this->app->singleton(ModuleService::class);
        $this->app->singleton(SubscriptionService::class);
        $this->app->singleton(OrganizationService::class);

        // Provisioning services
        $this->app->singleton(DatabaseCreator::class);
        $this->app->singleton(TenantMigrationRunner::class);
        $this->app->singleton(TenantSeederRunner::class);
        $this->app->singleton(AdministratorCreator::class);
        $this->app->singleton(DomainRegistrar::class);
        $this->app->singleton(PlanAssigner::class);
        $this->app->singleton(ProvisioningOrchestrator::class);

        // Lifecycle services
        $this->app->singleton(OrganizationStateMachine::class);
        $this->app->singleton(LifecycleLogger::class);
        $this->app->singleton(TenantLifecycleService::class);
        $this->app->singleton(DatabaseBackupService::class);
        $this->app->singleton(DatabaseRestoreService::class);
        $this->app->singleton(IsolationValidator::class);
    }

    public function boot(): void
    {
        $this->registerMasterConnection();
    }

    /**
     * Register the master database connection if not already defined.
     */
    protected function registerMasterConnection(): void
    {
        $masterConnection = config('tenancy.master_connection', 'mysql_master');

        if (Config::has("database.connections.{$masterConnection}")) {
            return;
        }

        Config::set("database.connections.{$masterConnection}", [
            'driver'    => 'mysql',
            'host'      => env('MASTER_DB_HOST', env('DB_HOST', '127.0.0.1')),
            'port'      => env('MASTER_DB_PORT', env('DB_PORT', '3306')),
            'database'  => env('MASTER_DB_DATABASE', 'saas_master'),
            'username'  => env('MASTER_DB_USERNAME', env('DB_USERNAME', 'root')),
            'password'  => env('MASTER_DB_PASSWORD', env('DB_PASSWORD', '')),
            'unix_socket' => env('MASTER_DB_SOCKET', env('DB_SOCKET', '')),
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);
    }
}
