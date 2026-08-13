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

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;
        $maxBytes = (int) ($maxStorageGb * 1024 * 1024 * 1024);

        $currentUsedBytes = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->sum('file_size_bytes');

        $fileSize = $file->getSize();
        $remainingBytes = $maxBytes - $currentUsedBytes;

        if ($fileSize > $remainingBytes) {
            $fileMb = round($fileSize / (1024 * 1024), 2);
            $remainingMb = round(max(0, $remainingBytes) / (1024 * 1024), 2);
            $usedMb = round($currentUsedBytes / (1024 * 1024), 2);
            $maxMb = round($maxBytes / (1024 * 1024), 2);

            return [
                'allowed' => false,
                'message' => "Storage limit exceeded. You need {$fileMb} MB but only {$remainingMb} MB remaining. " .
                             "Current usage: {$usedMb} MB / {$maxMb} MB. " .
                             "Please delete some files or contact admin to increase your storage limit.",
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
}
