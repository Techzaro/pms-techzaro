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
 * Uses cPanel API when configured (shared hosting), falls back to raw SQL.
 */
class DatabaseProvisionService
{
    protected string $masterConnection;
    protected ?CPanelDatabaseService $cpanel;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
        $this->cpanel = app(CPanelDatabaseService::class);
    }

    /**
     * Create a new MySQL database.
     */
    public function createDatabase(string $databaseName): void
    {
        if ($this->cpanel->isConfigured()) {
            $this->cpanel->createDatabase($databaseName);
            $this->cpanel->grantAllPrivileges($databaseName, config('database.connections.mysql_master.username', ''));
            return;
        }

        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }

    /**
     * Drop a MySQL database (destructive).
     */
    public function dropDatabase(string $databaseName): void
    {
        if ($this->cpanel->isConfigured()) {
            $this->cpanel->dropDatabase($databaseName);
            return;
        }

        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("DROP DATABASE IF EXISTS `{$escaped}`");
    }

    /**
     * Run all tenant migrations on a specific database.
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
