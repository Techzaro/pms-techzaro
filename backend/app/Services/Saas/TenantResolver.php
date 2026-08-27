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
 * 1. Header: X-Tenant-ID header → look up by slug or ID (always checked first)
 * 2. Path: /org/{slug} → extract slug from URL path
 * 3. Subdomain: tenant.pms.test → look up "tenant.pms.test" in organization_domains (legacy)
 * 4. Bearer token: resolved in ResolveTenantDatabase middleware
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
        // 1. Always check X-Tenant-ID header first (sent by frontend)
        $headerOrg = $this->resolveFromHeader($request);
        if ($headerOrg) {
            return $headerOrg;
        }

        // 2. Check path-based resolution: /org/{slug}
        $pathOrg = $this->resolveFromPath($request);
        if ($pathOrg) {
            return $pathOrg;
        }

        // 3. Legacy subdomain resolution
        $strategy = config('tenancy.identification', 'path');
        if ($strategy === 'subdomain') {
            return $this->resolveFromSubdomain($request);
        }

        return null;
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
     * Resolve tenant from the URL path: /org/{slug}/...
     *
     * This is the primary resolution strategy for the new path-based architecture.
     */
    protected function resolveFromPath(Request $request): ?Organization
    {
        $path = $request->path();

        // Match pattern: org/{slug} or org/{slug}/...
        if (preg_match('#^org/([a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)(?:/.*)?$#i', $path, $matches)) {
            $slug = $matches[1];
            $org = Organization::where('slug', $slug)->first();
            if ($org) {
                return $org;
            }
        }

        // Match pattern: api/public/esign/{slug}/{token}, public/esign/{slug}/{token}, or esign/{slug}/{token}
        if (preg_match('#^(?:api/)?(?:public/)?esign/([a-z0-9\-_]+)/[a-zA-Z0-9]{30,}#i', $path, $matches)) {
            $slug = $matches[1];
            $org = Organization::where('slug', $slug)->first();
            if ($org) {
                return $org;
            }
        }

        return null;
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

        $subdomain = $this->extractSubdomain($hostname, $baseDomain);

        if (!$subdomain) {
            return $this->lookupDomain($hostname);
        }

        $fullDomain = $subdomain . '.' . $baseDomain;
        return $this->lookupDomain($fullDomain);
    }

    /**
     * Extract subdomain from hostname.
     */
    protected function extractSubdomain(string $hostname, string $baseDomain): ?string
    {
        $hostname = explode(':', $hostname)[0];

        if ($hostname === $baseDomain) {
            return null;
        }

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
     * Check if the request contains a tenant identifier (header, path, or subdomain).
     */
    public function hasTenantIdentifier(Request $request): bool
    {
        // Check header
        if ($request->hasHeader(config('tenancy.header', 'X-Tenant-ID'))) {
            return true;
        }

        // Check path: /org/{slug}
        $path = $request->path();
        if (preg_match('#^org/[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:/.*)?$#', $path)) {
            return true;
        }

        // Check subdomain (legacy)
        $strategy = config('tenancy.identification', 'path');
        if ($strategy === 'subdomain') {
            $hostname = $request->getHost();
            $baseDomain = config('tenancy.domain', 'pms.test');
            $hostname = explode(':', $hostname)[0];
            return $hostname !== $baseDomain && str_ends_with($hostname, '.' . $baseDomain);
        }

        return false;
    }
}
