<?php

namespace App\Services;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Centralized file storage service.
 * Handles upload, delete, cleanup, and quota enforcement.
 * All file operations MUST go through this service.
 */
class StorageFileService
{
    /**
     * Upload a file with full quota enforcement, tracking, and notification.
     * Returns upload result or throws/returns error.
     */
    public static function upload(
        Organization $org,
        UploadedFile $file,
        string $category,
        ?string $customName = null,
        ?int $userId = null,
        ?string $userName = null
    ): array {
        // 1. Check quota
        $check = self::checkQuota($org, $file->getSize());
        if (!$check['allowed']) {
            // If auto_delete is enabled, try to free space
            if ($org->storage_auto_delete) {
                $freed = self::autoDeleteOldest($org, $file->getSize());
                if ($freed > 0) {
                    // Re-check after cleanup
                    $check = self::checkQuota($org, $file->getSize());
                }
            }

            // If still not allowed and overwrite is enabled, try to overwrite oldest
            if (!$check['allowed'] && $org->storage_overwrite) {
                $freed = self::overwriteOldest($org, $file->getSize());
                if ($freed > 0) {
                    $check = self::checkQuota($org, $file->getSize());
                }
            }

            if (!$check['allowed']) {
                return $check;
            }
        }

        // 2. Store the file
        $fileName = $customName ?: $file->getClientOriginalName();
        $storedPath = StorageDiskResolver::store($org, $file, $category, $fileName);

        // 3. Track in database
        $usage = OrganizationStorageUsage::on('mysql_master')->create([
            'organization_id'  => $org->id,
            'category'         => $category,
            'file_path'        => '/' . $storedPath,
            'file_name'        => $fileName,
            'mime_type'        => $file->getMimeType(),
            'file_size_bytes'  => $file->getSize(),
            'uploaded_by_name' => $userName,
            'uploaded_by_id'   => $userId,
        ]);

        // 4. Invalidate usage cache
        self::invalidateCache($org->id);

        // 5. Check thresholds and notify
        $notifications = StorageNotificationService::checkAndNotify($org);

        // 6. Return fresh usage stats
        $freshUsage = self::getCurrentUsage($org);

        return [
            'allowed'       => true,
            'usage'         => $freshUsage,
            'record'        => $usage,
            'notifications' => $notifications,
        ];
    }

    /**
     * Delete a file record AND the physical file from disk/S3.
     * Also removes the corresponding project_files record from the tenant DB.
     */
    public static function deleteFile(Organization $org, int $recordId): bool
    {
        $record = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('id', $recordId)
            ->first();

        if (!$record) return false;

        // Delete physical file (non-fatal if it fails)
        try {
            StorageDiskResolver::delete($org, $record->file_path);
        } catch (\Throwable $e) {
            Log::warning("Physical file delete failed for '{$record->file_path}': " . $e->getMessage());
        }

        // Remove tenant DB references (non-fatal if it fails)
        self::removeProjectFileReference($org, $record->file_path, $record->file_name);

        // Always delete the storage record
        $record->delete();

        // Invalidate cache
        self::invalidateCache($org->id);

        return true;
    }

    /**
     * Remove file records that reference the given file path from the tenant DB.
     * Cleans up project_files, task_files, deliverable_files, and submission_attachments tables.
     * Tries all possible path format variants plus filename matching as fallback.
     */
    private static function removeProjectFileReference(Organization $org, string $filePath, ?string $fileName = null): void
    {
        try {
            $connectionName = 'tenant_' . $org->id;

            config()->set("database.connections.{$connectionName}", $org->getDatabaseConfig());
            DB::purge($connectionName);
            DB::reconnect($connectionName);

            $tenantDb = DB::connection($connectionName);

            $normalized = ltrim($filePath, '/');
            $withoutStorage = preg_replace('#^storage/#', '', $normalized);

            // All possible path variants stored in DB columns
            $variants = array_unique([
                $filePath,
                '/' . $normalized,
                $normalized,
                '/' . $withoutStorage,
                $withoutStorage,
                '/storage/' . $withoutStorage,
                'storage/' . $withoutStorage,
            ]);

            foreach (['project_files', 'task_files', 'deliverable_files', 'submission_attachments'] as $table) {
                if ($tenantDb->getSchemaBuilder()->hasTable($table)) {
                    $urlColumn = $tenantDb->getSchemaBuilder()->hasColumn($table, 'url') ? 'url' : 'file_path';
                    $hasNameColumn = $tenantDb->getSchemaBuilder()->hasColumn($table, 'name');

                    // Build query: match by path variants OR by filename as fallback
                    $deleted = $tenantDb->table($table)
                        ->where(function ($q) use ($urlColumn, $variants) {
                            $first = true;
                            foreach ($variants as $v) {
                                if ($first) {
                                    $q->where($urlColumn, $v);
                                    $first = false;
                                } else {
                                    $q->orWhere($urlColumn, $v);
                                }
                            }
                        })
                        ->delete();

                    // If no path match found and we have a filename, try matching by name
                    if ($deleted === 0 && $hasNameColumn && $fileName) {
                        $tenantDb->table($table)
                            ->where('name', $fileName)
                            ->delete();
                    }
                }
            }

            DB::purge($connectionName);
        } catch (\Throwable $e) {
            Log::warning("Failed to remove file reference for path '{$filePath}': " . $e->getMessage());
        }
    }

    /**
     * Bulk delete old files AND their physical files.
     */
    public static function deleteOldFiles(Organization $org, int $months): array
    {
        $cutoff = now()->subMonths($months);
        $records = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', $cutoff)
            ->get();

        $deletedCount = 0;
        $freedBytes = 0;

            foreach ($records as $record) {
            StorageDiskResolver::delete($org, $record->file_path);
            self::removeProjectFileReference($org, $record->file_path, $record->file_name);
            $freedBytes += $record->file_size_bytes;
            $record->delete();
            $deletedCount++;
        }

        self::invalidateCache($org->id);

        return [
            'deleted_count' => $deletedCount,
            'freed_bytes'   => $freedBytes,
            'freed_mb'      => round($freedBytes / (1024 * 1024), 2),
        ];
    }

    /**
     * Bulk delete large files AND their physical files.
     */
    public static function deleteLargeFiles(Organization $org, float $minSizeGb): array
    {
        $minBytes = (int) ($minSizeGb * 1024 * 1024 * 1024);
        $records = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', $minBytes)
            ->get();

        $deletedCount = 0;
        $freedBytes = 0;

        foreach ($records as $record) {
            StorageDiskResolver::delete($org, $record->file_path);
            self::removeProjectFileReference($org, $record->file_path, $record->file_name);
            $freedBytes += $record->file_size_bytes;
            $record->delete();
            $deletedCount++;
        }

        self::invalidateCache($org->id);

        return [
            'deleted_count' => $deletedCount,
            'freed_bytes'   => $freedBytes,
            'freed_mb'      => round($freedBytes / (1024 * 1024), 2),
        ];
    }

    /**
     * Auto-delete oldest files to free up space (when auto_delete is enabled).
     * Returns bytes freed.
     */
    public static function autoDeleteOldest(Organization $org, int $neededBytes): int
    {
        $freed = 0;
        $remaining = $neededBytes;

        // Get oldest files first
        $oldestFiles = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->orderBy('created_at', 'asc')
            ->limit(50)
            ->get();

        foreach ($oldestFiles as $record) {
            if ($freed >= $remaining) break;

            StorageDiskResolver::delete($org, $record->file_path);
            self::removeProjectFileReference($org, $record->file_path, $record->file_name);
            $freed += $record->file_size_bytes;
            $record->delete();
        }

        if ($freed > 0) {
            self::invalidateCache($org->id);
            Log::info("Auto-deleted oldest files for org {$org->id}: freed " . round($freed / (1024 * 1024), 2) . " MB");
        }

        return $freed;
    }

    /**
     * Overwrite oldest files (when overwrite is enabled).
     * In practice, this means deleting the oldest file to make room.
     * Returns bytes freed.
     */
    public static function overwriteOldest(Organization $org, int $neededBytes): int
    {
        // Overwrite = delete the oldest single file that's smaller than needed
        $oldestFile = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->orderBy('created_at', 'asc')
            ->first();

        if (!$oldestFile) return 0;

        $freed = $oldestFile->file_size_bytes;
        StorageDiskResolver::delete($org, $oldestFile->file_path);
        self::removeProjectFileReference($org, $oldestFile->file_path, $oldestFile->file_name);
        $oldestFile->delete();

        self::invalidateCache($org->id);
        Log::info("Overwrote oldest file for org {$org->id}: freed " . round($freed / (1024 * 1024), 2) . " MB");

        return $freed;
    }

    /**
     * Check if an upload is allowed within quota.
     */
    public static function checkQuota(Organization $org, int $fileSizeBytes): array
    {
        $usage = self::getCurrentUsage($org);
        $remainingBytes = $usage['remaining_bytes'];

        if ($fileSizeBytes > $remainingBytes) {
            $fileMb = round($fileSizeBytes / (1024 * 1024), 2);
            $remainingMb = round(max(0, $remainingBytes) / (1024 * 1024), 2);
            $usedMb = round($usage['used_bytes'] / (1024 * 1024), 2);
            $maxMb = round($usage['max_bytes'] / (1024 * 1024), 2);

            return [
                'allowed'         => false,
                'usage_percent'   => $usage['usage_percent'],
                'remaining_bytes' => $remainingBytes,
                'remaining_mb'    => $remainingMb,
                'used_bytes'      => $usage['used_bytes'],
                'max_bytes'       => $usage['max_bytes'],
                'message'         => "Storage limit exceeded. You need {$fileMb} MB but only {$remainingMb} MB remaining. " .
                                    "Current usage: {$usedMb} MB / {$maxMb} MB. " .
                                    "Please delete some files or contact admin to increase your storage limit.",
            ];
        }

        return [
            'allowed'         => true,
            'usage_percent'   => $usage['usage_percent'],
            'remaining_bytes' => $remainingBytes,
            'remaining_mb'    => round($remainingBytes / (1024 * 1024), 2),
        ];
    }

    /**
     * Get current storage usage for an org (with caching).
     */
    public static function getCurrentUsage(Organization $org): array
    {
        $cacheKey = "storage_usage_{$org->id}";

        return cache()->remember($cacheKey, 300, function () use ($org) {
            $subscription = OrganizationSubscription::on('mysql_master')
                ->where('organization_id', $org->id)
                ->with('plan')
                ->latest()
                ->first();

            $maxStorageGb = $subscription?->getEffectiveMaxStorageValue() ?? 10;
            $storageUnit = $subscription?->getEffectiveStorageUnit() ?? 'GB';

            // Org-level storage override (highest priority)
            if ($org->custom_max_storage_gb !== null) {
                $maxStorageGb = $org->custom_max_storage_gb;
                $storageUnit = $org->storage_unit ?? $storageUnit;
            }

            $maxBytes = \App\Models\Master\OrganizationSubscription::convertToBytes($maxStorageGb, $storageUnit);

            $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
                ->where('organization_id', $org->id)
                ->sum('file_size_bytes');

            $remainingBytes = max(0, $maxBytes - $currentUsedBytes);

            return [
                'max_bytes'       => $maxBytes,
                'used_bytes'      => (int) $currentUsedBytes,
                'remaining_bytes' => $remainingBytes,
                'usage_percent'   => $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0,
                'max_storage_gb'  => $maxStorageGb,
                'storage_unit'    => $storageUnit,
                'used_gb'         => round($currentUsedBytes / (1024 * 1024 * 1024), 4),
                'remaining_gb'    => round($remainingBytes / (1024 * 1024 * 1024), 4),
            ];
        });
    }

    /**
     * Invalidate usage cache for an org.
     */
    public static function invalidateCache(int $orgId): void
    {
        cache()->forget("storage_usage_{$orgId}");
    }

    /**
     * Get the download URL for a file (handles S3 pre-signed URLs).
     */
    public static function getDownloadUrl(Organization $org, string $filePath): string
    {
        return StorageDiskResolver::getTemporaryUrl($org, $filePath, 60);
    }

    /**
     * Get the access URL for a file.
     */
    public static function getFileUrl(Organization $org, string $filePath): string
    {
        return StorageDiskResolver::getUrl($org, $filePath);
    }
}
