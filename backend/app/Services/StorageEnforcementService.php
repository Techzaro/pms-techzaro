<?php

namespace App\Services;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class StorageEnforcementService
{
    private static function resolveEffectiveStorage(int $orgId): array
    {
        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $orgId)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageValue() ?? 10;
        $storageUnit = $subscription?->getEffectiveStorageUnit() ?? 'GB';

        // Org-level storage override (highest priority)
        $org = Organization::on('mysql_master')->find($orgId);
        if ($org && $org->custom_max_storage_gb !== null) {
            $maxStorageGb = $org->custom_max_storage_gb;
            $storageUnit = $org->storage_unit ?? $storageUnit;
        }

        $maxBytes = OrganizationSubscription::convertToBytes($maxStorageGb, $storageUnit);

        return [
            'max_storage_gb' => $maxStorageGb,
            'storage_unit'   => $storageUnit,
            'max_bytes'      => $maxBytes,
        ];
    }

    public static function checkBeforeUpload(
        int $orgId,
        int $fileSizeBytes,
        ?UploadedFile $file = null
    ): array {
        $actualSize = $file ? $file->getSize() : $fileSizeBytes;

        $storage = self::resolveEffectiveStorage($orgId);
        $maxBytes = $storage['max_bytes'];
        $unit = $storage['storage_unit'];
        $maxVal = $storage['max_storage_gb'];

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $orgId)
            ->sum('file_size_bytes');

        $remainingBytes = max(0, $maxBytes - $currentUsedBytes);

        $divisors = ['KB' => 1024, 'MB' => 1024 * 1024, 'GB' => 1024 * 1024 * 1024];
        $divisor = $divisors[$unit] ?? $divisors['GB'];

        $fileVal  = round($actualSize / $divisor, 2);
        $remainVal = round($remainingBytes / $divisor, 2);
        $usedVal  = round($currentUsedBytes / $divisor, 2);

        if ($actualSize > $remainingBytes) {
            $usagePercent = $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0;

            return [
                'allowed'   => false,
                'message'   => "Upload blocked — storage limit reached. You need {$fileVal} {$unit} but only {$remainVal} {$unit} is remaining " .
                               "({$usedVal} {$unit} used of {$maxVal} {$unit}, {$usagePercent}% full). " .
                               "Please delete some files or contact admin to increase your storage limit.",
                'remaining_bytes' => $remainingBytes,
                'max_bytes'       => $maxBytes,
                'used_bytes'      => $currentUsedBytes,
                'storage_unit'    => $unit,
                'usage_percent'   => $usagePercent,
            ];
        }

        $usagePercent = $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0;
        $warning = $usagePercent >= 80;

        return [
            'allowed'         => true,
            'warning'         => $warning,
            'usage_percent'   => $usagePercent,
            'remaining_bytes' => $remainingBytes,
            'remaining_value' => $remainVal,
            'storage_unit'    => $unit,
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
        $storage = self::resolveEffectiveStorage($orgId);
        $maxBytes = $storage['max_bytes'];
        $unit = $storage['storage_unit'];

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $orgId)
            ->sum('file_size_bytes');

        $divisors = ['KB' => 1024, 'MB' => 1024 * 1024, 'GB' => 1024 * 1024 * 1024];
        $divisor = $divisors[$unit] ?? $divisors['GB'];

        return [
            'max_bytes'       => $maxBytes,
            'used_bytes'      => $currentUsedBytes,
            'remaining_bytes' => max(0, $maxBytes - $currentUsedBytes),
            'usage_percent'   => $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0,
            'max_storage_gb'  => $storage['max_storage_gb'],
            'storage_unit'    => $unit,
            'used_value'      => round($currentUsedBytes / $divisor, 4),
            'max_value'       => $storage['max_storage_gb'],
            'remaining_value' => round(max(0, $maxBytes - $currentUsedBytes) / $divisor, 4),
        ];
    }
}
