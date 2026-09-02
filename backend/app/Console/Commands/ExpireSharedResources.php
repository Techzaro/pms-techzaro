<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Models\SharedResource;
use App\Services\Sharing\SharingNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Artisan command to expire shared resources that have passed their expiration date.
 * 
 * Run via scheduler: every hour or daily
 * php artisan sharing:expire-resources
 */
class ExpireSharedResources extends Command
{
    protected $signature = 'sharing:expire-resources';
    protected $description = 'Mark expired shared resources as expired and notify affected organizations';

    public function handle(SharingNotificationService $notificationService): int
    {
        $expiredCount = 0;
        $notifiedCount = 0;

        // Get all organizations with tenant databases
        $organizations = Organization::whereNotNull('database_name')
            ->where('status', 'active')
            ->get();

        foreach ($organizations as $org) {
            try {
                $dbName = $org->database_name;
                $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

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

                // Find active resources that have expired
                $expiredResources = $conn->table('shared_resources')
                    ->where('status', 'active')
                    ->whereNotNull('expires_at')
                    ->where('expires_at', '<=', now())
                    ->get();

                foreach ($expiredResources as $resource) {
                    // Mark as expired
                    $conn->table('shared_resources')
                        ->where('id', $resource->id)
                        ->update([
                            'status' => 'expired',
                            'updated_at' => now(),
                        ]);

                    $expiredCount++;

                    // Notify the receiving organization
                    try {
                        $notificationService->accessExpired(
                            orgId: $resource->shared_with_organization_id,
                            resourceType: $resource->resource_type,
                            resourceId: $resource->resource_id
                        );
                        $notifiedCount++;
                    } catch (\Exception $e) {
                        Log::error("Failed to notify about expired resource: " . $e->getMessage());
                    }

                    // Log activity
                    try {
                        $conn->table('shared_resource_activity_logs')->insert([
                            'shared_resource_id' => $resource->id,
                            'action' => 'access_expired',
                            'resource_type' => $resource->resource_type,
                            'resource_id' => $resource->resource_id,
                            'details' => json_encode(['expired_at' => $resource->expires_at]),
                            'acted_at' => now(),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    } catch (\Exception $e) {
                        Log::error("Failed to log expiration activity: " . $e->getMessage());
                    }
                }

                DB::purge($connName);
            } catch (\Exception $e) {
                Log::error("Error processing org {$org->id} for expiration: " . $e->getMessage());
                DB::purge('expire_check_' . $org->id);
            }
        }

        $this->info("Expired {$expiredCount} shared resources across " . $organizations->count() . " organizations.");
        $this->info("Sent {$notifiedCount} expiration notifications.");

        return Command::SUCCESS;
    }
}
