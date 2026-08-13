<?php

namespace App\Services\Saas\Provisioning;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationDomain;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DomainRegistrar.
 *
 * Registers organization domains in the master database.
 * Domains are used by TenantResolver for tenant identification.
 */
class DomainRegistrar
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Register a domain for an organization.
     *
     * @param Organization $organization The organization.
     * @param string $domain The domain (e.g., "acme.pms.test").
     * @param bool $isPrimary Whether this is the primary domain.
     * @param bool $isVerified Whether the domain is pre-verified.
     *
     * @return OrganizationDomain
     * @throws \RuntimeException If the domain is already registered.
     */
    public function register(
        Organization $organization,
        string $domain,
        bool $isPrimary = true,
        bool $isVerified = true,
    ): OrganizationDomain {
        Log::info("Registering domain: {$domain} for organization: {$organization->slug}");

        // Check for duplicate domain
        $exists = OrganizationDomain::where('domain', $domain)->exists();
        if ($exists) {
            throw new \RuntimeException("Domain '{$domain}' is already registered to another organization.");
        }

        // If this is primary, unmark any existing primary
        if ($isPrimary) {
            OrganizationDomain::where('organization_id', $organization->id)
                ->where('is_primary', true)
                ->update(['is_primary' => false]);
        }

        $domainRecord = OrganizationDomain::create([
            'organization_id' => $organization->id,
            'domain'          => $domain,
            'is_primary'      => $isPrimary,
            'is_verified'     => $isVerified,
            'verified_at'     => $isVerified ? now() : null,
        ]);

        Log::info("Domain registered: {$domain} (ID: {$domainRecord->id}) for organization: {$organization->slug}");

        return $domainRecord;
    }

    /**
     * Check if a domain is already registered.
     */
    public function exists(string $domain): bool
    {
        return OrganizationDomain::where('domain', $domain)->exists();
    }

    /**
     * Remove a domain registration (used for rollback).
     */
    public function remove(int $domainId): void
    {
        OrganizationDomain::where('id', $domainId)->delete();
    }
}
