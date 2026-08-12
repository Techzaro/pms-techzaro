<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;

/**
 * TenantDatabaseManager.
 *
 * Handles the actual runtime database switching for the current request.
 * Uses DatabaseProvisionService for connection registration, then manages
 * purge/reconnect/verify lifecycle.
 *
 * Responsibilities:
 * - Purge stale connections
 * - Register and activate the tenant's database connection
 * - Reconnect to the tenant database
 * - Verify the connection is alive
 * - Track which tenant is currently active
 */
class TenantDatabaseManager
{
    protected DatabaseProvisionService $provisionService;
    protected ?Organization $currentOrganization = null;
    protected ?string $currentConnectionName = null;

    public function __construct(DatabaseProvisionService $provisionService)
    {
        $this->provisionService = $provisionService;
    }

    /**
     * Switch the active database connection to the given organization's database.
     *
     * This is the main entry point. It registers the connection (idempotent),
     * purges any stale connections, and reconnects to the new database.
     */
    public function switchTo(Organization $organization): void
    {
        $connectionName = $this->provisionService->getConnectionName($organization->id);

        // Register the connection config (idempotent — safe to call multiple times)
        $this->provisionService->registerConnection($organization);

        // Purge any existing connection with this name to avoid stale state
        DB::purge($connectionName);

        // Reconnect — this actually opens a new PDO connection
        DB::reconnect($connectionName);

        // Verify the connection is alive
        $this->verifyConnection($connectionName);

        // Track current tenant
        $this->currentOrganization = $organization;
        $this->currentConnectionName = $connectionName;
    }

    /**
     * Get the active connection name for the current tenant.
     */
    public function getCurrentConnectionName(): ?string
    {
        return $this->currentConnectionName;
    }

    /**
     * Get the active organization.
     */
    public function getCurrentOrganization(): ?Organization
    {
        return $this->currentOrganization;
    }

    /**
     * Get a PDO instance for the current tenant database.
     */
    public function getConnection()
    {
        if (!$this->currentConnectionName) {
            throw new \RuntimeException('No tenant connection is active.');
        }

        return DB::connection($this->currentConnectionName);
    }

    /**
     * Verify that a connection is alive by running a simple query.
     *
     * @throws \RuntimeException If the connection cannot be established.
     */
    protected function verifyConnection(string $connectionName): void
    {
        try {
            DB::connection($connectionName)->getPdo();
        } catch (\Throwable $e) {
            throw new \RuntimeException(
                "Failed to connect to tenant database [{$connectionName}]: " . $e->getMessage(),
                previous: $e
            );
        }
    }

    /**
     * Reset the manager state. Called after a request is fully handled.
     */
    public function reset(): void
    {
        if ($this->currentConnectionName) {
            DB::purge($this->currentConnectionName);
        }

        $this->currentOrganization = null;
        $this->currentConnectionName = null;
    }
}
