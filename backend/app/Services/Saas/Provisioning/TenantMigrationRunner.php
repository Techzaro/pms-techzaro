<?php

namespace App\Services\Saas\Provisioning;

use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Support\Facades\Log;

/**
 * TenantMigrationRunner.
 *
 * Executes tenant database migrations via DatabaseProvisionService.
 * DatabaseProvisionService handles:
 * - Running artisan migrate with proper connection
 * - Running FixTenantColumns as safety net
 * - Error handling per-migration
 */
class TenantMigrationRunner
{
    public function __construct(
        protected DatabaseProvisionService $db,
    ) {}

    /**
     * Run all tenant migrations on the specified database.
     *
     * @return array{success: bool}
     */
    public function run(string $databaseName): array
    {
        Log::info("Running tenant migrations on database: {$databaseName}");

        $this->db->runMigrations($databaseName);

        Log::info("Tenant migrations completed on database: {$databaseName}");

        return [
            'success' => true,
        ];
    }
}
