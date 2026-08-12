<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Storage;

/**
 * TenantStorageManager.
 *
 * Provides tenant-isolated file storage operations.
 * Files are stored in tenant-specific directories:
 *   storage/tenants/{slug}/documents/
 *   storage/tenants/{slug}/avatars/
 *   storage/tenants/{slug}/attachments/
 *   storage/tenants/{slug}/reports/
 */
class TenantStorageManager
{
    protected ?Organization $organization = null;
    protected string $disk;

    public function __construct()
    {
        $this->disk = config('tenancy.storage.disk', 'public');
    }

    /**
     * Set the current tenant context.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
    }

    /**
     * Get the tenant root directory.
     */
    public function getTenantRoot(): string
    {
        if (!$this->organization) {
            return 'tenants/global';
        }

        return 'tenants/' . $this->organization->slug;
    }

    /**
     * Get a path within the tenant's storage.
     */
    public function path(string $subpath = ''): string
    {
        $root = $this->getTenantRoot();
        return $subpath ? "{$root}/{$subpath}" : $root;
    }

    /**
     * Store a file in the tenant's storage.
     */
    public function put(string $path, string $contents, ?string $disk = null): string|false
    {
        return Storage::disk($disk ?? $this->disk)
            ->put($this->path($path), $contents);
    }

    /**
     * Store an uploaded file in the tenant's storage.
     */
    public function putFile(string $path, $file, ?string $disk = null): string|false
    {
        return Storage::disk($disk ?? $this->disk)
            ->putFile($this->path($path), $file);
    }

    /**
     * Get the URL for a tenant file.
     */
    public function url(string $path): string
    {
        return Storage::disk($this->disk)
            ->url($this->path($path));
    }

    /**
     * Check if a file exists in the tenant's storage.
     */
    public function exists(string $path, ?string $disk = null): bool
    {
        return Storage::disk($disk ?? $this->disk)
            ->exists($this->path($path));
    }

    /**
     * Delete a file from the tenant's storage.
     */
    public function delete(string $path, ?string $disk = null): bool
    {
        return Storage::disk($disk ?? $this->disk)
            ->delete($this->path($path));
    }

    /**
     * Get the contents of a file from the tenant's storage.
     */
    public function get(string $path, ?string $disk = null): string|false
    {
        return Storage::disk($disk ?? $this->disk)
            ->get($this->path($path));
    }

    /**
     * List files in a tenant directory.
     */
    public function files(string $directory = '', ?string $disk = null): array
    {
        return Storage::disk($disk ?? $this->disk)
            ->files($this->path($directory));
    }

    /**
     * Create the tenant directory structure.
     */
    public function createDirectories(): void
    {
        $directories = ['documents', 'avatars', 'attachments', 'reports'];

        foreach ($directories as $dir) {
            $path = $this->path($dir);
            if (!Storage::disk($this->disk)->exists($path)) {
                Storage::disk($this->disk)->makeDirectory($path);
            }
        }
    }

    /**
     * Get the disk being used.
     */
    public function getDisk(): string
    {
        return $this->disk;
    }
}
