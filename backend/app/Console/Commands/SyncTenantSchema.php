<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\SchemaReferenceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SyncTenantSchema extends Command
{
    protected $signature = 'tenants:sync-schema
        {--database= : Sync a specific tenant database}
        {--all : Sync all tenant databases (registered + unregistered local)}
        {--dry-run : Show what would change without applying}
        {--force : Skip confirmation prompt}';

    protected $description = 'Sync tenant databases with the golden schema (auto-detects and adds missing tables/columns)';

    protected int $tablesCreated = 0;
    protected int $columnsAdded = 0;
    protected int $tablesSkipped = 0;
    protected int $columnsSkipped = 0;
    protected array $errors = [];

    public function handle(SchemaReferenceService $schemaRef): int
    {
        $this->tablesCreated = 0;
        $this->columnsAdded = 0;
        $this->tablesSkipped = 0;
        $this->columnsSkipped = 0;
        $this->errors = [];

        $databases = $this->resolveDatabases();

        if (empty($databases)) {
            $this->error('No tenant databases found to sync.');
            return self::FAILURE;
        }

        $this->info("Found " . count($databases) . " tenant database(s) to sync.");
        $this->newLine();

        // Build golden schema once
        if (!$this->option('quiet')) {
            $this->info('Building golden schema from migrations...');
        }
        $goldenSchema = $schemaRef->getGoldenSchema();

        if (empty($goldenSchema)) {
            $this->error('Failed to build golden schema. Aborting.');
            return self::FAILURE;
        }

        if (!$this->option('quiet')) {
            $this->info("Golden schema: " . count($goldenSchema) . " tables");
            $this->newLine();
        }

        $dryRun = $this->option('dry-run');

        foreach ($databases as $dbName) {
            $this->syncDatabase($dbName, $goldenSchema, $schemaRef, $dryRun);
        }

        // Summary
        $this->newLine();
        $this->info('═══════════════════════════════════════');
        $this->info(' Summary');
        $this->info('═══════════════════════════════════════');

        if ($dryRun) {
            $this->warn("  DRY RUN — No changes applied");
        }

        $this->line("  Tables created: {$this->tablesCreated}");
        $this->line("  Columns added:  {$this->columnsAdded}");
        $this->line("  Tables synced:  {$this->tablesSkipped} (already exist)");
        $this->line("  Errors:         " . count($this->errors));
        $this->info('═══════════════════════════════════════');

        if (!empty($this->errors)) {
            $this->newLine();
            $this->error('Errors encountered:');
            foreach ($this->errors as $err) {
                $this->error("  - {$err}");
            }
        }

        Log::info("tenants:sync-schema completed", [
            'tables_created' => $this->tablesCreated,
            'columns_added'  => $this->columnsAdded,
            'errors'         => count($this->errors),
            'dry_run'        => $dryRun,
        ]);

        return empty($this->errors) ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Sync a single tenant database with the golden schema.
     */
    protected function syncDatabase(string $dbName, array $goldenSchema, SchemaReferenceService $schemaRef, bool $dryRun): void
    {
        if (!$this->option('quiet')) {
            $this->line("<info>Database: {$dbName}</info>");
        }

        // Get tenant DB credentials
        $tenantConfig = $this->getTenantConfig($dbName);
        if (!$tenantConfig) {
            $this->warn("  ⚠ Could not resolve credentials — skipping");
            $this->errors[] = "{$dbName}: Could not resolve credentials";
            return;
        }

        // Connect to tenant DB
        $connectionName = 'sync_' . md5($dbName);
        config()->set("database.connections.{$connectionName}", $tenantConfig);
        DB::purge($connectionName);
        DB::reconnect($connectionName);

        try {
            $pdo = DB::connection($connectionName)->getPdo();

            // Get current tenant schema
            $currentSchema = $this->captureTenantSchema($pdo, $dbName);

            $tableChanges = 0;
            $columnChanges = 0;

            // 1. Check for missing tables
            foreach ($goldenSchema as $tableName => $goldenColumns) {
                if (!isset($currentSchema[$tableName])) {
                    // Table is missing — create it
                    $createSql = $schemaRef->buildCreateTableSql($tableName);
                    if ($createSql) {
                        if ($dryRun) {
                            $this->line("  [DRY RUN] Would CREATE TABLE `{$tableName}`");
                        } else {
                            try {
                                $pdo->exec($createSql);
                                $this->line("  ✅ Created table `{$tableName}`");
                                $this->tablesCreated++;
                            } catch (\Throwable $e) {
                                // Table creation failed — might be a broken table that exists
                                // with a wrong structure. Drop and recreate.
                                try {
                                    $pdo->exec("DROP TABLE IF EXISTS `{$tableName}`");
                                    $pdo->exec($createSql);
                                    $this->line("  🔧 Repaired table `{$tableName}` (dropped + recreated)");
                                    $this->tablesCreated++;
                                } catch (\Throwable $e2) {
                                    $this->error("  ❌ Failed to create/repair `{$tableName}`: " . $e2->getMessage());
                                    $this->errors[] = "{$dbName}.{$tableName}: " . $e2->getMessage();
                                }
                            }
                        }
                        $tableChanges++;
                    }
                } else {
                    // Table exists — check for missing columns
                    $tableRepaired = false;
                    foreach ($goldenColumns as $colName => $goldenColInfo) {
                        if (!isset($currentSchema[$tableName][$colName])) {
                            // Column is missing — add it
                            $addSql = $schemaRef->buildAddColumnSql($tableName, $colName);
                            if ($addSql) {
                                if ($dryRun) {
                                    $this->line("  [DRY RUN] Would ADD COLUMN `{$tableName}`.`{$colName}` ({$goldenColInfo['type']})");
                                } else {
                                    try {
                                        $pdo->exec($addSql);
                                        $this->line("  ✅ Added `{$tableName}`.`{$colName}` ({$goldenColInfo['type']})");
                                        $this->columnsAdded++;
                                    } catch (\Throwable $e) {
                                        // Column add failed — table might be broken
                                        // Try dropping and recreating the whole table
                                        if (!$tableRepaired) {
                                            try {
                                                $createSql = $schemaRef->buildCreateTableSql($tableName);
                                                if ($createSql) {
                                                    $pdo->exec("DROP TABLE IF EXISTS `{$tableName}`");
                                                    $pdo->exec($createSql);
                                                    $tableRepaired = true;
                                                    $this->line("  🔧 Repaired table `{$tableName}` (dropped + recreated)");
                                                    $this->tablesCreated++;
                                                }
                                            } catch (\Throwable $e2) {
                                                $this->error("  ❌ Failed to repair `{$tableName}`: " . $e2->getMessage());
                                                $this->errors[] = "{$dbName}.{$tableName}: " . $e2->getMessage();
                                            }
                                        }
                                        if (!$tableRepaired) {
                                            $this->error("  ❌ Failed to add `{$tableName}`.`{$colName}`: " . $e->getMessage());
                                            $this->errors[] = "{$dbName}.{$tableName}.{$colName}: " . $e->getMessage();
                                        }
                                    }
                                }
                                $columnChanges++;
                            }
                        } else {
                            $this->columnsSkipped++;
                        }
                    }
                    $this->tablesSkipped++;
                }
            }

            if ($tableChanges === 0 && $columnChanges === 0 && !$dryRun) {
                $this->line("  ✅ Everything in sync");
            }
        } catch (\Throwable $e) {
            $this->error("  ❌ Connection failed: " . $e->getMessage());
            $this->errors[] = "{$dbName}: Connection failed - " . $e->getMessage();
        }

        DB::purge($connectionName);

        $this->newLine();
    }

    /**
     * Capture current schema of a tenant database.
     */
    protected function captureTenantSchema(\PDO $pdo, string $dbName): array
    {
        $stmt = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{$dbName}' AND TABLE_TYPE = 'BASE TABLE'");
        $tables = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        $schema = [];

        foreach ($tables as $tableName) {
            $colStmt = $pdo->prepare("
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            ");
            $colStmt->execute([$dbName, $tableName]);
            $columns = $colStmt->fetchAll(\PDO::FETCH_ASSOC);

            $schema[$tableName] = [];
            foreach ($columns as $col) {
                $schema[$tableName][$col['COLUMN_NAME']] = [
                    'type'     => $col['COLUMN_TYPE'],
                    'nullable' => $col['IS_NULLABLE'] === 'YES',
                    'default'  => $col['COLUMN_DEFAULT'],
                    'key'      => $col['COLUMN_KEY'],
                    'extra'    => $col['EXTRA'],
                ];
            }
        }

        return $schema;
    }

    /**
     * Resolve list of tenant databases to sync.
     */
    protected function resolveDatabases(): array
    {
        $specific = $this->option('database');
        if ($specific) {
            return [$specific];
        }

        if (!$this->option('all')) {
            // Default: registered orgs only
            return Organization::where('status', '!=', 'deleted')
                ->pluck('database_name')
                ->filter()
                ->toArray();
        }

        // --all: registered orgs + scan for unregistered local databases
        $databases = [];

        // 1. Registered orgs
        $registered = Organization::where('status', '!=', 'deleted')
            ->pluck('database_name')
            ->filter()
            ->toArray();
        $databases = array_merge($databases, $registered);

        // 2. Scan for unregistered local tenant databases (both pms_tenant_* and techxaro_*)
        $prefix = config('tenancy.database_prefix', 'pms_tenant_');
        $masterConfig = config('database.connections.' . config('tenancy.master_connection', 'mysql_master'));

        try {
            $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $masterConfig['host'], $masterConfig['port']);
            $pdo = new \PDO($dsn, $masterConfig['username'], $masterConfig['password'] ?? '', [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_TIMEOUT => 5,
            ]);

            // Scan pms_tenant_* databases
            $stmt = $pdo->query("SHOW DATABASES LIKE '{$prefix}%'");
            $allLocalDbs = $stmt->fetchAll(\PDO::FETCH_COLUMN);

            // Also scan techxaro_* databases
            $stmt2 = $pdo->query("SHOW DATABASES LIKE 'techxaro_%'");
            $techxaroDbs = $stmt2->fetchAll(\PDO::FETCH_COLUMN);

            $allLocalDbs = array_merge($allLocalDbs, $techxaroDbs);

            foreach ($allLocalDbs as $db) {
                if (!in_array($db, $databases)) {
                    $databases[] = $db;
                }
            }
        } catch (\Throwable $e) {
            Log::warning("SyncTenantSchema: Could not scan local databases: " . $e->getMessage());
        }

        // 3. Also include registered orgs with remote (cPanel) databases
        $remoteOrgs = Organization::where('status', '!=', 'deleted')
            ->whereNotNull('database_host')
            ->where('database_host', '!=', $masterConfig['host'] ?? '')
            ->get();

        foreach ($remoteOrgs as $org) {
            if ($org->database_name && !in_array($org->database_name, $databases)) {
                $databases[] = $org->database_name;
            }
        }

        return array_unique($databases);
    }

    /**
     * Get database config for a tenant (local or remote).
     */
    protected function getTenantConfig(string $dbName): ?array
    {
        // Check if registered org with custom credentials
        $org = Organization::where('database_name', $dbName)->first();
        $masterConfig = config('database.connections.' . config('tenancy.master_connection', 'mysql_master'));

        if ($org) {
            return [
                'driver'   => 'mysql',
                'host'     => $org->database_host ?? $masterConfig['host'],
                'port'     => (int) ($org->database_port ?? $masterConfig['port']),
                'database' => $dbName,
                'username' => $org->database_username ?? $masterConfig['username'],
                'password' => $org->database_password ?? $masterConfig['password'] ?? '',
                'charset'  => 'utf8mb4',
                'prefix'   => '',
                'strict'   => true,
            ];
        }

        // Unregistered local database — use master credentials
        // Match both pms_tenant_* and techxaro_* prefixes
        $prefix = config('tenancy.database_prefix', 'pms_tenant_');
        $isLocalTenant = str_starts_with($dbName, $prefix) || str_starts_with($dbName, 'techxaro_');
        if ($isLocalTenant) {
            return [
                'driver'   => 'mysql',
                'host'     => $masterConfig['host'],
                'port'     => (int) $masterConfig['port'],
                'database' => $dbName,
                'username' => $masterConfig['username'],
                'password' => $masterConfig['password'] ?? '',
                'charset'  => 'utf8mb4',
                'prefix'   => '',
                'strict'   => true,
            ];
        }

        return null;
    }
}
