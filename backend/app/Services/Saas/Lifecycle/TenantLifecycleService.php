<?php

namespace App\Services\Saas\Lifecycle;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * TenantLifecycleService.
 *
 * Manages the complete lifecycle of tenant organizations:
 * - Suspend: Block all requests, invalidate sessions
 * - Activate: Restore to active state
 * - Archive: Soft-disable with database intact
 * - Restore: Bring back archived/deleted organizations
 * - Delete: Soft-delete only (database preserved)
 */
class TenantLifecycleService
{
    protected string $masterConnection;

    public function __construct(
        protected OrganizationStateMachine $stateMachine,
        protected LifecycleLogger $logger,
        protected DatabaseProvisionService $db,
        protected TenantDatabaseManager $dbManager,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Suspend an organization.
     * Immediately blocks all future requests. Existing sessions become invalid.
     */
    public function suspend(Organization $organization, ?string $reason = null): Organization
    {
        $this->stateMachine->validateTransition($organization->status, OrganizationStateMachine::STATE_SUSPENDED);

        $oldStatus = $organization->status;

        $organization->update([
            'status'       => OrganizationStateMachine::STATE_SUSPENDED,
            'suspended_at' => now(),
        ]);

        // Invalidate all sessions for this tenant's users
        $this->invalidateSessions($organization);

        $this->logger->log('suspend', $organization, 'success', [
            'old_status' => $oldStatus,
            'reason'     => $reason,
        ]);

        Log::warning("Organization suspended: {$organization->slug}", [
            'reason' => $reason,
            'user'   => auth()->id() ?? 'system',
        ]);

        return $organization->fresh();
    }

    /**
     * Activate a suspended or trial organization.
     */
    public function activate(Organization $organization): Organization
    {
        $this->stateMachine->validateTransition($organization->status, OrganizationStateMachine::STATE_ACTIVE);

        $oldStatus = $organization->status;

        $organization->update([
            'status'       => OrganizationStateMachine::STATE_ACTIVE,
            'suspended_at' => null,
        ]);

        $this->logger->log('activate', $organization, 'success', [
            'old_status' => $oldStatus,
        ]);

        Log::info("Organization activated: {$organization->slug}", [
            'user' => auth()->id() ?? 'system',
        ]);

        return $organization->fresh();
    }

    /**
     * Archive an organization.
     * Database remains intact. Can later be restored.
     */
    public function archive(Organization $organization, ?string $reason = null): Organization
    {
        $this->stateMachine->validateTransition($organization->status, OrganizationStateMachine::STATE_ARCHIVED);

        $oldStatus = $organization->status;

        $organization->update([
            'status' => OrganizationStateMachine::STATE_ARCHIVED,
        ]);

        $this->invalidateSessions($organization);

        $this->logger->log('archive', $organization, 'success', [
            'old_status' => $oldStatus,
            'reason'     => $reason,
        ]);

        Log::info("Organization archived: {$organization->slug}", [
            'reason' => $reason,
            'user'   => auth()->id() ?? 'system',
        ]);

        return $organization->fresh();
    }

    /**
     * Restore an archived or soft-deleted organization.
     */
    public function restore(Organization $organization): Organization
    {
        // Handle soft-deleted organizations
        if ($organization->trashed()) {
            $organization->restore();

            $this->logger->log('restore', $organization, 'success', [
                'from_state' => 'deleted',
            ]);

            Log::info("Organization restored from deletion: {$organization->slug}", [
                'user' => auth()->id() ?? 'system',
            ]);

            return $organization->fresh();
        }

        // Handle archived organizations
        $this->stateMachine->validateTransition($organization->status, OrganizationStateMachine::STATE_ACTIVE);

        $oldStatus = $organization->status;

        $organization->update([
            'status' => OrganizationStateMachine::STATE_ACTIVE,
        ]);

        $this->logger->log('restore', $organization, 'success', [
            'old_status' => $oldStatus,
        ]);

        Log::info("Organization restored: {$organization->slug}", [
            'old_status' => $oldStatus,
            'user'       => auth()->id() ?? 'system',
        ]);

        return $organization->fresh();
    }

    /**
     * Soft-delete an organization. Database is NOT dropped.
     */
    public function delete(Organization $organization, ?string $reason = null): bool
    {
        $this->stateMachine->validateTransition($organization->status, OrganizationStateMachine::STATE_DELETED);

        $oldStatus = $organization->status;

        $result = $organization->delete();

        $this->logger->log('delete', $organization, $result ? 'success' : 'failed', [
            'old_status' => $oldStatus,
            'reason'     => $reason,
        ]);

        Log::info("Organization soft-deleted: {$organization->slug}", [
            'reason' => $reason,
            'user'   => auth()->id() ?? 'system',
        ]);

        return $result;
    }

    /**
     * Check if an organization can accept requests.
     */
    public function canAcceptRequests(Organization $organization): bool
    {
        return $this->stateMachine->isUsable($organization->status);
    }

    /**
     * Get the status label for display.
     */
    public function getStatusLabel(string $status): string
    {
        return match ($status) {
            OrganizationStateMachine::STATE_DRAFT     => 'Draft',
            OrganizationStateMachine::STATE_ACTIVE    => 'Active',
            OrganizationStateMachine::STATE_TRIAL     => 'Trial',
            OrganizationStateMachine::STATE_SUSPENDED => 'Suspended',
            OrganizationStateMachine::STATE_ARCHIVED  => 'Archived',
            OrganizationStateMachine::STATE_DELETED   => 'Deleted',
            default => ucfirst($status),
        };
    }

    /**
     * Invalidate all sessions for users in a tenant database.
     */
    protected function invalidateSessions(Organization $organization): void
    {
        try {
            $masterConfig = config("database.connections.{$this->masterConnection}");

            config()->set('database.connections.tenant_session_invalidate', [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $organization->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => true,
                'strict'    => true,
                'engine'    => null,
            ]);

            // Delete all sessions for this tenant
            DB::connection('tenant_session_invalidate')
                ->table('sessions')
                ->delete();

            // Delete all personal access tokens (Sanctum)
            DB::connection('tenant_session_invalidate')
                ->table('personal_access_tokens')
                ->delete();

            config()->offsetUnset('database.connections.tenant_session_invalidate');
        } catch (\Throwable $e) {
            Log::warning("Failed to invalidate sessions for organization: {$organization->slug}", [
                'error' => $e->getMessage(),
            ]);
        }
    }
}
