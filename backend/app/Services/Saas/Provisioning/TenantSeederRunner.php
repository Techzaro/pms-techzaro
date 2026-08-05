<?php

namespace App\Services\Saas\Provisioning;

use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Support\Facades\Log;

/**
 * TenantSeederRunner.
 *
 * Responsible for running tenant seeders:
 * - Execute tenant-specific seeders (admin user, defaults)
 * - Never execute master database seeders
 * - Track seeder status
 * - Return detailed results
 */
class TenantSeederRunner
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseProvisionService $db,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Run the tenant seeder on the specified database.
     *
     * @param string $databaseName The tenant database name.
     * @param string $adminName Admin user name.
     * @param string $adminEmail Admin user email.
     * @param string $adminPassword Admin user password.
     *
     * @return array{success: bool, database: string}
     * @throws \RuntimeException If seeding fails.
     */
    public function run(
        string $databaseName,
        string $adminName,
        string $adminEmail,
        string $adminPassword,
    ): array {
        Log::info("Running tenant seeders on database: {$databaseName}");

        // Configure the tenant connection for seeder
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant_seed', [
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

        // Create the seeder instance with parameters and run it
        $seeder = new \Database\Seeders\Tenant\TenantSeeder(
            $adminName,
            $adminEmail,
            $adminPassword,
        );

        // Temporarily switch to tenant connection, run seeder, restore
        $originalDefault = config('database.default');
        config()->set('database.default', 'tenant_seed');

        $seeder->setContainer(app());
        $seeder->run();

        config()->set('database.default', $originalDefault);

        Log::info("Tenant seeders completed on database: {$databaseName}");

        return [
            'success'  => true,
            'database' => $databaseName,
        ];
    }
}
