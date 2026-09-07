<?php

namespace App\Services\Saas;

use App\Console\Commands\FixTenantColumns;
use App\Models\Master\Organization;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
     *
     * Uses artisan migrate --database which properly handles:
     * - Schema operations on the correct connection
     * - Migration batch tracking
     * - Transaction per migration
     *
     * After migrations, runs FixTenantColumns as safety net.
     */
    public function runMigrations(string $databaseName): bool
    {
        $this->configureTenantConnection($databaseName);

        try {
            Artisan::call('migrate', [
                '--database' => 'tenant_runner',
                '--path'     => 'database/migrations',
                '--force'    => true,
            ]);

            Log::info("Migrations completed on tenant DB {$databaseName}", [
                'output' => Artisan::output(),
            ]);
        } catch (\Throwable $e) {
            Log::warning("Some migrations failed on tenant DB {$databaseName} (continuing with column fixes)", [
                'error'  => $e->getMessage(),
                'output' => Artisan::output(),
            ]);
        }

        try {
            FixTenantColumns::fixDatabaseProgrammatic($databaseName);
        } catch (\Throwable $e) {
            Log::warning("Column fix step failed (non-fatal)", [
                'database' => $databaseName,
                'error'    => $e->getMessage(),
            ]);
        }

        DB::purge('tenant_runner');

        // Clear any accidental output buffer contamination from Artisan/migration output
        if (ob_get_level() > 0) {
            ob_clean();
        }

        return true;
    }

    /**
     * Configure the tenant_runner connection using org credentials or master fallback.
     */
    protected function configureTenantConnection(string $databaseName): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");
        $org = Organization::where('database_name', $databaseName)->first();

        Config::set('database.connections.tenant_runner', [
            'driver'    => 'mysql',
            'host'      => $org->database_host ?? $masterConfig['host'],
            'port'      => $org->database_port ?? $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $org->database_username ?? $masterConfig['username'],
            'password'  => $org->database_password ?? $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        DB::purge('tenant_runner');
        DB::reconnect('tenant_runner');
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
