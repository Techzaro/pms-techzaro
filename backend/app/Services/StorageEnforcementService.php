<?php

namespace App\Services;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class StorageEnforcementService
{
    public static function checkBeforeUpload(
        int $orgId,
        int $fileSizeBytes,
        ?UploadedFile $file = null
    ): array {
        $actualSize = $file ? $file->getSize() : $fileSizeBytes;

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $orgId)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;
        $maxBytes = (int) ($maxStorageGb * 1024 * 1024 * 1024);

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $orgId)
            ->sum('file_size_bytes');

        $remainingBytes = $maxBytes - $currentUsedBytes;

        if ($actualSize > $remainingBytes) {
            $remainingMb = round($remainingBytes / (1024 * 1024), 2);
            $fileMb = round($actualSize / (1024 * 1024), 2);
            $maxMb = round($maxBytes / (1024 * 1024), 2);
            $usedMb = round($currentUsedBytes / (1024 * 1024), 2);

            return [
                'allowed'   => false,
                'message'   => "Storage limit exceeded. You need {$fileMb} MB but only {$remainingMb} MB is remaining. " .
                               "Current usage: {$usedMb} MB / {$maxMb} MB. " .
                               "Please delete some files or contact admin to increase your storage limit.",
                'remaining_bytes' => $remainingBytes,
                'max_bytes'       => $maxBytes,
                'used_bytes'      => $currentUsedBytes,
            ];
        }

        $usagePercent = $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0;
        $warning = $usagePercent >= 80;

        return [
            'allowed'         => true,
            'warning'         => $warning,
            'usage_percent'   => $usagePercent,
            'remaining_bytes' => $remainingBytes,
            'remaining_mb'    => round($remainingBytes / (1024 * 1024), 2),
            'message'         => $warning
                ? "Warning: Storage is {$usagePercent}% full. Consider cleaning up old files."
                : null,
        ];
    }

    public static function trackUpload(
        int $orgId,
        string $category,
        string $filePath,
        string $fileName,
        ?string $mimeType,
        int $fileSizeBytes,
        ?int $userId = null,
        ?string $userName = null
    ): ?OrganizationStorageUsage {
        return OrganizationStorageUsage::on('mysql_master')->create([
            'organization_id'  => $orgId,
            'category'         => $category,
            'file_path'        => $filePath,
            'file_name'        => $fileName,
            'mime_type'        => $mimeType,
            'file_size_bytes'  => $fileSizeBytes,
            'uploaded_by_name' => $userName,
            'uploaded_by_id'   => $userId,
        ]);
    }

    public static function getCurrentUsage(int $orgId): array
    {
        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $orgId)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;
        $maxBytes = (int) ($maxStorageGb * 1024 * 1024 * 1024);

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $orgId)
            ->sum('file_size_bytes');

        return [
            'max_bytes'       => $maxBytes,
            'used_bytes'      => $currentUsedBytes,
            'remaining_bytes' => max(0, $maxBytes - $currentUsedBytes),
            'usage_percent'   => $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0,
            'max_storage_gb'  => $maxStorageGb,
            'used_gb'         => round($currentUsedBytes / (1024 * 1024 * 1024), 4),
        ];
    }
}
