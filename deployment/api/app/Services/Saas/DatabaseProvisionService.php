<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;

/**
 * DatabaseProvisionService.
 *
 * Responsible ONLY for database-level operations:
 * - Creating tenant databases
 * - Running migrations on tenant databases
 * - Registering dynamic database connections
 * - Dropping databases
 *
 * Does not handle organization CRUD or subscription logic.
 */
class DatabaseProvisionService
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Create a new MySQL database.
     */
    public function createDatabase(string $databaseName): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }

    /**
     * Drop a MySQL database (destructive).
     */
    public function dropDatabase(string $databaseName): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("DROP DATABASE IF EXISTS `{$escaped}`");
    }

    /**
     * Run all tenant migrations on a specific database.
     *
     * Temporarily configures a "tenant" connection pointing to the
     * target database, runs migrations, then leaves the config in place
     * for potential immediate use.
     */
    public function runMigrations(string $databaseName): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant', [
            'driver'    => 'mysql',
            'host'      => $masterConfig['host'],
            'port'      => $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $masterConfig['username'],
            'password'  => $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        Artisan::call('migrate', [
            '--database' => 'tenant',
            '--force'    => true,
        ]);
    }

    /**
     * Register a tenant's database connection dynamically at runtime.
     *
     * After this call, DB::connection('tenant_{id}') is available.
     */
    public function registerConnection(Organization $organization): void
    {
        $name = $this->getConnectionName($organization->id);

        config()->set("database.connections.{$name}", [
            'driver'    => 'mysql',
            'host'      => $organization->database_host,
            'port'      => $organization->database_port,
            'database'  => $organization->database_name,
            'username'  => $organization->database_username,
            'password'  => $organization->database_password ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);
    }

    /**
     * Get the connection name for a tenant.
     */
    public function getConnectionName(int $organizationId): string
    {
        return 'tenant_' . $organizationId;
    }
}
