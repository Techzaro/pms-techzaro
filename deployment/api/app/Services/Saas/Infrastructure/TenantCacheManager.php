<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Cache;

/**
 * TenantCacheManager.
 *
 * Provides tenant-isolated cache operations.
 * Every cache key is automatically prefixed with the tenant identifier.
 * Prevents cache collisions between tenants.
 */
class TenantCacheManager
{
    protected ?Organization $organization = null;

    /**
     * Set the current tenant context.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
    }

    /**
     * Get the current tenant context.
     */
    public function getTenant(): ?Organization
    {
        return $this->organization;
    }

    /**
     * Clear the tenant context (e.g., after request ends).
     */
    public function clearTenant(): void
    {
        $this->organization = null;
    }

    /**
     * Get a cache-prefixed key for the current tenant.
     */
    public function prefix(string $key): string
    {
        $tenantPrefix = $this->organization
            ? $this->organization->slug . ':'
            : 'global:';

        return $tenantPrefix . $key;
    }

    /**
     * Get an item from the tenant-prefixed cache.
     */
    public function get(string $key, mixed $default = null): mixed
    {
        return Cache::get($this->prefix($key), $default);
    }

    /**
     * Store an item in the tenant-prefixed cache.
     */
    public function put(string $key, mixed $value, int|\DateTimeInterface $ttl = 3600): bool
    {
        return Cache::put($this->prefix($key), $value, $ttl);
    }

    /**
     * Store an item permanently in the tenant-prefixed cache.
     */
    public function forever(string $key, mixed $value): bool
    {
        return Cache::forever($this->prefix($key), $value);
    }

    /**
     * Remove an item from the tenant-prefixed cache.
     */
    public function forget(string $key): bool
    {
        return Cache::forget($this->prefix($key));
    }

    /**
     * Check if an item exists in the tenant-prefixed cache.
     */
    public function has(string $key): bool
    {
        return Cache::has($this->prefix($key));
    }

    /**
     * Store an item if it doesn't already exist.
     */
    public function add(string $key, mixed $value, int|\DateTimeInterface $ttl = 3600): bool
    {
        return Cache::add($this->prefix($key), $value, $ttl);
    }

    /**
     * Increment a counter in the tenant-prefixed cache.
     */
    public function increment(string $key, int $value = 1): int|false
    {
        return Cache::increment($this->prefix($key), $value);
    }

    /**
     * Decrement a counter in the tenant-prefixed cache.
     */
    public function decrement(string $key, int $value = 1): int|false
    {
        return Cache::decrement($this->prefix($key), $value);
    }

    /**
     * Remember an item in the tenant-prefixed cache.
     */
    public function remember(string $key, int|\DateTimeInterface $ttl, callable $callback): mixed
    {
        return Cache::remember($this->prefix($key), $ttl, $callback);
    }

    /**
     * Flush all cache entries for the current tenant.
     */
    public function flush(): bool
    {
        if (!$this->organization) {
            return false;
        }

        // Only flush keys with this tenant's prefix
        $prefix = $this->organization->slug . ':';

        try {
            $store = Cache::getStore();
            if (method_exists($store, 'getStore')) {
                $underlying = $store->getStore();
                if ($underlying instanceof \Illuminate\Cache\Repository) {
                    // For file-based cache, scan and delete matching files
                    $cachePath = storage_path('framework/cache/data');
                    return $this->flushFileCache($cachePath, $prefix);
                }
            }
        } catch (\Throwable $e) {
            // Fallback: just forget known keys
        }

        return false;
    }

    /**
     * Flush file-based cache entries matching a prefix.
     */
    protected function flushFileCache(string $path, string $prefix): bool
    {
        if (!is_dir($path)) return true;

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \RecursiveDirectoryIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $content = file_get_contents($file->getPathname());
                if ($content !== false && str_starts_with($content, $prefix)) {
                    unlink($file->getPathname());
                }
            }
        }

        return true;
    }
}
