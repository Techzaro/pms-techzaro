<?php

namespace App\Services;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

/**
 * Resolves the correct storage disk and path prefix for a given organization.
 *
 * Supports:
 * - Local disk (default) with org-specific subdirectories
 * - AWS S3 with per-org prefix isolation (org-{id}/...)
 * - Dynamic S3 configuration per org
 */
class StorageDiskResolver
{
    /**
     * Get the filesystem disk for an organization.
     * Returns 'local' or 's3' based on org preferences.
     */
    public static function getDisk(Organization $org): string
    {
        if ($org->storage_driver === 's3' && $org->storage_s3_access_key && $org->storage_s3_secret_key) {
            $config = [
                'driver'                  => 's3',
                'key'                     => $org->storage_s3_access_key,
                'secret'                  => $org->storage_s3_secret_key,
                'region'                  => $org->storage_s3_region ?? 'us-east-1',
                'bucket'                  => $org->storage_s3_bucket,
                'use_path_style_endpoint' => false,
            ];

            // S3-compatible providers (Cloudflare R2, DigitalOcean Spaces, Wasabi, MinIO etc.)
            if (!empty($org->storage_s3_endpoint)) {
                $config['endpoint'] = $org->storage_s3_endpoint;
                $config['use_path_style_endpoint'] = true;
            }

            config()->set('filesystems.disks.s3', $config);
            return 's3';
        }
        return 'public';
    }

    /**
     * Get the storage path prefix for an organization.
     * S3: "org-{id}/{category}/..."
     * Local: uses default public disk paths
     */
    public static function getPrefix(Organization $org, string $category = ''): string
    {
        if ($org->storage_driver === 's3') {
            $base = $org->storage_s3_prefix ?: "org-{$org->id}";
            return $category ? "{$base}/{$category}" : $base;
        }
        return $category;
    }

    /**
     * Build the full storage path for a file.
     */
    public static function buildPath(Organization $org, string $category, string $fileName): string
    {
        $prefix = self::getPrefix($org, $category);
        $datePrefix = date('Y/m');
        return "{$prefix}/{$datePrefix}/{$fileName}";
    }

    /**
     * Store a file to the organization's storage.
     * Returns the stored path relative to the disk.
     */
    public static function store(
        Organization $org,
        $file,
        string $category,
        ?string $customName = null
    ): string {
        $disk = self::getDisk($org);
        $fileName = $customName ?: $file->getClientOriginalName();
        $path = self::buildPath($org, $category, $fileName);

        // Ensure unique filename
        $existing = Storage::disk($disk)->exists($path);
        if ($existing) {
            $name = pathinfo($path, PATHINFO_FILENAME);
            $ext = pathinfo($path, PATHINFO_EXTENSION);
            $path = self::buildPath($org, $category, $name . '_' . uniqid() . '.' . $ext);
        }

        if ($disk === 's3') {
            Storage::disk('s3')->put($path, file_get_contents($file), 'private');
            return $path;
        }

        return $file->store($category ? $category . '/' . date('Y/m') : date('Y/m'), 'public');
    }

    /**
     * Delete a file from the organization's storage.
     */
    public static function delete(Organization $org, string $filePath): bool
    {
        try {
            $disk = self::getDisk($org);

            // Normalize the path - remove leading /storage/ if present
            $path = ltrim($filePath, '/');
            if (str_starts_with($path, 'storage/')) {
                $path = substr($path, 8);
            }

            if ($disk === 's3') {
                // For S3, the path includes the org prefix
                return Storage::disk('s3')->delete($path);
            }

            // For local/public disk
            return Storage::disk('public')->delete($path);
        } catch (\Throwable $e) {
            Log::error("Failed to delete file: {$filePath} - " . $e->getMessage());
            return false;
        }
    }

    /**
     * Check if a file exists in the organization's storage.
     */
    public static function exists(Organization $org, string $filePath): bool
    {
        $disk = self::getDisk($org);
        $path = ltrim($filePath, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, 8);
        }

        return Storage::disk($disk)->exists($path);
    }

    /**
     * Get a temporary (pre-signed) URL for S3 files, or public URL for local files.
     */
    public static function getTemporaryUrl(Organization $org, string $filePath, int $expirationMinutes = 60): string
    {
        $disk = self::getDisk($org);
        $path = ltrim($filePath, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, 8);
        }

        if ($disk === 's3') {
            try {
                return Storage::disk('s3')->temporaryUrl($path, now()->addMinutes($expirationMinutes));
            } catch (\Exception $e) {
                Log::error("Failed to generate S3 temporary URL: {$path} - " . $e->getMessage());
                return '#';
            }
        }

        return Storage::disk('public')->url($path);
    }

    /**
     * Get the URL for accessing a file (public URL or temporary URL).
     */
    public static function getUrl(Organization $org, string $filePath): string
    {
        $disk = self::getDisk($org);
        $path = ltrim($filePath, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, 8);
        }

        if ($disk === 's3') {
            return self::getTemporaryUrl($org, $filePath);
        }

        return Storage::disk('public')->url($path);
    }

    /**
     * Get the raw content of a file (for downloads).
     */
    public static function get(Organization $org, string $filePath): ?string
    {
        $disk = self::getDisk($org);
        $path = ltrim($filePath, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, 8);
        }

        return Storage::disk($disk)->get($path);
    }

    /**
     * Get the size of a file in bytes.
     */
    public static function size(Organization $org, string $filePath): int
    {
        $disk = self::getDisk($org);
        $path = ltrim($filePath, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, 8);
        }

        return Storage::disk($disk)->size($path);
    }

    /**
     * Resolve a stored file path/URL to a viewable URL.
     *
     * - If stored value is already a full URL (pre-signed or external), return as-is.
     * - If stored value is a local path (/storage/...), return as-is.
     * - If org uses S3 and stored value is an S3 key path, generate fresh pre-signed URL.
     */
    public static function resolveUrl(Organization $org, string $storedUrl): string
    {
        if (empty($storedUrl)) return $storedUrl;

        if (preg_match('/^https?:\/\//i', $storedUrl)) {
            return $storedUrl;
        }

        if (str_starts_with($storedUrl, '/storage/')) {
            return $storedUrl;
        }

        if ($org->storage_driver === 's3' && $org->storage_s3_access_key && $org->storage_s3_secret_key) {
            return self::getTemporaryUrl($org, $storedUrl);
        }

        return $storedUrl;
    }

    /**
     * Resolve file URLs on a collection of file models in-place.
     */
    public static function resolveFileUrls($files, Organization $org): void
    {
        if (!$files || !$org) return;
        $files->each(function ($file) use ($org) {
            if (!empty($file->url)) {
                $file->url = self::resolveUrl($org, $file->url);
            }
            if (!empty($file->file_path)) {
                $file->file_path = self::resolveUrl($org, $file->file_path);
            }
        });
    }

    /**
     * Check if the org uses S3 storage.
     */
    public static function isS3(Organization $org): bool
    {
        return $org->storage_driver === 's3'
            && !empty($org->storage_s3_access_key)
            && !empty($org->storage_s3_secret_key);
    }
}
