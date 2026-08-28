<?php

namespace App\Traits;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use App\Services\StorageNotificationService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

trait HasStorageEnforcement
{
    private function resolveOrgForStorage(Request $request): ?Organization
    {
        $org = $request->attributes->get('currentOrganization');
        if ($org) return $org;

        $tenantSlug = $request->header('X-Tenant-ID');
        if ($tenantSlug) {
            $org = Organization::on('mysql_master')->where('slug', $tenantSlug)->first();
            if ($org) return $org;
        }

        $dbName = DB::connection()->getDatabaseName();
        return Organization::on('mysql_master')->where('database_name', $dbName)->first();
    }

    private function checkStorageLimit(Request $request, UploadedFile $file): ?array
    {
        $org = $this->resolveOrgForStorage($request);
        if (!$org) return null;

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

        $maxBytes = OrganizationSubscription::convertToBytes($maxStorageGb, $storageUnit);

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->sum('file_size_bytes');

        $fileSize = $file->getSize();
        $remainingBytes = max(0, $maxBytes - $currentUsedBytes);

        if ($fileSize > $remainingBytes) {
            $divisors = ['KB' => 1024, 'MB' => 1024 * 1024, 'GB' => 1024 * 1024 * 1024];
            $divisor = $divisors[$storageUnit] ?? $divisors['GB'];

            $fileVal    = round($fileSize / $divisor, 2);
            $remainVal  = round($remainingBytes / $divisor, 2);
            $usedVal    = round($currentUsedBytes / $divisor, 2);
            $maxVal     = round($maxBytes / $divisor, 2);
            $usagePercent = $maxBytes > 0 ? round(($currentUsedBytes / $maxBytes) * 100, 1) : 0;

            return [
                'allowed' => false,
                'message' => "Upload blocked — storage limit reached. You need {$fileVal} {$storageUnit} but only {$remainVal} {$storageUnit} is remaining. " .
                             "Please delete some files or contact admin to increase your storage limit.",
                'remaining_bytes' => $remainingBytes,
                'storage_unit'    => $storageUnit,
            ];
        }

        return null;
    }

    private function trackFileUpload(
        Request $request,
        string $category,
        string $filePath,
        string $fileName,
        ?string $mimeType,
        int $fileSizeBytes
    ): ?array {
        $org = $this->resolveOrgForStorage($request);
        if (!$org) return null;

        OrganizationStorageUsage::on('mysql_master')->create([
            'organization_id'  => $org->id,
            'category'         => $category,
            'file_path'        => $filePath,
            'file_name'        => $fileName,
            'mime_type'        => $mimeType,
            'file_size_bytes'  => $fileSizeBytes,
            'uploaded_by_name' => $request->user()?->name,
            'uploaded_by_id'   => $request->user()?->id,
        ]);

        // Check thresholds and create notifications
        $notifications = StorageNotificationService::checkAndNotify($org);

        // Return usage info so controller can include it in response
        $usage = \App\Services\StorageEnforcementService::getCurrentUsage($org->id);
        return [
            'usage'         => $usage,
            'notifications' => $notifications,
        ];
    }

    private function buildFileSkippedMessage(string $entityType): string
    {
        return "Your {$entityType} was created successfully, but the attached file could not be uploaded because your storage limit has been reached. Please delete some files or contact admin to increase your storage limit.";
    }
}
