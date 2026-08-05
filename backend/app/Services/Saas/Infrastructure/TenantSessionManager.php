<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Session;

/**
 * TenantSessionManager.
 *
 * Provides tenant-isolated session operations.
 * Sessions are namespaced by tenant to prevent cross-tenant access.
 * Supports: Remember Me, session expiration, logout.
 */
class TenantSessionManager
{
    protected ?Organization $organization = null;

    /**
     * Set the current tenant context.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
        $this->configureSession();
    }

    /**
     * Get the session namespace prefix for the current tenant.
     */
    public function getPrefix(): string
    {
        return $this->organization
            ? 'tenant_' . $this->organization->id . '_'
            : '';
    }

    /**
     * Get a session key with tenant prefix.
     */
    public function key(string $key): string
    {
        return $this->getPrefix() . $key;
    }

    /**
     * Put a value in the tenant-namespaced session.
     */
    public function put(string $key, mixed $value): void
    {
        Session::put($this->key($key), $value);
    }

    /**
     * Get a value from the tenant-namespaced session.
     */
    public function get(string $key, mixed $default = null): mixed
    {
        return Session::get($this->key($key), $default);
    }

    /**
     * Check if a key exists in the tenant-namespaced session.
     */
    public function has(string $key): bool
    {
        return Session::has($this->key($key));
    }

    /**
     * Remove a key from the tenant-namespaced session.
     */
    public function forget(string $key): void
    {
        Session::forget($this->key($key));
    }

    /**
     * Flush all session data for the current tenant.
     */
    public function flush(): void
    {
        $prefix = $this->getPrefix();
        $all = Session::all();

        foreach ($all as $key => $value) {
            if (str_starts_with($key, $prefix)) {
                Session::forget($key);
            }
        }
    }

    /**
     * Invalidate the entire session (logout).
     * Regenerates the session ID and removes all data.
     */
    public function invalidate(): void
    {
        Session::invalidate();
        Session::regenerateToken();
    }

    /**
     * Configure the session for the current tenant.
     */
    protected function configureSession(): void
    {
        if (!$this->organization) return;

        $prefix = config('tenancy.session_prefix', 'tenant_:tenant_id:');
        $tenantPrefix = str_replace(':tenant_id:', $this->organization->id, $prefix);

        // Configure session driver to use tenant-specific settings
        config()->set('session.cookie', $tenantPrefix . config('session.cookie'));
        config()->set('session.table', 'sessions');
    }

    /**
     * Check if "Remember Me" should be used.
     */
    public function shouldRemember(): bool
    {
        return $this->get('remember_me', false);
    }

    /**
     * Set the "Remember Me" flag.
     */
    public function setRemember(bool $remember): void
    {
        $this->put('remember_me', $remember);
    }

    /**
     * Get session expiration in minutes.
     */
    public function getExpiration(): int
    {
        return (int) config('session.lifetime', 180);
    }
}
