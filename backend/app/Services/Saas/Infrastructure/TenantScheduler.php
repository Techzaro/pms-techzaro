<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Support\Facades\Log;

/**
 * TenantScheduler.
 *
 * Iterates through all active organizations and runs a callback
 * for each tenant with the correct database context.
 *
 * Usage in routes/console.php:
 *   $scheduler->forEveryTenant(function (Organization $org) {
 *       // This code runs with the tenant's DB connection active
 *   });
 */
class TenantScheduler
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseProvisionService $db,
        protected TenantDatabaseManager $dbManager,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Execute a callback for every active tenant.
     *
     * @param callable $callback Receives the Organization model. DB is already switched.
     * @param string|null $statusFilter Filter by status (null = active only).
     *
     * @return array{executed: int, failed: int, errors: array}
     */
    public function forEveryTenant(callable $callback, ?string $statusFilter = 'active'): array
    {
        $organizations = $this->getOrganizations($statusFilter);
        $executed = 0;
        $failed = 0;
        $errors = [];

        Log::info("Starting tenant iteration", [
            'total' => $organizations->count(),
            'filter' => $statusFilter ?? 'all',
        ]);

        foreach ($organizations as $org) {
            try {
                // Switch to tenant's database
                $this->db->registerConnection($org);
                $connectionName = $this->db->getConnectionName($org->id);

                \Illuminate\Support\Facades\DB::purge($connectionName);
                \Illuminate\Support\Facades\DB::reconnect($connectionName);

                // Set the current organization in the container
                app()->bind('currentOrganization', fn () => $org);

                // Execute the callback
                $callback($org);

                $executed++;

                Log::info("Tenant task completed", [
                    'tenant' => $org->slug,
                    'status' => 'success',
                ]);
            } catch (\Throwable $e) {
                $failed++;
                $errors[$org->slug] = $e->getMessage();

                Log::error("Tenant task failed", [
                    'tenant' => $org->slug,
                    'error'  => $e->getMessage(),
                ]);
            } finally {
                // Cleanup
                if (isset($connectionName)) {
                    \Illuminate\Support\Facades\DB::purge($connectionName);
                }
                app()->offsetUnset('currentOrganization');
            }
        }

        Log::info("Tenant iteration completed", [
            'executed' => $executed,
            'failed'   => $failed,
        ]);

        return [
            'executed' => $executed,
            'failed'   => $failed,
            'errors'   => $errors,
        ];
    }

    /**
     * Execute a callback for a specific tenant.
     */
    public function forTenant(string $slugOrId, callable $callback): void
    {
        $org = is_numeric($slugOrId)
            ? Organization::find((int) $slugOrId)
            : Organization::where('slug', $slugOrId)->first();

        if (!$org) {
            throw new \RuntimeException("Organization not found: {$slugOrId}");
        }

        $this->db->registerConnection($org);
        $connectionName = $this->db->getConnectionName($org->id);

        \Illuminate\Support\Facades\DB::purge($connectionName);
        \Illuminate\Support\Facades\DB::reconnect($connectionName);

        app()->bind('currentOrganization', fn () => $org);

        try {
            $callback($org);
        } finally {
            \Illuminate\Support\Facades\DB::purge($connectionName);
            app()->offsetUnset('currentOrganization');
        }
    }

    /**
     * Get organizations to iterate over.
     */
    protected function getOrganizations(?string $statusFilter): \Illuminate\Database\Eloquent\Collection
    {
        $query = Organization::query();

        if ($statusFilter) {
            $query->where('status', $statusFilter);
        }

        return $query->orderBy('id')->get();
    }
}
