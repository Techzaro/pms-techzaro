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
     * After migrations, runs schema sync as safety net (auto-detects missing tables/columns).
     */
    public function runMigrations(string $databaseName): bool
    {
        $this->configureTenantConnection($databaseName);

        // Run each migration INDIVIDUALLY so one failure doesn't block the rest.
        // Laravel's `migrate` stops on first failure — we need resilience.
        $migrationPath = database_path('migrations');
        $files = glob($migrationPath . '/*.php');
        sort($files);

        $ran = 0;
        $failed = 0;

        foreach ($files as $file) {
            $shortPath = basename($file);
            try {
                Artisan::call('migrate', [
                    '--database' => 'tenant_runner',
                    '--path'     => 'database/migrations/' . $shortPath,
                    '--force'    => true,
                ]);
                $output = Artisan::output();
                if (str_contains($output, 'Nothing to migrate')) {
                    continue;
                }
                $ran++;
            } catch (\Throwable $e) {
                $failed++;
                Log::warning("Migration failed individually on {$databaseName}: {$shortPath}", [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        Log::info("Individual migrations completed on {$databaseName}: {$ran} ran, {$failed} failed");

        // Run legacy FixTenantColumns (safety net for columns added via AFTER clauses)
        try {
            FixTenantColumns::fixDatabaseProgrammatic($databaseName);
        } catch (\Throwable $e) {
            Log::warning("Column fix step failed (non-fatal)", [
                'database' => $databaseName,
                'error'    => $e->getMessage(),
            ]);
        }

        // Then run full schema sync (catches anything FixTenantColumns missed)
        try {
            $this->syncSchema($databaseName);
        } catch (\Throwable $e) {
            Log::warning("Schema sync failed (non-fatal)", [
                'error' => $e->getMessage(),
            ]);
        }

        DB::purge('tenant_runner');

        if (ob_get_level() > 0) {
            ob_clean();
        }

        return true;
    }

    /**
     * Sync a tenant database schema against the golden reference.
     * Adds any missing tables/columns automatically.
     */
    public function syncSchema(string $databaseName): void
    {
        /** @var SchemaReferenceService $schemaRef */
        $schemaRef = app(SchemaReferenceService::class);
        $goldenSchema = $schemaRef->getGoldenSchema();

        if (empty($goldenSchema)) {
            Log::warning("Schema sync: golden schema is empty, skipping");
            return;
        }

        $connectionName = 'tenant_runner';
        $pdo = DB::connection($connectionName)->getPdo();

        // Get current schema
        $stmt = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{$databaseName}' AND TABLE_TYPE = 'BASE TABLE'");
        $tables = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        $tablesCreated = 0;
        $columnsAdded = 0;

        foreach ($goldenSchema as $tableName => $goldenColumns) {
            if (!in_array($tableName, $tables)) {
                // Table missing — create it
                $createSql = $schemaRef->buildCreateTableSql($tableName);
                if ($createSql) {
                    try {
                        $pdo->exec($createSql);
                        $tablesCreated++;
                        Log::info("Schema sync: Created table `{$databaseName}`.`{$tableName}`");
                    } catch (\Throwable $e) {
                        // Table creation failed — might be a broken table that exists
                        // Try dropping and recreating
                        try {
                            $pdo->exec("DROP TABLE IF EXISTS `{$tableName}`");
                            $pdo->exec($createSql);
                            $tablesCreated++;
                            Log::info("Schema sync: Repaired table `{$databaseName}`.`{$tableName}` (dropped + recreated)");
                        } catch (\Throwable $e2) {
                            Log::warning("Schema sync: Failed to create/repair `{$tableName}`: " . $e2->getMessage());
                        }
                    }
                }
            } else {
                // Table exists — check columns
                $colStmt = $pdo->prepare("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?");
                $colStmt->execute([$databaseName, $tableName]);
                $existingCols = $colStmt->fetchAll(\PDO::FETCH_COLUMN);

                foreach ($goldenColumns as $colName => $goldenColInfo) {
                    if (!in_array($colName, $existingCols)) {
                        $addSql = $schemaRef->buildAddColumnSql($tableName, $colName);
                        if ($addSql) {
                            try {
                                $pdo->exec($addSql);
                                $columnsAdded++;
                                Log::info("Schema sync: Added `{$databaseName}`.`{$tableName}`.`{$colName}`");
                            } catch (\Throwable $e) {
                                Log::warning("Schema sync: Failed to add `{$tableName}`.`{$colName}`: " . $e->getMessage());
                            }
                        }
                    }
                }
            }
        }

        if ($tablesCreated > 0 || $columnsAdded > 0) {
            Log::info("Schema sync completed on {$databaseName}: {$tablesCreated} tables created, {$columnsAdded} columns added");
        }
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
