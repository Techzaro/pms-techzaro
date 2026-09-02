<?php

namespace App\Services\Sharing;

use App\Models\SharingNotification;
use App\Models\Master\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SharingNotificationService
 *
 * Handles all notifications related to sharing activities.
 */
class SharingNotificationService
{
    /**
     * Send a sharing notification.
     */
    public function notify(
        int $organizationId,
        string $type,
        string $title,
        ?string $message = null,
        ?int $userId = null,
        ?int $fromOrganizationId = null,
        ?array $data = null
    ): SharingNotification {
        return SharingNotification::create([
            'organization_id'      => $organizationId,
            'user_id'              => $userId,
            'from_organization_id' => $fromOrganizationId,
            'type'                 => $type,
            'title'                => $title,
            'message'              => $message,
            'data'                 => $data,
            'is_read'              => false,
        ]);
    }

    /**
     * Notify all admins of an organization.
     * This correctly queries the target org's tenant DB, not the current request's DB.
     */
    public function notifyAdmins(
        int $organizationId,
        string $type,
        string $title,
        ?string $message = null,
        ?int $fromOrganizationId = null,
        ?array $data = null
    ): void {
        $org = Organization::find($organizationId);
        if (!$org || !$org->database_name) return;

        $dbName = $org->database_name;
        $currentConnection = DB::getDefaultConnection();

        try {
            // Switch to the target org's tenant DB to find admin users
            $dbConfig = config("database.connections.tenant_template");
            if (!$dbConfig) return;

            $tenantConfig = [
                'driver'    => $dbConfig['driver'] ?? 'mysql',
                'host'      => $org->database_host ?? $dbConfig['host'] ?? '127.0.0.1',
                'port'      => $org->database_port ?? $dbConfig['port'] ?? 3306,
                'database'  => $dbName,
                'username'  => $org->database_username ?? $dbConfig['username'] ?? 'root',
                'password'  => $org->database_password ?? $dbConfig['password'] ?? '',
                'charset'   => $dbConfig['charset'] ?? 'utf8mb4',
                'collation' => $dbConfig['collation'] ?? 'utf8mb4_unicode_ci',
                'prefix'    => '',
            ];

            DB::addConnection($tenantConfig, 'notification_target');
            DB::setDefaultConnection('notification_target');

            $admins = User::whereIn('role', ['admin', 'manager'])->pluck('id');

            foreach ($admins as $adminId) {
                $this->notify(
                    organizationId: $organizationId,
                    type: $type,
                    title: $title,
                    message: $message,
                    userId: $adminId,
                    fromOrganizationId: $fromOrganizationId,
                    data: $data
                );
            }
        } catch (\Exception $e) {
            Log::error("Failed to notify admins for org {$organizationId}: " . $e->getMessage());
        } finally {
            DB::purge('notification_target');
            DB::setDefaultConnection($currentConnection);
        }
    }

    /**
     * Get notifications for a user.
     */
    public function getForUser(int $userId, bool $unreadOnly = false, int $limit = 25): \Illuminate\Database\Eloquent\Collection
    {
        $query = SharingNotification::forUser($userId)->latest();

        if ($unreadOnly) {
            $query->unread();
        }

        return $query->limit($limit)->get();
    }

    /**
     * Get unread count for a user.
     */
    public function getUnreadCount(int $userId): int
    {
        return SharingNotification::forUser($userId)->unread()->count();
    }

    /**
     * Mark a notification as read.
     */
    public function markAsRead(int $notificationId, int $userId): void
    {
        $notification = SharingNotification::where('id', $notificationId)
            ->where(function ($q) use ($userId) {
                $q->where('user_id', $userId)->orWhereNull('user_id');
            })->first();

        if ($notification) {
            $notification->markAsRead();
        }
    }

    /**
     * Mark all notifications as read for a user.
     */
    public function markAllAsRead(int $userId): void
    {
        SharingNotification::forUser($userId)
            ->unread()
            ->update(['is_read' => true, 'read_at' => now()]);
    }

    /*
    |------------------------------------------------------------------
    | Convenience Methods
    |------------------------------------------------------------------
    */

    public function connectionRequestReceived(int $orgId, int $fromOrgId, array $data = []): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'connection_request',
            title: 'New Connection Request',
            message: "{$fromOrg->name} wants to connect with your organization.",
            fromOrganizationId: $fromOrgId,
            data: $data
        );
    }

    public function connectionApproved(int $orgId, int $fromOrgId, array $data = []): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'connection_approved',
            title: 'Connection Approved',
            message: "{$fromOrg->name} approved your connection request.",
            fromOrganizationId: $fromOrgId,
            data: $data
        );
    }

    public function connectionRejected(int $orgId, int $fromOrgId, array $data = []): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'connection_rejected',
            title: 'Connection Rejected',
            message: "{$fromOrg->name} rejected your connection request.",
            fromOrganizationId: $fromOrgId,
            data: $data
        );
    }

    public function resourceShared(int $orgId, int $fromOrgId, string $resourceType, int $resourceId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'resource_shared',
            title: 'New Resource Shared',
            message: "{$fromOrg->name} shared a {$resourceType} with your organization.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function permissionChanged(int $orgId, int $fromOrgId, string $resourceType, int $resourceId, string $oldPermission, string $newPermission): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'permission_changed',
            title: 'Permission Changed',
            message: "{$fromOrg->name} changed your {$resourceType} permission from {$oldPermission} to {$newPermission}.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId, 'old_permission' => $oldPermission, 'new_permission' => $newPermission]
        );
    }

    public function accessRevoked(int $orgId, int $fromOrgId, string $resourceType, int $resourceId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_revoked',
            title: 'Access Revoked',
            message: "{$fromOrg->name} revoked access to a {$resourceType}.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function accessRequested(int $orgId, int $fromOrgId, string $resourceType, int $resourceId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_requested',
            title: 'Access Requested',
            message: "{$fromOrg->name} is requesting access to a {$resourceType}.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function accessApproved(int $orgId, int $fromOrgId, string $resourceType, int $resourceId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_approved',
            title: 'Access Approved',
            message: "{$fromOrg->name} approved access to a {$resourceType}.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function accessRejected(int $orgId, int $fromOrgId, string $resourceType, int $resourceId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_rejected',
            title: 'Access Rejected',
            message: "{$fromOrg->name} rejected access to a {$resourceType}.",
            fromOrganizationId: $fromOrgId,
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function accessExpiring(int $orgId, string $resourceType, int $resourceId, int $daysLeft): void
    {
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_expiring',
            title: 'Access Expiring Soon',
            message: "Access to a shared {$resourceType} expires in {$daysLeft} days.",
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId, 'days_left' => $daysLeft]
        );
    }

    public function accessExpired(int $orgId, string $resourceType, int $resourceId): void
    {
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'access_expired',
            title: 'Access Expired',
            message: "Access to a shared {$resourceType} has expired.",
            data: ['resource_type' => $resourceType, 'resource_id' => $resourceId]
        );
    }

    public function organizationDisconnected(int $orgId, int $fromOrgId): void
    {
        $fromOrg = Organization::find($fromOrgId);
        $this->notifyAdmins(
            organizationId: $orgId,
            type: 'organization_disconnected',
            title: 'Organization Disconnected',
            message: "{$fromOrg->name} has disconnected from your organization.",
            fromOrganizationId: $fromOrgId
        );
    }
}
