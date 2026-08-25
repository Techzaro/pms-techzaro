<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationDomain;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationSubscription;
use App\Services\Saas\SubscriptionHistoryService;
use Illuminate\Support\Facades\DB;

/**
 * OrganizationService.
 *
 * Responsible ONLY for organization CRUD operations:
 * - Create, read, update, soft-delete organizations
 * - Suspend and reactivate organizations
 * - Manage organization domains
 * - Platform statistics
 *
 * Does not handle database provisioning, subscriptions, or module access.
 */
class OrganizationService
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseProvisionService $db,
        protected SubscriptionService $subscriptions,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /*
    |------------------------------------------------------------------
    | Read Operations
    |------------------------------------------------------------------
    */

    /** Get all organizations with relations. */
    public function getAll(): \Illuminate\Database\Eloquent\Collection
    {
        return Organization::with(['subscription.plan', 'primaryDomain'])
            ->orderBy('name')
            ->get();
    }

    /** Find by ID. */
    public function findById(int $id): ?Organization
    {
        return Organization::with(['subscription.plan', 'domains'])->find($id);
    }

    /** Find by slug. */
    public function findBySlug(string $slug): ?Organization
    {
        return Organization::with(['subscription.plan', 'domains'])
            ->where('slug', $slug)
            ->first();
    }

    /** Find by database name. */
    public function findByDatabaseName(string $dbName): ?Organization
    {
        return Organization::where('database_name', $dbName)->first();
    }

    /*
    |------------------------------------------------------------------
    | Create
    |------------------------------------------------------------------
    */

    /**
     * Create a new organization with database, domain, and default subscription.
     *
     * Orchestrates DatabaseProvisionService and SubscriptionService
     * but does not duplicate their logic.
     */
    public function create(array $data): Organization
    {
        $dbName = $data['database_name'] ?? config('tenancy.database_prefix', 'pms_tenant_') . $data['slug'];

        // 1. Provision database (creates DB + runs migrations)
        $this->db->createDatabase($dbName);
        $this->db->runMigrations($dbName);

        // 1b. Fix any missing columns/tables that migrations might have missed
        try {
            \App\Console\Commands\FixTenantColumns::fixDatabaseProgrammatic($dbName);
        } catch (\Throwable $e) {
            \Log::warning('FixTenantColumns failed during OrganizationService create', ['db' => $dbName, 'error' => $e->getMessage()]);
        }

        // 2. Create organization record
        $organization = Organization::create([
            'name'            => $data['name'],
            'slug'            => $data['slug'],
            'admin_name'      => $data['admin_name'] ?? null,
            'admin_email'     => $data['admin_email'] ?? null,
            'database_name'   => $dbName,
            'database_host'   => $data['database_host'] ?? config('tenancy.default_database.host'),
            'database_port'   => $data['database_port'] ?? config('tenancy.default_database.port'),
            'database_username' => $data['database_username'] ?? config('tenancy.default_database.username'),
            'database_password' => $data['database_password'] ?? config('tenancy.default_database.password'),
            'type'            => $data['type'] ?? 'standard',
            'status'          => $data['status'] ?? 'active',
            'timezone'        => $data['timezone'] ?? 'Asia/Karachi',
            'settings'        => $data['settings'] ?? null,
            'trial_ends_at'   => $data['trial_ends_at'] ?? now()->addMinutes(
                isset($data['trial_duration'], $data['trial_duration_unit'])
                    ? match ($data['trial_duration_unit']) {
                        'minutes' => $data['trial_duration'],
                        'hours'   => $data['trial_duration'] * 60,
                        'days'    => $data['trial_duration'] * 24 * 60,
                        default   => $data['trial_duration'] * 24 * 60,
                    }
                    : 14 * 24 * 60
            ),
        ]);

        // 3. Register domain
        if (!empty($data['domain'])) {
            OrganizationDomain::create([
                'organization_id' => $organization->id,
                'domain'          => $data['domain'],
                'is_primary'      => true,
                'is_verified'     => true,
                'verified_at'     => now(),
            ]);
        }

        // 4. Assign plan only if explicitly provided (optional for trial)
        if (!empty($data['plan_id'])) {
            $plan = \App\Models\Master\OrganizationPlan::find($data['plan_id']);
            if ($plan) {
                $this->subscriptions->assignPlan($organization, $plan, $data['billing_period'] ?? 'monthly');
            }
        }

        return $organization;
    }

    /*
    |------------------------------------------------------------------
    | Update
    |------------------------------------------------------------------
    */

    /** Update organization metadata. */
    public function update(Organization $organization, array $data): Organization
    {
        $organization->update($data);
        return $organization->fresh();
    }

    /** Soft-delete an organization (database is NOT dropped). */
    public function delete(Organization $organization): bool
    {
        return $organization->delete();
    }

    /** Suspend an organization. */
    public function suspend(Organization $organization): Organization
    {
        $organization->update([
            'status'       => 'suspended',
            'suspended_at' => now(),
        ]);

        // Record suspension history
        try {
            app(SubscriptionHistoryService::class)->recordSuspended($organization);
        } catch (\Throwable $e) {
            \Log::warning("Failed to record suspension history: " . $e->getMessage());
        }

        return $organization->fresh();
    }

    /** Reactivate a suspended organization. */
    public function reactivate(Organization $organization): Organization
    {
        $organization->update([
            'status'       => 'active',
            'suspended_at' => null,
        ]);

        // Record reactivation history
        try {
            app(SubscriptionHistoryService::class)->recordReactivated($organization);
        } catch (\Throwable $e) {
            \Log::warning("Failed to record reactivation history: " . $e->getMessage());
        }

        return $organization->fresh();
    }

    /*
    |------------------------------------------------------------------
    | Domain Management
    |------------------------------------------------------------------
    */

    /** Add a domain to an organization. */
    public function addDomain(Organization $organization, string $domain, bool $isPrimary = false): OrganizationDomain
    {
        return OrganizationDomain::create([
            'organization_id' => $organization->id,
            'domain'          => $domain,
            'is_primary'      => $isPrimary,
            'is_verified'     => false,
        ]);
    }

    /** Remove a domain from an organization. */
    public function removeDomain(int $domainId): bool
    {
        return OrganizationDomain::where('id', $domainId)->delete() > 0;
    }

    /*
    |------------------------------------------------------------------
    | Statistics
    |------------------------------------------------------------------
    */

    /** Get platform-wide statistics. */
    public function getStats(): array
    {
        $activeQuery = Organization::where('status', '!=', 'deleted');

        return [
            'total_organizations'     => (clone $activeQuery)->count(),
            'active_organizations'    => (clone $activeQuery)->where('status', 'active')->count(),
            'trial_organizations'     => (clone $activeQuery)->where('status', 'trial')->count(),
            'suspended_organizations' => (clone $activeQuery)->where('status', 'suspended')->count(),
        ];
    }
}
