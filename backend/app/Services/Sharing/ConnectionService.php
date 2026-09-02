<?php

namespace App\Services\Sharing;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationConnection;
use App\Models\Master\OrganizationSharingSetting;
use App\Models\SharedResourceActivityLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * ConnectionService
 *
 * Manages organization-to-organization connections.
 * Handles connection requests, approvals, rejections, revocations.
 */
class ConnectionService
{
    /**
     * Generate a connection invitation code/link for an organization.
     */
    /**
     * Generate an invitation for another organization.
     * Saves the connection code to DB so it can be found during search.
     */
    public function generateInvitation(Organization $organization): array
    {
        $connectionCode = $organization->organization_code;
        $shareLink = url("/share/connect/{$connectionCode}");
        $qrCodeUrl = url("/api/qr-code?size=200&data=" . urlencode($shareLink));

        return [
            'connection_code' => $connectionCode,
            'organization_id' => $organization->id,
            'organization_name' => $organization->name,
            'organization_code' => $organization->organization_code,
            'share_link' => $shareLink,
            'qr_code_url' => $qrCodeUrl,
        ];
    }

    /**
     * Find an organization by org code, slug, ID, connection code, or name search.
     */
    public function findOrganization(string $identifier, ?int $excludeOrgId = null): ?Organization
    {
        $baseQuery = Organization::query()->whereIn('status', ['active', 'trial']);
        if ($excludeOrgId) {
            $baseQuery->where('id', '!=', $excludeOrgId);
        }

        // Try organization code (TXO-XXXXX) - most common search
        $org = (clone $baseQuery)->where('organization_code', $identifier)->first();
        if ($org) {
            return $org;
        }

        // Try slug
        $org = (clone $baseQuery)->where('slug', $identifier)->first();
        if ($org) {
            return $org;
        }

        // Try numeric ID
        if (is_numeric($identifier)) {
            $org = (clone $baseQuery)->find((int) $identifier);
            if ($org) {
                return $org;
            }
        }

        // Try name search (partial match) - escape SQL wildcards in user input
        $escapedIdentifier = str_replace(['%', '_'], ['\\%', '\\_'], $identifier);
        $org = (clone $baseQuery)->where('name', 'LIKE', "%{$escapedIdentifier}%")->first();
        return $org;
    }

    /**
     * Request a connection with another organization.
     */
    public function requestConnection(
        Organization $requestingOrg,
        Organization $receivingOrg,
        int $userId,
        ?string $message = null
    ): OrganizationConnection {
        // Check if connection already exists
        $existing = OrganizationConnection::where(function ($q) use ($requestingOrg, $receivingOrg) {
            $q->where('requesting_organization_id', $requestingOrg->id)
              ->where('receiving_organization_id', $receivingOrg->id);
        })->orWhere(function ($q) use ($requestingOrg, $receivingOrg) {
            $q->where('requesting_organization_id', $receivingOrg->id)
              ->where('receiving_organization_id', $requestingOrg->id);
        })->whereNotIn('status', ['revoked', 'rejected'])->first();

        if ($existing) {
            throw new \RuntimeException('A connection request already exists between these organizations.');
        }

        // Check max connections limit
        $settings = OrganizationSharingSetting::getForOrganization($receivingOrg->id);
        $activeCount = OrganizationConnection::activeForOrganization($receivingOrg->id)->count();
        if ($activeCount >= $settings->max_connections) {
            throw new \RuntimeException('The receiving organization has reached its maximum connection limit.');
        }

        $connectionCode = OrganizationConnection::generateConnectionCode();

        $connection = OrganizationConnection::create([
            'requesting_organization_id' => $requestingOrg->id,
            'receiving_organization_id'  => $receivingOrg->id,
            'requested_by_user_id'       => $userId,
            'connection_code'            => $connectionCode,
            'status'                     => 'pending',
            'request_message'            => $message,
            'requested_at'               => now(),
        ]);

        return $connection;
    }

    /**
     * Approve a connection request.
     */
    public function approveConnection(
        OrganizationConnection $connection,
        int $approvedByUserId
    ): OrganizationConnection {
        if ($connection->status !== 'pending') {
            throw new \RuntimeException('Only pending connections can be approved.');
        }

        $connection->update([
            'status'            => 'active',
            'approved_by_user_id' => $approvedByUserId,
            'approved_at'       => now(),
        ]);

        $this->logConnectionActivity($connection, 'connection_approved', $connection->receiving_organization_id, $approvedByUserId);

        return $connection->fresh();
    }

    /**
     * Reject a connection request.
     */
    public function rejectConnection(
        OrganizationConnection $connection,
        int $rejectedByUserId,
        ?string $reason = null
    ): OrganizationConnection {
        if ($connection->status !== 'pending') {
            throw new \RuntimeException('Only pending connections can be rejected.');
        }

        $connection->update([
            'status'           => 'rejected',
            'rejection_reason' => $reason,
            'rejected_at'      => now(),
        ]);

        $this->logConnectionActivity($connection, 'connection_rejected', $connection->receiving_organization_id, $rejectedByUserId, ['reason' => $reason]);

        return $connection->fresh();
    }

    /**
     * Revoke an active connection.
     */
    public function revokeConnection(
        OrganizationConnection $connection,
        int $revokedByUserId
    ): OrganizationConnection {
        if (!in_array($connection->status, ['active', 'suspended'])) {
            throw new \RuntimeException('Only active or suspended connections can be revoked.');
        }

        $oldStatus = $connection->status;
        $connection->update([
            'status'     => 'revoked',
            'revoked_at' => now(),
        ]);

        $this->logConnectionActivity($connection, 'connection_revoked', $revokedByUserId === $connection->requesting_organization_id
            ? $connection->requesting_organization_id
            : $connection->receiving_organization_id, $revokedByUserId, ['previous_status' => $oldStatus]);

        return $connection->fresh();
    }

    /**
     * Suspend an active connection.
     */
    public function suspendConnection(
        OrganizationConnection $connection,
        int $suspendedByUserId
    ): OrganizationConnection {
        if ($connection->status !== 'active') {
            throw new \RuntimeException('Only active connections can be suspended.');
        }

        $connection->update([
            'status'       => 'suspended',
            'suspended_at' => now(),
        ]);

        $this->logConnectionActivity($connection, 'connection_suspended', $suspendedByUserId === $connection->requesting_organization_id
            ? $connection->requesting_organization_id
            : $connection->receiving_organization_id, $suspendedByUserId);

        return $connection->fresh();
    }

    /**
     * Restore a revoked connection back to active.
     */
    public function restoreConnection(
        OrganizationConnection $connection,
        int $restoredByUserId
    ): OrganizationConnection {
        if (!in_array($connection->status, ['revoked', 'rejected'])) {
            throw new \RuntimeException('Only revoked or rejected connections can be restored.');
        }

        $oldStatus = $connection->status;
        $connection->update([
            'status'       => 'active',
            'revoked_at'   => null,
            'rejected_at'  => null,
            'rejection_reason' => null,
        ]);

        $this->logConnectionActivity($connection, 'connection_restored', $connection->receiving_organization_id, $restoredByUserId, ['previous_status' => $oldStatus]);

        return $connection->fresh();
    }

    /**
     * Permanently delete a connection from both orgs' tenant DBs and the master DB.
     * Logs activity before deletion, then hard-deletes.
     */
    public function deleteConnection(
        OrganizationConnection $connection,
        int $deletedByUserId
    ): void {
        $org1Id = $connection->requesting_organization_id;
        $org2Id = $connection->receiving_organization_id;

        $this->logConnectionActivity($connection, 'connection_deleted', $org1Id, $deletedByUserId, [
            'deleted_by_org' => $deletedByUserId,
        ]);
        $this->logConnectionActivity($connection, 'connection_deleted', $org2Id, $deletedByUserId, [
            'deleted_by_org' => $deletedByUserId,
        ]);

        $this->cleanSharedResourcesForConnection($connection, $org1Id);
        $this->cleanSharedResourcesForConnection($connection, $org2Id);

        $connection->forceDelete();
    }

    /**
     * Clean up shared_resources records for a connection from a tenant DB.
     */
    private function cleanSharedResourcesForConnection(
        OrganizationConnection $connection,
        int $organizationId
    ): void {
        $org = Organization::find($organizationId);
        if (!$org || !$org->database_name) return;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'conn_cleanup_' . $organizationId . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $org->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);

            $conn->table('shared_resources')->where('connection_id', $connection->id)->delete();
        } catch (\Throwable $e) {
            Log::warning("Failed to clean shared resources for connection: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * Log a connection activity to the sharer's tenant DB.
     */
    private function logConnectionActivity(
        OrganizationConnection $connection,
        string $action,
        int $organizationId,
        int $userId,
        ?array $details = null
    ): void {
        $connName = 'conn_log_' . $organizationId . '_' . uniqid();
        try {
            $org = Organization::find($organizationId);
            if (!$org || !$org->database_name) return;

            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $org->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);

            $conn->table('shared_resource_activity_logs')->insert([
                'connection_id'       => $connection->id,
                'user_id'             => $userId,
                'action'              => $action,
                'ip_address'          => request()->ip(),
                'details'             => $details,
                'acted_at'            => now(),
                'created_at'          => now(),
                'updated_at'          => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error("Failed to log connection activity: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * Get all connections for an organization.
     */
    public function getConnections(Organization $organization, ?string $status = null): \Illuminate\Database\Eloquent\Collection
    {
        $query = OrganizationConnection::forOrganization($organization->id);

        if ($status) {
            $query->where('status', $status);
        }

        return $query->with(['requestingOrganization', 'receivingOrganization'])
                     ->latest()
                     ->get();
    }

    /**
     * Get a specific connection by ID, ensuring it belongs to the organization.
     */
    public function getConnection(int $connectionId, int $organizationId): ?OrganizationConnection
    {
        return OrganizationConnection::where('id', $connectionId)
            ->where(function ($q) use ($organizationId) {
                $q->where('requesting_organization_id', $organizationId)
                  ->orWhere('receiving_organization_id', $organizationId);
            })->with(['requestingOrganization', 'receivingOrganization'])
              ->first();
    }

    /**
     * Find connection between two specific organizations.
     */
    public function findConnectionBetween(int $org1Id, int $org2Id): ?OrganizationConnection
    {
        return OrganizationConnection::where(function ($q) use ($org1Id, $org2Id) {
            $q->where('requesting_organization_id', $org1Id)
              ->where('receiving_organization_id', $org2Id);
        })->orWhere(function ($q) use ($org1Id, $org2Id) {
            $q->where('requesting_organization_id', $org2Id)
              ->where('receiving_organization_id', $org1Id);
        })->whereIn('status', ['active', 'pending'])->first();
    }

    /**
     * Get connection statistics for an organization.
     */
    public function getStats(Organization $organization): array
    {
        $orgId = $organization->id;

        $rows = OrganizationConnection::where(function ($q) use ($orgId) {
            $q->where('requesting_organization_id', $orgId)
              ->orWhere('receiving_organization_id', $orgId);
        })->selectRaw('status, COUNT(*) as cnt')->groupBy('status')->get();

        $stats = ['total' => 0, 'active' => 0, 'pending' => 0, 'rejected' => 0, 'revoked' => 0];
        foreach ($rows as $row) {
            $stats['total'] += $row->cnt;
            if (isset($stats[$row->status])) {
                $stats[$row->status] = $row->cnt;
            }
        }

        return $stats;
    }
}
