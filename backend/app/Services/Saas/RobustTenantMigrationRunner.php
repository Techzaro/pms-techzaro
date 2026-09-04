<?php

namespace App\Services\Saas;

use App\Console\Commands\FixTenantColumns;
use App\Models\Master\Organization;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * RobustTenantMigrationRunner.
 *
 * Runs each migration INDIVIDUALLY so that if ONE fails, the rest still continue.
 * This prevents a single broken migration from blocking all subsequent migrations.
 *
 * Flow per database:
 * 1. Connect to tenant database
 * 2. Get list of pending migrations
 * 3. Run each migration one-by-one (try/catch per migration)
 * 4. Run FixTenantColumns as safety net
 * 5. Return detailed report
 */
class RobustTenantMigrationRunner
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Run all pending migrations individually on a tenant database.
     *
     * @return array{success: bool, migrated: array, failed: array, fixed: int}
     */
    public function run(string $databaseName): array
    {
        $migrated = [];
        $failed = [];
        $fixed = 0;

        try {
            $this->configureConnection($databaseName);

            $migrationPath = file_exists(database_path('migrations/tenant'))
                ? database_path('migrations/tenant')
                : database_path('migrations');

            $pending = $this->getPendingMigrations($databaseName, $migrationPath);

            if (empty($pending)) {
                Log::info("No pending migrations for {$databaseName}");
            }

            foreach ($pending as $file) {
                $migrationName = pathinfo($file, PATHINFO_FILENAME);
                try {
                    $this->runSingleMigration($databaseName, $file);
                    $migrated[] = $migrationName;
                    Log::info("Migration OK: {$migrationName} on {$databaseName}");
                } catch (\Throwable $e) {
                    $failed[] = [
                        'name'   => $migrationName,
                        'error'  => $e->getMessage(),
                    ];
                    Log::warning("Migration FAILED: {$migrationName} on {$databaseName}", [
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            $fixResult = FixTenantColumns::fixDatabaseQuiet($databaseName);
            $fixed = $fixResult['fixed'];

            DB::purge('tenant_runner');

        } catch (\Throwable $e) {
            Log::error("Robust migration runner failed for {$databaseName}: " . $e->getMessage());
            DB::purge('tenant_runner');
        }

        return [
            'success'  => true,
            'migrated' => $migrated,
            'failed'   => $failed,
            'fixed'    => $fixed,
        ];
    }

    /**
     * Get all pending migrations (files not yet in migrations table).
     */
    protected function getPendingMigrations(string $databaseName, string $migrationPath): array
    {
        $files = $this->getAllMigrationFiles($migrationPath);

        $ran = DB::connection('tenant_runner')
            ->table('migrations')
            ->pluck('migration')
            ->toArray();

        $pending = [];
        foreach ($files as $file) {
            $name = pathinfo($file, PATHINFO_FILENAME);
            if (!in_array($name, $ran)) {
                $pending[] = $file;
            }
        }

        return $pending;
    }

    /**
     * Get all migration files sorted by name.
     */
    protected function getAllMigrationFiles(string $path): array
    {
        $files = [];
        foreach (glob($path . '/*.php') as $file) {
            $files[] = $file;
        }
        sort($files);
        return $files;
    }

    /**
     * Run a single migration file directly via PHP include.
     */
    protected function runSingleMigration(string $databaseName, string $filePath): void
    {
        $migration = require $filePath;

        if (!method_exists($migration, 'up')) {
            return;
        }

        $connection = DB::connection('tenant_runner');

        $migration->setConnection('tenant_runner');

        if (method_exists($migration, 'up')) {
            $connection->beginTransaction();
            try {
                $migration->up();
                $connection->commit();

                $connection->table('migrations')->insert([
                    'migration' => pathinfo($filePath, PATHINFO_FILENAME),
                    'batch'     => $this->getNextBatchNumber($databaseName),
                ]);
            } catch (\Throwable $e) {
                $connection->rollBack();
                throw $e;
            }
        }
    }

    /**
     * Get the next batch number for migrations table.
     */
    protected function getNextBatchNumber(string $databaseName): int
    {
        $max = DB::connection('tenant_runner')
            ->table('migrations')
            ->max('batch');

        return ($max ?? 0) + 1;
    }

    /**
     * Configure the tenant_runner connection.
     */
    protected function configureConnection(string $databaseName): void
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
}
