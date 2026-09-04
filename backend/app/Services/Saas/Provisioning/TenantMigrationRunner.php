<?php

namespace App\Services\Saas\Provisioning;

use App\Console\Commands\FixTenantColumns;
use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;

/**
 * TenantMigrationRunner.
 *
 * Responsible for executing tenant database migrations:
 * - Run all existing PMS tenant migrations
 * - Never execute master database migrations
 * - Track migration status
 * - Return detailed results
 */
class TenantMigrationRunner
{
    public function __construct(
        protected DatabaseProvisionService $db,
    ) {}

    /**
     * Run all tenant migrations on the specified database.
     *
     * @return array{success: bool, output: string, migrations: int}
     * @throws \RuntimeException If migrations fail.
     */
    public function run(string $databaseName): array
    {
        Log::info("Running tenant migrations on database: {$databaseName}");

        $this->db->runMigrations($databaseName);

        $output = Artisan::output();

        Log::info("Tenant migrations completed on database: {$databaseName}");

        // Safety net: fix any missing columns/tables that migrations may have skipped
        try {
            $result = FixTenantColumns::fixDatabaseQuiet($databaseName);
            if ($result['fixed'] > 0) {
                Log::info("Tenant column fixes applied after migration", [
                    'database' => $databaseName,
                    'fixed'    => $result['fixed'],
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning("Column fix failed after migration (non-fatal)", [
                'database' => $databaseName,
                'error'    => $e->getMessage(),
            ]);
        }

        return [
            'success'    => true,
            'output'     => $output,
            'database'   => $databaseName,
        ];
    }

    /**
     * Get the status of migrations for a database.
     */
    public function getStatus(string $databaseName): array
    {
        // Configure a temporary connection to check migration status
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        $org = \App\Models\Master\Organization::where('database_name', $databaseName)->first();

        config()->set('database.connections.tenant_status', [
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

        try {
            Artisan::call('migrate:status', [
                '--database' => 'tenant_status',
            ]);

            return [
                'success' => true,
                'output'  => Artisan::output(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error'   => $e->getMessage(),
            ];
        }
    }
}
