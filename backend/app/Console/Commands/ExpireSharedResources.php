<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Models\SharedResource;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Artisan command to handle shared resources that have passed their view-only date.
 *
 * When expires_at is reached, the share remains 'active' but is effectively
 * downgraded to 'view' permission (regardless of the original permission).
 *
 * Run via scheduler: every hour
 * php artisan sharing:expire-resources
 */
class ExpireSharedResources extends Command
{
    protected $signature = 'sharing:expire-resources';
    protected $description = 'Notify affected organizations when shared resources transition to view-only mode';

    public function handle(): int
    {
        $viewOnlyCount = 0;
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        $organizations = Organization::whereNotNull('database_name')
            ->where('status', 'active')
            ->get();

        foreach ($organizations as $org) {
            try {
                $dbName = $org->database_name;
                $connName = 'expire_check_' . $org->id;
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $org->database_host ?? $masterConfig['host'] ?? '127.0.0.1',
                    'port'      => $org->database_port ?? $masterConfig['port'] ?? 3306,
                    'database'  => $dbName,
                    'username'  => $org->database_username ?? $masterConfig['username'] ?? 'root',
                    'password'  => $org->database_password ?? $masterConfig['password'] ?? '',
                    'charset'   => 'utf8mb4',
                    'collation' => 'utf8mb4_unicode_ci',
                    'prefix'    => '',
                ]);

                DB::purge($connName);
                $conn = DB::connection($connName);

                // Find active resources where expires_at has passed and they haven't been logged yet
                $viewOnlyResources = $conn->table('shared_resources')
                    ->where('status', 'active')
                    ->whereNotNull('expires_at')
                    ->where('expires_at', '<=', now())
                    ->where('permission', '!=', 'view')
                    ->get();

                foreach ($viewOnlyResources as $resource) {
                    // Log the transition to view-only mode
                    try {
                        $conn->table('shared_resource_activity_logs')->insert([
                            'shared_resource_id' => $resource->id,
                            'connection_id' => $resource->connection_id,
                            'organization_id' => $org->id,
                            'action' => 'transitioned_to_view_only',
                            'resource_type' => $resource->resource_type,
                            'resource_id' => $resource->resource_id,
                            'details' => json_encode([
                                'expires_at' => $resource->expires_at,
                                'previous_permission' => $resource->permission,
                                'effective_permission' => 'view',
                            ]),
                            'acted_at' => now(),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    } catch (\Exception $e) {
                        Log::error("Failed to log view-only transition: " . $e->getMessage());
                    }

                    $viewOnlyCount++;
                }

                DB::purge($connName);
            } catch (\Exception $e) {
                Log::error("Error processing org {$org->id} for view-only check: " . $e->getMessage());
                DB::purge('expire_check_' . $org->id);
            }
        }

        $this->info("{$viewOnlyCount} shared resources are now in view-only mode across " . $organizations->count() . " organizations.");

        return Command::SUCCESS;
    }
}
