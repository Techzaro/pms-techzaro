<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DatabaseProvisionService.
 *
 * Responsible ONLY for database-level operations:
 * - Creating tenant databases
 * - Running automated migrations on tenant databases
 * - Programmatically executing column and schema fixes
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
     * Configure dynamic tenant connection for a database.
     */
    public function configureTenantConnection(string $databaseName): void
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        config()->set('database.connections.tenant', [
            'driver'         => 'mysql',
            'host'           => $masterConfig['host'],
            'port'           => $masterConfig['port'],
            'database'       => $databaseName,
            'username'       => $masterConfig['username'],
            'password'       => $masterConfig['password'] ?? '',
            'charset'        => 'utf8mb4',
            'collation'      => 'utf8mb4_unicode_ci',
            'prefix'         => '',
            'prefix_indexes' => true,
            'strict'         => true,
            'engine'         => null,
        ]);

        DB::purge('tenant');
    }

    /**
     * Run all tenant migrations on a specific database.
     *
     * Creates a dedicated tenant_runner connection, runs all migration files,
     * then applies FixTenantColumns for any legacy/missed columns.
     */
    public function runMigrations(string $databaseName, ?int $orgId = null): array
    {
        $this->configureTenantConnection($databaseName);

        $migrationSuccess = true;
        $migrationOutput = '';
        $errorMessage = null;

        try {
            $runner = new RobustTenantMigrationRunner();
            $result = $runner->run($databaseName);

            if (!empty($result['failed'])) {
                Log::warning("Some migrations failed on {$databaseName} but rest completed", [
                    'failed' => $result['failed'],
                ]);
            }

            Log::info("Migrations completed on tenant DB {$databaseName}", [
                'migrated' => count($result['migrated']),
                'failed'   => count($result['failed']),
                'fixed'    => $result['fixed'],
            ]);
        } catch (\Throwable $e) {
            $migrationSuccess = false;
            $errorMessage = $e->getMessage();
            Log::error("Tenant migration encountered error (gracefully captured)", [
                'organization_id' => $orgId ?? 'N/A',
                'database'        => $databaseName,
                'error'           => $e->getMessage(),
                'trace'           => $e->getTraceAsString(),
            ]);
        }

        // Programmatically execute column and table fixes (tenants:fix-columns equivalent)
        $fixesCount = 0;
        try {
            $fixResult = FixTenantColumns::fixDatabaseQuiet($databaseName);
            $fixesCount = $fixResult['fixed'] ?? 0;
            if ($fixesCount > 0) {
                Log::info("Automated column/table fixes applied to tenant database", [
                    'organization_id' => $orgId ?? 'N/A',
                    'database'        => $databaseName,
                    'fixed'           => $fixesCount,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning("Tenant column fix step failed (non-fatal)", [
                'organization_id' => $orgId ?? 'N/A',
                'database'        => $databaseName,
                'error'           => $e->getMessage(),
            ]);
        } finally {
            DB::purge('tenant');
        }

        return [
            'success' => $migrationSuccess,
            'output'  => $migrationOutput,
            'fixes'   => $fixesCount,
            'error'   => $errorMessage,
        ];
    }

    /**
     * Create database and run migrations with automatic column fixes.
     */
    public function createAndProvisionDatabase(string $databaseName, ?int $orgId = null): array
    {
        $this->createDatabase($databaseName);
        return $this->runMigrations($databaseName, $orgId);
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
