<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationDomain;
use Illuminate\Http\Request;

/**
 * TenantResolver.
 *
 * Responsible ONLY for resolving the current organization from an HTTP request.
 * Does not perform CRUD, database provisioning, or any other operations.
 *
 * Resolution strategies (checked in order):
 * 1. Subdomain: tenant.pms.test → look up "tenant.pms.test" in organization_domains
 * 2. Header: X-Tenant-ID header → look up by slug or ID
 * 3. Configurable dev fallback: for local development
 */
class TenantResolver
{
    /**
     * Resolve the current tenant from the request.
     *
     * Returns null if no tenant is identified (e.g., super admin routes).
     */
    public function resolve(Request $request): ?Organization
    {
        $strategy = config('tenancy.identification', 'subdomain');

        // Always check for X-Tenant-ID header first (works for both subdomain and header modes)
        $headerOrg = $this->resolveFromHeader($request);
        if ($headerOrg) {
            return $headerOrg;
        }

        return match ($strategy) {
            'subdomain' => $this->resolveFromSubdomain($request),
            'header'    => $this->resolveFromHeader($request),
            default     => null,
        };
    }

    /**
     * Resolve tenant from the request subdomain.
     *
     * Example: "techxaro.pms.test" → extracts "techxaro" → looks up domain
     */
    protected function resolveFromSubdomain(Request $request): ?Organization
    {
        $hostname = $request->getHost();
        $baseDomain = config('tenancy.domain', 'pms.test');

        // In local dev, also support direct hostname matching
        // e.g., "techxaro.localhost" or "techxaro.pms.test"
        $subdomain = $this->extractSubdomain($hostname, $baseDomain);

        if (!$subdomain) {
            // Fallback: check if the full hostname is a registered domain
            return $this->lookupDomain($hostname);
        }

        $fullDomain = $subdomain . '.' . $baseDomain;
        return $this->lookupDomain($fullDomain);
    }

    /**
     * Resolve tenant from the X-Tenant-ID header.
     */
    protected function resolveFromHeader(Request $request): ?Organization
    {
        $headerName = config('tenancy.header', 'X-Tenant-ID');
        $tenantId = $request->header($headerName);

        if (!$tenantId) {
            return null;
        }

        // Try by slug first, then by ID
        $org = Organization::where('slug', $tenantId)->first();
        if ($org) {
            return $org;
        }

        if (is_numeric($tenantId)) {
            return Organization::find((int) $tenantId);
        }

        return null;
    }

    /**
     * Extract subdomain from hostname.
     *
     * "techxaro.pms.test" with base "pms.test" → "techxaro"
     * "localhost" with base "pms.test" → null
     */
    protected function extractSubdomain(string $hostname, string $baseDomain): ?string
    {
        // Remove port if present
        $hostname = explode(':', $hostname)[0];

        // Exact match of base domain — no subdomain
        if ($hostname === $baseDomain) {
            return null;
        }

        // Check if hostname ends with the base domain
        $suffix = '.' . $baseDomain;
        if (str_ends_with($hostname, $suffix)) {
            $subdomain = substr($hostname, 0, -strlen($suffix));
            return $subdomain ?: null;
        }

        return null;
    }

    /**
     * Look up an organization by its registered domain.
     */
    protected function lookupDomain(string $domain): ?Organization
    {
        $record = OrganizationDomain::where('domain', $domain)
            ->where('is_verified', true)
            ->with('organization')
            ->first();

        return $record?->organization;
    }

    /**
     * Check if a route is a central (non-tenant) route.
     */
    public function isCentralRoute(Request $request): bool
    {
        $path = $request->path();
        $centralRoutes = config('tenancy.central_routes', []);

        foreach ($centralRoutes as $pattern) {
            $pattern = rtrim($pattern, '*');
            if (str_starts_with($path, $pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if the request contains a tenant identifier (subdomain or header).
     *
     * Returns true if a tenant identifier is explicitly present, even if
     * the organization is not found. Used to distinguish "no identifier"
     * (graceful skip) from "identifier provided but invalid" (error).
     */
    public function hasTenantIdentifier(Request $request): bool
    {
        // Always check header first (works for both modes)
        if ($request->hasHeader(config('tenancy.header', 'X-Tenant-ID'))) {
            return true;
        }

        $strategy = config('tenancy.identification', 'subdomain');

        if ($strategy === 'subdomain') {
            $hostname = $request->getHost();
            $baseDomain = config('tenancy.domain', 'pms.test');
            $hostname = explode(':', $hostname)[0];
            return $hostname !== $baseDomain && str_ends_with($hostname, '.' . $baseDomain);
        }

        if ($strategy === 'header') {
            return $request->hasHeader(config('tenancy.header', 'X-Tenant-ID'));
        }

        return false;
    }
}
