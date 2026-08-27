<?php

namespace App\Services;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationStorageNotification;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use App\Mail\StorageAlertMail;
use App\Mail\StorageLimitChangedMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class StorageNotificationService
{
    /**
     * Check storage thresholds and create notifications as needed.
     * Called after every upload or storage change.
     */
    public static function checkAndNotify(Organization $org): array
    {
        $usage = StorageEnforcementService::getCurrentUsage($org->id);
        $percent = $usage['usage_percent'];
        $settings = $org->getStorageSettings();

        // Auto-dismiss stale notifications when storage drops below their threshold
        self::dismissStaleNotifications($org->id, $percent, $settings);

        $notifications = [];

        // Warn threshold (80% default)
        if ($percent >= $settings['warn_threshold'] && $percent < $settings['critical_threshold']) {
            $n = self::createIfNotExists(
                $org->id,
                'storage_warning',
                'warning',
                'Storage Warning',
                "Your storage is {$percent}% full ({$usage['used_gb']} GB / {$usage['max_storage_gb']} GB). " .
                "Consider cleaning up files or contacting admin to increase your limit.",
                ['usage_percent' => $percent, 'used_gb' => $usage['used_gb'], 'max_gb' => $usage['max_storage_gb']]
            );
            if ($n) $notifications[] = $n;
        }

        // Critical threshold (90% default)
        if ($percent >= $settings['critical_threshold'] && $percent < $settings['pin_threshold']) {
            $n = self::createIfNotExists(
                $org->id,
                'storage_critical',
                'critical',
                'Storage Critical',
                "Your storage is {$percent}% full ({$usage['used_gb']} GB / {$usage['max_storage_gb']} GB). " .
                "You are approaching your storage limit. Uploads may fail soon. Please free up space immediately.",
                ['usage_percent' => $percent, 'used_gb' => $usage['used_gb'], 'max_gb' => $usage['max_storage_gb']]
            );
            if ($n) $notifications[] = $n;

            // Send email at critical threshold
            self::sendStorageEmail($org, $percent, $usage, 'critical');
        }

        // Pin threshold (95% default) - pinned to header like Google
        if ($percent >= $settings['pin_threshold']) {
            $n = self::createIfNotExists(
                $org->id,
                'storage_pinned',
                'critical',
                'Storage Almost Full',
                "Your storage is {$percent}% full! Only " . round($usage['remaining_bytes'] / (1024 * 1024), 2) . " MB remaining. " .
                "New uploads will be blocked. Please delete files or contact admin immediately.",
                ['usage_percent' => $percent, 'used_gb' => $usage['used_gb'], 'max_gb' => $usage['max_storage_gb'], 'remaining_mb' => round($usage['remaining_bytes'] / (1024 * 1024), 2)]
            );
            if ($n) $notifications[] = $n;

            // Send email at pinned threshold (if not already sent for this level)
            self::sendStorageEmail($org, $percent, $usage, 'pinned');
        }

        // Storage limit reached
        if ($percent >= 100) {
            $n = self::createIfNotExists(
                $org->id,
                'storage_exceeded',
                'critical',
                'Storage Limit Reached',
                "Your storage limit has been reached ({$usage['max_storage_gb']} GB). All uploads are now blocked. " .
                "Please delete files or contact admin to increase your storage limit.",
                ['usage_percent' => $percent, 'used_gb' => $usage['used_gb'], 'max_gb' => $usage['max_storage_gb']]
            );
            if ($n) $notifications[] = $n;

            self::sendStorageEmail($org, $percent, $usage, 'exceeded');
        }

        return $notifications;
    }

    /**
     * Auto-dismiss notifications that are no longer applicable because storage dropped below threshold.
     */
    private static function dismissStaleNotifications(int $orgId, float $percent, array $settings): void
    {
        $typesToDismiss = [];

        if ($percent < $settings['pin_threshold']) {
            $typesToDismiss[] = 'storage_pinned';
        }
        if ($percent < $settings['critical_threshold']) {
            $typesToDismiss[] = 'storage_critical';
        }
        if ($percent < 100) {
            $typesToDismiss[] = 'storage_exceeded';
        }
        if ($percent < $settings['warn_threshold']) {
            $typesToDismiss[] = 'storage_warning';
        }

        if (!empty($typesToDismiss)) {
            OrganizationStorageNotification::on('mysql_master')
                ->where('organization_id', $orgId)
                ->whereIn('type', $typesToDismiss)
                ->where('is_dismissed', false)
                ->update(['is_dismissed' => true, 'dismissed_at' => now()]);
        }
    }

    /**
     * Create a notification if one of the same type isn't already active (not dismissed).
     */
    private static function createIfNotExists(
        int $orgId,
        string $type,
        string $severity,
        string $title,
        string $message,
        ?array $metadata = null
    ): ?OrganizationStorageNotification {
        $existing = OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('type', $type)
            ->where('is_dismissed', false)
            ->first();

        if ($existing) {
            // Update the existing notification with fresh data
            $existing->update(['message' => $message, 'metadata' => $metadata]);
            return null;
        }

        return OrganizationStorageNotification::on('mysql_master')->create([
            'organization_id' => $orgId,
            'type'            => $type,
            'severity'        => $severity,
            'title'           => $title,
            'message'         => $message,
            'metadata'        => $metadata,
        ]);
    }

    /**
     * Send email notification for storage alerts.
     */
    private static function sendStorageEmail(
        Organization $org,
        float $percent,
        array $usage,
        string $level
    ): void {
        // Check if we already sent an email for this level recently (within 24 hours)
        $recentEmail = OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('type', "storage_{$level}")
            ->where('email_sent', true)
            ->where('created_at', '>=', now()->subHours(24))
            ->exists();

        if ($recentEmail) return;

        try {
            $subscription = OrganizationSubscription::on('mysql_master')
                ->where('organization_id', $org->id)
                ->with('plan')
                ->latest()
                ->first();

            // Get org admin users
            $adminEmails = self::getOrgAdminEmails($org);
            if (empty($adminEmails)) return;

            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $superAdminTenant = config('app.super_admin_tenant', env('SUPER_ADMIN_TENANT', 'techxaro'));

            $mailable = new StorageAlertMail(
                orgName: $org->name,
                planName: $subscription?->plan?->name ?? 'Unknown',
                usagePercent: $percent,
                usedGb: $usage['used_gb'],
                maxGb: $usage['max_storage_gb'],
                remainingMb: round($usage['remaining_bytes'] / (1024 * 1024), 2),
                level: $level,
                frontendUrl: $frontendUrl,
                superAdminTenant: $superAdminTenant
            );

            foreach ($adminEmails as $email) {
                Mail::to($email)->queue($mailable);
            }

            // Mark email as sent
            OrganizationStorageNotification::on('mysql_master')
                ->where('organization_id', $org->id)
                ->where('type', "storage_{$level}")
                ->where('email_sent', false)
                ->update(['email_sent' => true]);

        } catch (\Exception $e) {
            Log::error("Storage email failed for org {$org->id}: " . $e->getMessage());
        }
    }

    /**
     * Get admin email addresses for an organization.
     * Uses the tenant database to query users with admin role.
     */
    private static function getOrgAdminEmails(Organization $org): array
    {
        try {
            $dbConfig = $org->getDatabaseConfig();

            $pdo = new \PDO(
                "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['database']};charset=utf8mb4",
                $dbConfig['username'],
                $dbConfig['password'],
                [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]
            );
            $stmt = $pdo->prepare("SELECT email FROM users WHERE role IN ('admin', 'manager') LIMIT 5");
            $stmt->execute();
            $emails = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            return array_filter($emails);

        } catch (\Exception $e) {
            Log::error("Failed to get admin emails for org {$org->id}: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Get active storage notifications for an org.
     */
    public static function getActiveNotifications(int $orgId): \Illuminate\Support\Collection
    {
        return OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('is_dismissed', false)
            ->orderByRaw("CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END")
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * Get pinned notifications (for header display).
     */
    public static function getPinnedNotifications(int $orgId): \Illuminate\Support\Collection
    {
        return OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('is_dismissed', false)
            ->whereIn('type', ['storage_pinned', 'storage_exceeded'])
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * Mark notification as read.
     */
    public static function markRead(int $orgId, int $notificationId): bool
    {
        $notif = OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('id', $notificationId)
            ->first();

        if (!$notif) return false;
        $notif->markRead();
        return true;
    }

    /**
     * Dismiss a notification.
     */
    public static function dismiss(int $orgId, int $notificationId): bool
    {
        $notif = OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('id', $notificationId)
            ->first();

        if (!$notif) return false;
        $notif->dismiss();
        return true;
    }

    /**
     * Dismiss all storage notifications for an org.
     */
    public static function dismissAll(int $orgId): int
    {
        return OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $orgId)
            ->where('is_dismissed', false)
            ->update(['is_dismissed' => true, 'dismissed_at' => now()]);
    }

    /**
     * Notify when super admin changes an org's storage limit.
     */
    public static function notifyLimitChanged(
        Organization $org,
        string $action,
        ?float $oldLimitGb,
        ?float $newLimitGb,
        ?string $adminName = null
    ): void {
        $title = $action === 'increased' ? 'Storage Limit Increased' : 'Storage Limit Decreased';
        $message = $action === 'increased'
            ? "Your storage limit has been increased from {$oldLimitGb} GB to {$newLimitGb} GB by " . ($adminName ?? 'System Administrator') . "."
            : "Your storage limit has been decreased from {$oldLimitGb} GB to {$newLimitGb} GB by " . ($adminName ?? 'System Administrator') . ".";

        OrganizationStorageNotification::on('mysql_master')->create([
            'organization_id' => $org->id,
            'type'            => 'storage_limit_changed',
            'severity'        => $action === 'decreased' ? 'critical' : 'info',
            'title'           => $title,
            'message'         => $message,
            'metadata'        => [
                'action'   => $action,
                'old_gb'   => $oldLimitGb,
                'new_gb'   => $newLimitGb,
                'admin'    => $adminName,
            ],
        ]);

        // Send email for limit changes
        try {
            $adminEmails = self::getOrgAdminEmails($org);
            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $superAdminTenant = config('app.super_admin_tenant', env('SUPER_ADMIN_TENANT', 'techxaro'));

            $mailable = new StorageLimitChangedMail(
                orgName: $org->name,
                action: $action,
                oldLimit: $oldLimitGb ?? 0,
                newLimit: $newLimitGb ?? 0,
                adminName: $adminName ?? 'System Administrator',
                frontendUrl: $frontendUrl,
                superAdminTenant: $superAdminTenant
            );

            foreach ($adminEmails as $email) {
                Mail::to($email)->queue($mailable);
            }
        } catch (\Exception $e) {
            Log::error("Storage limit change email failed for org {$org->id}: " . $e->getMessage());
        }
    }
}
