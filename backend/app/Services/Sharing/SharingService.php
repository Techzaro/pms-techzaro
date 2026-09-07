<?php

namespace App\Services\Sharing;

use App\Models\Master\OrganizationConnection;
use App\Models\Master\Organization;
use App\Models\SharedResource;
use App\Models\SharedResourceUser;
use App\Models\SharedResourceActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\Event;
use App\Models\KnowledgeBase;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * SharingService
 *
 * Manages resource sharing between connected organizations.
 * Handles sharing, unsharing, permission management, and access control.
 */
class SharingService
{
    public function __construct(
        private SharingNotificationService $notificationService
    ) {}

    /**
     * Share a resource with a connected organization.
     */
    public function shareResource(
        OrganizationConnection $connection,
        string $resourceType,
        int $resourceId,
        int $sharedByOrgId,
        int $sharedWithOrgId,
        int $userId,
        string $permission = 'view',
        bool $canDownload = false,
        ?string $notes = null,
        ?string $expiresAt = null,
        ?array $userIds = null,
        ?string $resourceName = null
    ): SharedResource {
        // Validate connection is active
        if (!$connection->isActive()) {
            throw new \RuntimeException('Cannot share resources. The connection is not active.');
        }

        // Validate org IDs match the connection
        $validOrgIds = [$connection->requesting_organization_id, $connection->receiving_organization_id];
        if (!in_array($sharedByOrgId, $validOrgIds) || !in_array($sharedWithOrgId, $validOrgIds)) {
            throw new \RuntimeException('Organization IDs do not match the connection.');
        }

        // Validate permission
        if (!in_array($permission, ['view', 'comment', 'collaborate'])) {
            throw new \RuntimeException('Invalid permission level.');
        }

        // Validate resource exists
        $this->validateResourceExists($resourceType, $resourceId);

        // Check for existing share (including revoked ones for re-sharing)
        $existing = SharedResource::where('connection_id', $connection->id)
            ->where('resource_type', $resourceType)
            ->where('resource_id', $resourceId)
            ->where('status', 'active')
            ->first();

        if ($existing) {
            throw new \RuntimeException('This resource is already shared with this organization.');
        }

        $sharedResource = null;

        DB::beginTransaction();
        try {
            $sharedResource = SharedResource::create([
                'connection_id'               => $connection->id,
                'shared_by_organization_id'   => $sharedByOrgId,
                'shared_with_organization_id' => $sharedWithOrgId,
                'resource_type'               => $resourceType,
                'resource_id'                 => $resourceId,
                'resource_name'               => $resourceName,
                'permission'                  => $permission,
                'can_download'                => $canDownload,
                'status'                      => 'active',
                'shared_by_user_id'           => $userId,
                'notes'                       => $notes,
                'shared_at'                   => now(),
                'expires_at'                  => $expiresAt,
            ]);

            // Add specific users if provided
            if ($userIds && count($userIds) > 0) {
                foreach ($userIds as $uid) {
                    SharedResourceUser::create([
                        'shared_resource_id'  => $sharedResource->id,
                        'user_id'             => $uid,
                        'status'              => 'active',
                        'granted_at'          => now(),
                        'granted_by_user_id'  => $userId,
                    ]);
                }
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }

        // Mirror record in receiver's tenant DB (outside transaction since it's a different DB)
        $this->mirrorToReceiverDb($sharedResource, $sharedWithOrgId);

        // Log activity
        $this->logActivity(
            connectionId: $connection->id,
            sharedResourceId: $sharedResource->id,
            organizationId: $sharedByOrgId,
            userId: $userId,
            action: 'shared',
            resourceType: $resourceType,
            resourceId: $resourceId,
            details: ['permission' => $permission, 'can_download' => $canDownload]
        );

        // If sharing a project, cascade to all child resources (tasks, events, knowledge bases)
        if ($resourceType === 'project') {
            $this->shareProjectChildren(
                projectResourceId: $resourceId,
                parentSharedResource: $sharedResource,
                connection: $connection,
                sharedByOrgId: $sharedByOrgId,
                sharedWithOrgId: $sharedWithOrgId,
                userId: $userId,
                permission: $permission,
                canDownload: $canDownload,
                expiresAt: $expiresAt
            );
        }

        // Notify the receiving organization
        $this->notificationService->resourceShared(
            orgId: $sharedWithOrgId,
            fromOrgId: $sharedByOrgId,
            resourceType: $resourceType,
            resourceId: $resourceId
        );

        return $sharedResource;
    }

    /**
     * Update sharing permission for a resource.
     */
    public function updatePermission(
        SharedResource $sharedResource,
        string $newPermission,
        bool $canDownload,
        int $userId,
        int $organizationId
    ): SharedResource {
        $oldPermission = $sharedResource->permission;

        if (!in_array($newPermission, ['view', 'comment', 'collaborate'])) {
            throw new \RuntimeException('Invalid permission level.');
        }

        DB::beginTransaction();
        try {
            $sharedResource->update([
                'permission'   => $newPermission,
                'can_download' => $canDownload,
            ]);

            // If updating a project, cascade permission to all child resources
            if ($sharedResource->resource_type === 'project') {
                $this->updateProjectChildrenPermissions(
                    parentSharedResource: $sharedResource,
                    newPermission: $newPermission,
                    canDownload: $canDownload
                );
            }

            $this->logActivity(
                connectionId: $sharedResource->connection_id,
                sharedResourceId: $sharedResource->id,
                organizationId: $organizationId,
                userId: $userId,
                action: 'permission_changed',
                resourceType: $sharedResource->resource_type,
                resourceId: $sharedResource->resource_id,
                oldPermission: $oldPermission,
                newPermission: $newPermission,
                details: ['can_download' => $canDownload]
            );

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }

        // Update mirror in receiver's tenant DB
        $this->updateMirrorInReceiverDb($sharedResource);

        // Notify the receiving organization
        $this->notificationService->permissionChanged(
            orgId: $sharedResource->shared_with_organization_id,
            fromOrgId: $organizationId,
            resourceType: $sharedResource->resource_type,
            resourceId: $sharedResource->resource_id,
            oldPermission: $oldPermission,
            newPermission: $newPermission
        );

        return $sharedResource->fresh();
    }

    /**
     * Revoke access to a shared resource.
     */
    public function revokeAccess(
        SharedResource $sharedResource,
        int $userId,
        int $organizationId
    ): SharedResource {
        DB::beginTransaction();
        try {
            $sharedResource->update([
                'status'     => 'revoked',
                'revoked_at' => now(),
            ]);

            // Also revoke all user-level access
            SharedResourceUser::where('shared_resource_id', $sharedResource->id)
                ->where('status', 'active')
                ->update(['status' => 'revoked']);

            // If revoking a project, cascade revoke all child resources
            if ($sharedResource->resource_type === 'project') {
                $this->revokeProjectChildren(
                    parentSharedResource: $sharedResource,
                    userId: $userId,
                    organizationId: $organizationId
                );
            }

            $this->logActivity(
                connectionId: $sharedResource->connection_id,
                sharedResourceId: $sharedResource->id,
                organizationId: $organizationId,
                userId: $userId,
                action: 'unshared',
                resourceType: $sharedResource->resource_type,
                resourceId: $sharedResource->resource_id,
                details: ['previous_permission' => $sharedResource->permission]
            );

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }

        // Remove mirror from receiver's tenant DB (outside transaction)
        $this->removeMirrorFromReceiverDb($sharedResource);

        // Notify the receiving organization
        $this->notificationService->accessRevoked(
            orgId: $sharedResource->shared_with_organization_id,
            fromOrgId: $organizationId,
            resourceType: $sharedResource->resource_type,
            resourceId: $sharedResource->resource_id
        );

        return $sharedResource->fresh();
    }

    /**
     * Check if a user from an external org has access to a resource.
     * If no specific users are assigned, all users from the receiving org get resource-level permission.
     */
    public function checkAccess(
        int $userId,
        string $resourceType,
        int $resourceId,
        ?string $requiredPermission = null
    ): ?SharedResource {
        $sharedResource = SharedResource::where('resource_type', $resourceType)
            ->where('resource_id', $resourceId)
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now());
            })->first();

        if (!$sharedResource) {
            return null;
        }

        // Check if user is explicitly granted access
        $userAccess = SharedResourceUser::where('shared_resource_id', $sharedResource->id)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->first();

        if ($userAccess) {
            // User has explicit access - check their override or fall back to resource-level
            if ($requiredPermission) {
                $effectivePermission = $userAccess->getEffectivePermission();
                if (!$this->hasPermissionLevel($effectivePermission, $requiredPermission)) {
                    return null;
                }
            }
            return $sharedResource;
        }

        // No specific user access - check if user belongs to the receiving org
        // If no users are explicitly assigned, all users from the receiving org get resource-level permission
        $assignedUsersCount = SharedResourceUser::where('shared_resource_id', $sharedResource->id)
            ->where('status', 'active')
            ->count();

        if ($assignedUsersCount === 0) {
            // No users explicitly assigned - grant access to all users of the receiving org
            if ($requiredPermission) {
                if (!$this->hasPermissionLevel($sharedResource->permission, $requiredPermission)) {
                    return null;
                }
            }
            return $sharedResource;
        }

        // Users are explicitly assigned but this user is not among them
        return null;
    }

    /**
     * Get all shared resources for a connection.
     */
    public function getConnectionSharedResources(
        OrganizationConnection $connection,
        ?string $resourceType = null
    ): \Illuminate\Database\Eloquent\Collection {
        $query = SharedResource::where('connection_id', $connection->id)
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now());
            });

        if ($resourceType) {
            $query->where('resource_type', $resourceType);
        }

        return $query->with(['sharedByUser', 'users.user'])->get();
    }

    /**
     * Get all resources shared by an organization.
     */
    public function getSharedByOrganization(
        int $organizationId,
        ?string $resourceType = null,
        int $offset = 0,
        int $limit = 25
    ): array {
        $query = SharedResource::sharedByOrganization($organizationId);

        if ($resourceType) {
            $query->where('resource_type', $resourceType);
        }

        $total = $query->count();
        $resources = $query->with(['sharedByUser'])
            ->offset($offset)
            ->limit($limit)
            ->latest()
            ->get();

        $enriched = $resources->map(function ($r) {
            return [
                'id'          => $r->id,
                'resource_type' => $r->resource_type,
                'resource_id'   => $r->resource_id,
                'resource_name' => $r->resource_name,
                'permission'    => $r->permission,
                'can_download'  => $r->can_download,
                'status'        => $r->status,
                'notes'         => $r->notes,
                'shared_at'     => $r->shared_at,
                'expires_at'    => $r->expires_at,
                'shared_by_user' => $r->sharedByUser ? [
                    'id'   => $r->sharedByUser->id,
                    'name' => $r->sharedByUser->name,
                ] : null,
                'shared_with_organization_id' => $r->shared_with_organization_id,
            ];
        });

        return [
            'total'     => $total,
            'resources' => $enriched,
        ];
    }

    /**
     * Get all resources shared with an organization.
     */
    public function getSharedWithOrganization(
        int $organizationId,
        ?string $resourceType = null,
        int $offset = 0,
        int $limit = 25
    ): array {
        $query = SharedResource::sharedWithOrganization($organizationId);

        if ($resourceType) {
            $query->where('resource_type', $resourceType);
        }

        $total = $query->count();
        $resources = $query->with(['sharedByUser'])
            ->offset($offset)
            ->limit($limit)
            ->latest()
            ->get();

        $enriched = $resources->map(function ($r) {
            return [
                'id'          => $r->id,
                'resource_type' => $r->resource_type,
                'resource_id'   => $r->resource_id,
                'resource_name' => $r->resource_name,
                'permission'    => $r->permission,
                'can_download'  => $r->can_download,
                'status'        => $r->status,
                'shared_at'     => $r->shared_at,
                'expires_at'    => $r->expires_at,
                'shared_by_organization_id' => $r->shared_by_organization_id,
                'shared_by_user' => $r->sharedByUser ? [
                    'id'   => $r->sharedByUser->id,
                    'name' => $r->sharedByUser->name,
                ] : null,
            ];
        });

        return [
            'total'     => $total,
            'resources' => $enriched,
        ];
    }

    /**
     * Get sharing statistics for an organization.
     */
    public function getStats(int $organizationId): array
    {
        $query = SharedResource::where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now());
            })
            ->where(function ($q) use ($organizationId) {
                $q->where('shared_by_organization_id', $organizationId)
                  ->orWhere('shared_with_organization_id', $organizationId);
            });

        $rows = $query->selectRaw('
            shared_by_organization_id,
            resource_type,
            COUNT(*) as cnt
        ')->groupBy('shared_by_organization_id', 'resource_type')->get();

        $sharedByUs = 0;
        $sharedWithUs = 0;
        $byType = ['project' => 0, 'task' => 0, 'event' => 0, 'knowledge_base' => 0];

        foreach ($rows as $row) {
            if ($row->shared_by_organization_id == $organizationId) {
                $sharedByUs += $row->cnt;
            } else {
                $sharedWithUs += $row->cnt;
            }
            if (isset($byType[$row->resource_type])) {
                $byType[$row->resource_type] += $row->cnt;
            }
        }

        return [
            'shared_by_us'   => $sharedByUs,
            'shared_with_us' => $sharedWithUs,
            'by_type'        => $byType,
        ];
    }

    /**
     * Validate that a resource exists.
     */
    private function validateResourceExists(string $resourceType, int $resourceId): void
    {
        $exists = match ($resourceType) {
            'project'        => Project::where('id', $resourceId)->exists(),
            'task'           => Task::where('id', $resourceId)->exists(),
            'event'          => Event::where('id', $resourceId)->exists(),
            'knowledge_base' => KnowledgeBase::where('id', $resourceId)->exists(),
            default          => false,
        };

        if (!$exists) {
            throw new \RuntimeException("Resource not found: {$resourceType} #{$resourceId}");
        }
    }

    /**
     * Check if permission level meets the required level.
     */
    private function hasPermissionLevel(string $granted, string $required): bool
    {
        $hierarchy = ['view' => 1, 'comment' => 2, 'collaborate' => 3];
        return ($hierarchy[$granted] ?? 0) >= ($hierarchy[$required] ?? 0);
    }

    /**
     * Log a sharing activity.
     */
    private function logActivity(
        ?int $connectionId = null,
        ?int $sharedResourceId = null,
        ?int $organizationId = null,
        ?int $userId = null,
        ?string $action = null,
        ?string $resourceType = null,
        ?int $resourceId = null,
        ?string $oldPermission = null,
        ?string $newPermission = null,
        ?array $details = null
    ): void {
        try {
            SharedResourceActivityLog::create([
                'connection_id'       => $connectionId,
                'shared_resource_id'  => $sharedResourceId,
                'user_id'             => $userId,
                'action'              => $action,
                'resource_type'       => $resourceType,
                'resource_id'         => $resourceId,
                'old_permission'      => $oldPermission,
                'new_permission'      => $newPermission,
                'ip_address'          => request()->ip(),
                'details'             => $details,
                'acted_at'            => now(),
            ]);
        } catch (\Exception $e) {
            \Log::warning("Activity log failed (non-critical): " . $e->getMessage());
        }
    }

    /**
     * Mirror a shared resource record to the receiver's tenant DB.
     * This allows the receiver to query their own shared_resources table.
     */
    private function mirrorToReceiverDb(SharedResource $sharedResource, int $receiverOrgId): void
    {
        $receiverOrg = Organization::find($receiverOrgId);
        if (!$receiverOrg || !$receiverOrg->database_name) return;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'tenant_mirror_' . $receiverOrgId . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $receiverOrg->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);

            $conn->table('shared_resources')->insert([
                'connection_id'               => $sharedResource->connection_id,
                'shared_by_organization_id'   => $sharedResource->shared_by_organization_id,
                'shared_with_organization_id' => $sharedResource->shared_with_organization_id,
                'resource_type'               => $sharedResource->resource_type,
                'resource_id'                 => $sharedResource->resource_id,
                'resource_name'               => $sharedResource->resource_name,
                'parent_resource_id'          => $sharedResource->parent_resource_id ?? null,
                'permission'                  => $sharedResource->permission,
                'can_download'                => $sharedResource->can_download,
                'status'                      => $sharedResource->status,
                'shared_by_user_id'           => $sharedResource->shared_by_user_id,
                'notes'                       => $sharedResource->notes,
                'shared_at'                   => $sharedResource->shared_at,
                'expires_at'                  => $sharedResource->expires_at,
                'created_at'                  => now(),
                'updated_at'                  => now(),
            ]);
        } catch (\Throwable $e) {
            \Log::error("Failed to mirror shared resource to receiver DB: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * Update mirrored record in receiver's tenant DB when permission changes.
     */
    private function updateMirrorInReceiverDb(SharedResource $sharedResource): void
    {
        $receiverOrg = Organization::find($sharedResource->shared_with_organization_id);
        if (!$receiverOrg || !$receiverOrg->database_name) return;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'tenant_mirror_' . $receiverOrg->id . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $receiverOrg->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);

            $conn->table('shared_resources')
                ->where('connection_id', $sharedResource->connection_id)
                ->where('resource_type', $sharedResource->resource_type)
                ->where('resource_id', $sharedResource->resource_id)
                ->update([
                    'permission'   => $sharedResource->permission,
                    'can_download' => $sharedResource->can_download,
                    'updated_at'   => now(),
                ]);
        } catch (\Throwable $e) {
            \Log::error("Failed to update mirror in receiver DB: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * Remove mirrored record from receiver's tenant DB when access is revoked.
     */
    private function removeMirrorFromReceiverDb(SharedResource $sharedResource): void
    {
        $receiverOrg = Organization::find($sharedResource->shared_with_organization_id);
        if (!$receiverOrg || !$receiverOrg->database_name) return;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'tenant_mirror_' . $receiverOrg->id . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $receiverOrg->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);

            $conn->table('shared_resources')
                ->where('connection_id', $sharedResource->connection_id)
                ->where('resource_type', $sharedResource->resource_type)
                ->where('resource_id', $sharedResource->resource_id)
                ->delete();
        } catch (\Throwable $e) {
            \Log::error("Failed to remove mirror from receiver DB: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * When sharing a project, cascade share all child resources:
     * - Tasks (project_id = resourceId)
     * - Events (project_id = resourceId)
     * - Knowledge bases (project_id = resourceId)
     */
    private function shareProjectChildren(
        int $projectResourceId,
        SharedResource $parentSharedResource,
        OrganizationConnection $connection,
        int $sharedByOrgId,
        int $sharedWithOrgId,
        int $userId,
        string $permission,
        bool $canDownload,
        ?string $expiresAt
    ): void {
        // Fetch child tasks
        $tasks = Task::where('project_id', $projectResourceId)->get();

        foreach ($tasks as $task) {
            $this->shareChildResource(
                parentSharedResource: $parentSharedResource,
                resourceType: 'task',
                resourceId: $task->id,
                resourceName: $task->title,
                connection: $connection,
                sharedByOrgId: $sharedByOrgId,
                sharedWithOrgId: $sharedWithOrgId,
                userId: $userId,
                permission: $permission,
                canDownload: $canDownload,
                expiresAt: $expiresAt
            );
        }

        // Fetch child events (events table has project_id column)
        $events = Event::where('project_id', $projectResourceId)->get();

        foreach ($events as $event) {
            $this->shareChildResource(
                parentSharedResource: $parentSharedResource,
                resourceType: 'event',
                resourceId: $event->id,
                resourceName: $event->title,
                connection: $connection,
                sharedByOrgId: $sharedByOrgId,
                sharedWithOrgId: $sharedWithOrgId,
                userId: $userId,
                permission: $permission,
                canDownload: $canDownload,
                expiresAt: $expiresAt
            );
        }

        // Fetch child knowledge bases (knowledge_bases table has project_id column)
        $kbs = KnowledgeBase::where('project_id', $projectResourceId)->get();

        foreach ($kbs as $kb) {
            $this->shareChildResource(
                parentSharedResource: $parentSharedResource,
                resourceType: 'knowledge_base',
                resourceId: $kb->id,
                resourceName: $kb->title,
                connection: $connection,
                sharedByOrgId: $sharedByOrgId,
                sharedWithOrgId: $sharedWithOrgId,
                userId: $userId,
                permission: $permission,
                canDownload: $canDownload,
                expiresAt: $expiresAt
            );
        }
    }

    /**
     * Share a single child resource (task, event, or knowledge_base).
     * Skips if already shared on this connection.
     */
    private function shareChildResource(
        SharedResource $parentSharedResource,
        string $resourceType,
        int $resourceId,
        string $resourceName,
        OrganizationConnection $connection,
        int $sharedByOrgId,
        int $sharedWithOrgId,
        int $userId,
        string $permission,
        bool $canDownload,
        ?string $expiresAt
    ): void {
        try {
            // Skip if already shared
            $existing = SharedResource::where('connection_id', $connection->id)
                ->where('resource_type', $resourceType)
                ->where('resource_id', $resourceId)
                ->where('status', 'active')
                ->first();

            if ($existing) {
                return;
            }

            $childResource = SharedResource::create([
                'connection_id'               => $connection->id,
                'shared_by_organization_id'   => $sharedByOrgId,
                'shared_with_organization_id' => $sharedWithOrgId,
                'resource_type'               => $resourceType,
                'resource_id'                 => $resourceId,
                'resource_name'               => $resourceName,
                'parent_resource_id'          => $parentSharedResource->id,
                'permission'                  => $permission,
                'can_download'                => $canDownload,
                'status'                      => 'active',
                'shared_by_user_id'           => $userId,
                'shared_at'                   => now(),
                'expires_at'                  => $expiresAt,
            ]);

            // Mirror to receiver DB
            $this->mirrorToReceiverDb($childResource, $sharedWithOrgId);

            // Log activity
            $this->logActivity(
                connectionId: $connection->id,
                sharedResourceId: $childResource->id,
                organizationId: $sharedByOrgId,
                userId: $userId,
                action: 'shared',
                resourceType: $resourceType,
                resourceId: $resourceId,
                details: [
                    'permission' => $permission,
                    'can_download' => $canDownload,
                    'parent_resource_id' => $parentSharedResource->id,
                    'cascade_shared' => true,
                ]
            );
        } catch (\Throwable $e) {
            \Log::warning("Failed to cascade share child resource {$resourceType} #{$resourceId}: " . $e->getMessage());
        }
    }

    /**
     * When revoking a project, revoke all cascade-shared child resources.
     */
    private function revokeProjectChildren(
        SharedResource $parentSharedResource,
        int $userId,
        int $organizationId
    ): void {
        $children = SharedResource::where('parent_resource_id', $parentSharedResource->id)
            ->where('status', 'active')
            ->get();

        foreach ($children as $child) {
            try {
                $child->update([
                    'status'     => 'revoked',
                    'revoked_at' => now(),
                ]);

                // Revoke user-level access
                SharedResourceUser::where('shared_resource_id', $child->id)
                    ->where('status', 'active')
                    ->update(['status' => 'revoked']);

                // Remove mirror from receiver DB
                $this->removeMirrorFromReceiverDb($child);

                // Log activity
                $this->logActivity(
                    connectionId: $child->connection_id,
                    sharedResourceId: $child->id,
                    organizationId: $organizationId,
                    userId: $userId,
                    action: 'unshared',
                    resourceType: $child->resource_type,
                    resourceId: $child->resource_id,
                    details: [
                        'previous_permission' => $child->permission,
                        'cascade_revoked' => true,
                        'parent_resource_id' => $parentSharedResource->id,
                    ]
                );
            } catch (\Throwable $e) {
                \Log::warning("Failed to cascade revoke child resource {$child->resource_type} #{$child->resource_id}: " . $e->getMessage());
            }
        }
    }

    /**
     * When updating a project's permission, update all cascade-shared child resources.
     */
    private function updateProjectChildrenPermissions(
        SharedResource $parentSharedResource,
        string $newPermission,
        bool $canDownload
    ): void {
        $children = SharedResource::where('parent_resource_id', $parentSharedResource->id)
            ->where('status', 'active')
            ->get();

        foreach ($children as $child) {
            try {
                $child->update([
                    'permission'   => $newPermission,
                    'can_download' => $canDownload,
                ]);

                // Update mirror in receiver DB
                $this->updateMirrorInReceiverDb($child);
            } catch (\Throwable $e) {
                \Log::warning("Failed to cascade update permission for child resource {$child->resource_type} #{$child->resource_id}: " . $e->getMessage());
            }
        }
    }
}
