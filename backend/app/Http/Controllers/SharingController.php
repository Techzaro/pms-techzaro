<?php

namespace App\Http\Controllers;

use App\Models\Master\OrganizationConnection;
use App\Models\SharedResource;
use App\Models\SharedResourceActivityLog;
use App\Models\SharedResourceUser;
use App\Services\Sharing\SharingService;
use App\Services\Sharing\SharingNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SharingController
 *
 * Manages resource sharing between connected organizations.
 * Handles share, unshare, permission updates, and access management.
 */
class SharingController extends Controller
{
    public function __construct(
        private SharingService $sharingService,
        private SharingNotificationService $notificationService
    ) {}

    /**
     * POST /api/sharing/share
     * Share a resource with a connected organization.
     */
    public function share(Request $request): JsonResponse
    {
        $request->validate([
            'connection_id'     => 'required|integer',
            'resource_type'     => 'required|string|in:project,task,event,knowledge_base',
            'resource_id'       => 'required|integer',
            'resource_name'     => 'nullable|string|max:255',
            'permission'        => 'nullable|string|in:view,comment,collaborate',
            'can_download'      => 'nullable|boolean',
            'notes'             => 'nullable|string|max:500',
            'expires_at'        => 'nullable|date',
            'user_ids'          => 'nullable|array',
            'user_ids.*'        => 'integer',
        ]);

        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = OrganizationConnection::where('id', $request->input('connection_id'))
            ->where(function ($q) use ($currentOrg) {
                $q->where('requesting_organization_id', $currentOrg->id)
                  ->orWhere('receiving_organization_id', $currentOrg->id);
            })->where('status', 'active')->first();

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Active connection not found.'], 404);
        }

        $otherOrgId = $connection->getOtherOrganization($currentOrg->id)?->id;

        \Log::info('Sharing: Starting share', [
            'connection_id' => $connection->id,
            'resource_type' => $request->input('resource_type'),
            'resource_id' => $request->input('resource_id'),
            'shared_by_org_id' => $currentOrg->id,
            'shared_with_org_id' => $otherOrgId,
            'permission' => $request->input('permission', 'view'),
            'expires_at' => $request->input('expires_at'),
        ]);

        try {
            $sharedResource = $this->sharingService->shareResource(
                connection: $connection,
                resourceType: $request->input('resource_type'),
                resourceId: $request->input('resource_id'),
                sharedByOrgId: $currentOrg->id,
                sharedWithOrgId: $otherOrgId,
                userId: $user->id,
                permission: $request->input('permission', 'view'),
                canDownload: $request->boolean('can_download', false),
                notes: $request->input('notes'),
                expiresAt: $request->input('expires_at'),
                userIds: $request->input('user_ids'),
                resourceName: $request->input('resource_name')
            );

            $isViewOnly = $sharedResource->permission === 'view';

            \Log::info('Sharing: Share success', [
                'id' => $sharedResource->id,
                'status' => $sharedResource->status,
                'permission' => $sharedResource->permission,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Resource shared successfully.',
                'data' => [
                    'id' => $sharedResource->id,
                    'permission' => $sharedResource->permission,
                    'original_permission' => $sharedResource->permission,
                    'is_view_only' => $isViewOnly,
                    'can_download' => $sharedResource->can_download,
                    'status' => $sharedResource->status,
                    'shared_at' => $sharedResource->shared_at,
                ],
            ], 201);
        } catch (\RuntimeException $e) {
            \Log::error('Sharing: RuntimeException', ['message' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Illuminate\Database\QueryException $e) {
            \Log::error('Sharing: QueryException', ['message' => $e->getMessage(), 'code' => $e->errorInfo[1] ?? null]);
            if ($e->errorInfo[1] == 1062) {
                return response()->json(['success' => false, 'message' => 'This resource is already shared with this organization.'], 422);
            }
            return response()->json(['success' => false, 'message' => 'A database error occurred.'], 500);
        } catch (\Throwable $e) {
            \Log::error('Sharing: Unexpected exception', ['message' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
            return response()->json(['success' => false, 'message' => 'An unexpected error occurred: ' . $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/sharing/shared-by-us
     * Get all resources shared by the current organization.
     */
    public function sharedByUs(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $resourceType = $request->query('type');
        $offset = (int) $request->query('offset', 0);
        $limit = (int) $request->query('limit', 25);

        \Log::info('sharedByUs: Querying', [
            'org_id' => $currentOrg->id,
            'db' => config('database.connections.mysql.database'),
        ]);

        $result = $this->sharingService->getSharedByOrganization(
            $currentOrg->id,
            $resourceType,
            $offset,
            $limit
        );

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * GET /api/sharing/shared-with-me
     * Get all resources shared with the current organization.
     */
    public function sharedWithMe(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $resourceType = $request->query('type');
        $offset = (int) $request->query('offset', 0);
        $limit = (int) $request->query('limit', 25);

        $result = $this->sharingService->getSharedWithOrganization(
            $currentOrg->id,
            $resourceType,
            $offset,
            $limit
        );

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * GET /api/sharing/stats
     * Get sharing statistics.
     */
    public function stats(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $stats = $this->sharingService->getStats($currentOrg->id);

        return response()->json([
            'success' => true,
            'data' => $stats,
        ]);
    }

    /**
     * GET /api/sharing/resources/{id}
     * Get a specific shared resource.
     */
    public function showSharedResource(Request $request, string $id): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        Log::info("showSharedResource: looking up id={$id} for org={$currentOrg->id} ({$currentOrg->name})");

        // Parse composite key: {sharerOrgId}_{resourceId} (frontend strips 'shared_' prefix)
        // or legacy: shared_{sharerOrgId}_{resourceId} (if passed with prefix)
        $compositeMatch = null;
        $compositeKey = ltrim($id, 'shared_');
        if (preg_match('/^(\d+)_(\d+)$/', $compositeKey, $compositeMatch)) {
            $sharerOrgId = (int) $compositeMatch[1];
            $resourceId = (int) $compositeMatch[2];

            // Look up SharedResource in the SHARER org's DB (where it was originally created)
            $sharedResource = $this->findSharedResourceInPartnerDb(
                $sharerOrgId, $resourceId, 'project', $currentOrg
            );

            if ($sharedResource) {
                Log::info("showSharedResource: composite key found in sharer DB id={$sharedResource->id} type={$sharedResource->resource_type} resource_id={$sharedResource->resource_id}");
                return $this->buildSharedResourceResponse($sharedResource, $currentOrg);
            }

            // Also try type=task in case the composite key points to a task
            $sharedResource = $this->findSharedResourceInPartnerDb(
                $sharerOrgId, $resourceId, 'task', $currentOrg
            );
            if ($sharedResource) {
                Log::info("showSharedResource: composite key found (task) in sharer DB id={$sharedResource->id} type={$sharedResource->resource_type} resource_id={$sharedResource->resource_id}");
                return $this->buildSharedResourceResponse($sharedResource, $currentOrg);
            }
        }

        // Legacy: try numeric ID in current org's DB (backward compat)
        $numericId = (int) $id;
        $sharedResource = SharedResource::where('id', $numericId)
            ->where(function ($q) use ($currentOrg) {
                $q->where('shared_by_organization_id', $currentOrg->id)
                  ->orWhere('shared_with_organization_id', $currentOrg->id);
            })->with(['sharedByUser', 'users.user'])->first();

        Log::info("showSharedResource: legacy lookup=" . ($sharedResource ? "yes id={$sharedResource->id} type={$sharedResource->resource_type} resource_id={$sharedResource->resource_id} shared_by_org={$sharedResource->shared_by_organization_id} shared_with_org={$sharedResource->shared_with_organization_id}" : "no"));

        if ($sharedResource) {
            return $this->buildSharedResourceResponse($sharedResource, $currentOrg);
        }

        // Fallback: search by resource_id (task/project ID) instead of SharedResource PK
        if (!$sharedResource) {
            $sharedResource = SharedResource::where('resource_id', $numericId)
                ->where('resource_type', '!=', 'project')
                ->where(function ($q) use ($currentOrg) {
                    $q->where('shared_by_organization_id', $currentOrg->id)
                      ->orWhere('shared_with_organization_id', $currentOrg->id);
                })->where('status', 'active')
                ->with(['sharedByUser', 'users.user'])
                ->latest()
                ->first();
        }

        // Last resort: check if it's a task belonging to a shared project
        if (!$sharedResource) {
            $sharedResource = $this->findOrCreateTaskSharedResource($numericId, $currentOrg);
            if ($sharedResource) {
                $sharedResource->load(['sharedByUser', 'users.user']);
            }
        }

        // Scan connected orgs' DBs as fallback (mirror may have failed)
        if (!$sharedResource) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($numericId, $currentOrg);
        }

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        return $this->buildSharedResourceResponse($sharedResource, $currentOrg);
    }

    /**
     * Merge shared_project_members from all orgs into resource->members.
     * Scans both the current org's DB and all partner orgs' DBs.
     */
    private function mergeSharedProjectMembersIntoResource($resource, SharedResource $sharedResource): void
    {
        try {
            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

            // Step 1: Collect all shared_project_member records from ALL orgs
            $allSpmRecords = []; // Each: ['user_id' => int, 'organization_id' => int]
            $orgUserCache = []; // org_id => [user_id => ['id','name','email','role','department']]

            // Helper: scan a tenant DB for shared_project_members
            $scanTenantDb = function ($orgId) use ($sharedResource, $masterConfig, &$allSpmRecords, &$orgUserCache) {
                $org = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
                if (!$org || !$org->database_name) {
                    Log::info("mergeSharedProjectMembers: org {$orgId} not found or no db_name");
                    return;
                }

                $connName = 'spm_scan_' . $orgId . '_' . uniqid();
                try {
                    config()->set("database.connections.{$connName}", [
                        'driver'    => 'mysql',
                        'host'      => $masterConfig['host'],
                        'port'      => $masterConfig['port'],
                        'database'  => $org->database_name,
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

                    if (!$conn->getSchemaBuilder()->hasTable('shared_resources') || !$conn->getSchemaBuilder()->hasTable('shared_project_members')) {
                        Log::info("mergeSharedProjectMembers: org {$orgId} missing tables (sr=" . ($conn->getSchemaBuilder()->hasTable('shared_resources') ? 'yes' : 'no') . " spm=" . ($conn->getSchemaBuilder()->hasTable('shared_project_members') ? 'yes' : 'no') . ")");
                        return;
                    }

                    // Find the mirror: first try by shared_resource_id directly (most common — mirrors preserve original ID)
                    $spmRows = collect();
                    $mirrorId = null;

                    // Try direct ID lookup first
                    $directSpm = $conn->table('shared_project_members')
                        ->where('shared_resource_id', $sharedResource->id)
                        ->get();
                    if ($directSpm->isNotEmpty()) {
                        $mirrorId = $sharedResource->id;
                        $spmRows = $directSpm;
                    }

                    // Fallback: find mirror by resource_type + resource_id
                    if ($spmRows->isEmpty()) {
                        $mirror = $conn->table('shared_resources')
                            ->where('resource_type', $sharedResource->resource_type)
                            ->where('resource_id', $sharedResource->resource_id)
                            ->where('status', 'active')
                            ->first();

                        if ($mirror) {
                            $mirrorId = $mirror->id;
                            $spmRows = $conn->table('shared_project_members')
                                ->where('shared_resource_id', $mirror->id)
                                ->get();
                        }
                    }

                    Log::info("mergeSharedProjectMembers: org {$orgId} found {$spmRows->count()} shared_project_members (mirror_id={$mirrorId})");

                    foreach ($spmRows as $row) {
                        // Avoid duplicates
                        $dup = false;
                        foreach ($allSpmRecords as $existing) {
                            if ((int)$existing['user_id'] === (int)$row->user_id && (int)$existing['organization_id'] === (int)$row->organization_id) {
                                $dup = true;
                                break;
                            }
                        }
                        if (!$dup) {
                            $allSpmRecords[] = [
                                'user_id' => (int) $row->user_id,
                                'organization_id' => (int) $row->organization_id,
                            ];
                        }
                    }
                } catch (\Throwable $e) {
                    Log::warning("mergeSharedProjectMembers: scan org {$orgId} failed: " . $e->getMessage());
                } finally {
                    DB::purge($connName);
                }
            };

            // Scan current org's DB
            $currentOrg = request()->attributes->get('currentOrganization');
            $currentOrgId = $currentOrg?->id ?? null;
            if ($currentOrgId) {
                $scanTenantDb($currentOrgId);
            }

            // Scan partner orgs' DBs
            $partnerOrgIds = [];
            if ($sharedResource->shared_by_organization_id) {
                $partnerOrgIds[] = (int) $sharedResource->shared_by_organization_id;
            }
            if ($sharedResource->shared_with_organization_id) {
                $partnerOrgIds[] = (int) $sharedResource->shared_with_organization_id;
            }
            foreach (array_unique($partnerOrgIds) as $pOrgId) {
                if ($pOrgId !== $currentOrgId) {
                    $scanTenantDb($pOrgId);
                }
            }

            if (empty($allSpmRecords)) return;

            // Step 2: Resolve user details and build member objects
            // Track existing member keys by "id:org_id" AND by email to avoid duplicates
            $existingMemberKeys = [];
            $existingMemberEmails = [];
            foreach (($resource->members ?? []) as $m) {
                $mid = is_array($m) ? ($m['id'] ?? null) : ($m->id ?? $m['id'] ?? null);
                $morg = is_array($m) ? ($m['organization_id'] ?? null) : ($m->organization_id ?? null);
                if ($mid) $existingMemberKeys[] = (int) $mid . ':' . ($morg ? (int) $morg : '');
                $memail = strtolower(trim((string) (is_array($m) ? ($m['email'] ?? '') : ($m->email ?? ''))));
                if ($memail) $existingMemberEmails[] = $memail;
            }

            $newMembers = [];

            foreach ($allSpmRecords as $spm) {
                $userId = $spm['user_id'];
                $orgId = $spm['organization_id'];

                // Resolve user details from their org DB
                if (!isset($orgUserCache[$orgId][$userId])) {
                    $org = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
                    if (!$org || !$org->database_name) continue;

                    $connName = 'spm_resolve_' . $orgId . '_' . uniqid();
                    try {
                        config()->set("database.connections.{$connName}", [
                            'driver'    => 'mysql',
                            'host'      => $masterConfig['host'],
                            'port'      => $masterConfig['port'],
                            'database'  => $org->database_name,
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
                        $userRow = DB::connection($connName)
                            ->table('users')
                            ->where('id', $userId)
                            ->select('id', 'name', 'email', 'role', 'department')
                            ->first();
                        if ($userRow) {
                            $orgUserCache[$orgId][$userId] = [
                                'id' => (int) $userRow->id,
                                'name' => $userRow->name,
                                'email' => $userRow->email,
                                'role' => $userRow->role,
                                'department' => $userRow->department,
                            ];
                        } else {
                            $orgUserCache[$orgId][$userId] = null;
                        }
                    } catch (\Throwable $e) {
                        Log::warning("mergeSharedProjectMembers: resolve user {$userId} org {$orgId} failed: " . $e->getMessage());
                        $orgUserCache[$orgId][$userId] = null;
                    } finally {
                        DB::purge($connName);
                    }
                }

                $u = $orgUserCache[$orgId][$userId] ?? null;
                if ($u) {
                    $memberKey = $u['id'] . ':' . $orgId;
                    $spmEmail = strtolower(trim((string) ($u['email'] ?? '')));
                    if (in_array($memberKey, $existingMemberKeys)) continue;
                    if ($spmEmail && in_array($spmEmail, $existingMemberEmails)) continue;

                    // Only set badge properties for EXTERNAL members (not from current org)
                    $isExternalMember = ($orgId != $currentOrgId);
                    $partnerOrgName = '';
                    if ($isExternalMember) {
                        try {
                            $po = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
                            $partnerOrgName = $po?->name ?? '';
                        } catch (\Throwable $e) {}
                    }
                    $newMembers[] = (object) [
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'email' => $u['email'],
                        'role' => $u['role'],
                        'department' => $u['department'],
                        'is_shared_member' => $isExternalMember,
                        '_isExternal' => $isExternalMember,
                        'organization_id' => $orgId,
                        'org_name' => $partnerOrgName,
                    ];
                    $existingMemberKeys[] = $memberKey;
                    if ($spmEmail) $existingMemberEmails[] = $spmEmail;
                }
            }

            Log::info("mergeSharedProjectMembers: total " . count($allSpmRecords) . " records found, " . count($newMembers) . " new members to add");

            // Step 3: Rebuild members as a plain array and set it on the resource
            if (!empty($newMembers)) {
                $currentMembers = [];
                foreach (($resource->members ?? []) as $m) {
                    if (is_array($m)) {
                        $currentMembers[] = (object) $m;
                    } else {
                        $currentMembers[] = $m;
                    }
                }
                $allMembers = array_merge($currentMembers, $newMembers);
                $resource->setRelation('members', collect($allMembers));
                Log::info("mergeSharedProjectMembers: resource->members now has " . count($allMembers) . " total members");
            }
        } catch (\Throwable $e) {
            Log::warning('mergeSharedProjectMembersIntoResource failed: ' . $e->getMessage());
        }
    }

    /**
     * PUT /api/sharing/resources/{id}/permission
     * Update sharing permission.
     */
    public function updatePermission(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'permission'   => 'required|string|in:view,comment,collaborate',
            'can_download' => 'required|boolean',
            'expires_at'   => 'nullable|date',
        ]);

        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $sharedResource = SharedResource::where('id', $id)
            ->where('shared_by_organization_id', $currentOrg->id)
            ->whereIn('status', ['active', 'expired'])
            ->first();

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        try {
            $updated = $this->sharingService->updatePermission(
                sharedResource: $sharedResource,
                newPermission: $request->input('permission'),
                canDownload: $request->boolean('can_download'),
                userId: $user->id,
                organizationId: $currentOrg->id,
                expiresAt: $request->input('expires_at')
            );

            return response()->json([
                'success' => true,
                'message' => 'Permission updated.',
                'data' => [
                    'permission' => $updated->permission,
                    'can_download' => $updated->can_download,
                    'expires_at' => $updated->expires_at,
                ],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * DELETE /api/sharing/resources/{id}
     * Revoke access to a shared resource.
     */
    public function revokeAccess(Request $request, int $id): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $sharedResource = SharedResource::where('id', $id)
            ->where('shared_by_organization_id', $currentOrg->id)
            ->where('status', 'active')
            ->first();

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        try {
            $this->sharingService->revokeAccess($sharedResource, $user->id, $currentOrg->id);

            return response()->json([
                'success' => true,
                'message' => 'Access revoked.',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/resources/{id}/users
     * Add users to a shared resource.
     */
    public function addUsers(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'user_ids'   => 'required|array|min:1',
            'user_ids.*' => 'integer',
        ]);

        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $sharedResource = SharedResource::where('id', $id)
            ->where('shared_by_organization_id', $currentOrg->id)
            ->where('status', 'active')
            ->first();

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        $added = 0;
        $addedUserIds = [];
        foreach ($request->input('user_ids') as $userId) {
            $exists = SharedResourceUser::where('shared_resource_id', $id)
                ->where('user_id', $userId)
                ->exists();

            if (!$exists) {
                SharedResourceUser::create([
                    'shared_resource_id' => $id,
                    'user_id'            => $userId,
                    'status'             => 'active',
                    'granted_at'         => now(),
                    'granted_by_user_id' => $user->id,
                ]);
                $addedUserIds[] = $userId;
                $added++;
            }
        }

        if ($added > 0) {
            try {
                SharedResourceActivityLog::create([
                    'connection_id'       => $sharedResource->connection_id,
                    'shared_resource_id'  => $sharedResource->id,
                    'organization_id'     => $currentOrg->id,
                    'user_id'             => $user->id,
                    'action'              => 'access_granted',
                    'resource_type'       => $sharedResource->resource_type,
                    'resource_id'         => $sharedResource->resource_id,
                    'details'             => ['user_ids' => $addedUserIds, 'count' => $added],
                    'ip_address'          => $request->ip(),
                    'acted_at'            => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning("Activity log failed (addUsers): " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$added} user(s) added.",
        ]);
    }

    /**
     * DELETE /api/sharing/resources/{id}/users/{userId}
     * Remove a user from a shared resource.
     */
    public function removeUser(Request $request, int $id, int $userId): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        $sharedResource = SharedResource::where('id', $id)
            ->where('shared_by_organization_id', $currentOrg->id)
            ->where('status', 'active')
            ->first();

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        SharedResourceUser::where('shared_resource_id', $id)
            ->where('user_id', $userId)
            ->update(['status' => 'revoked']);

        try {
            SharedResourceActivityLog::create([
                'connection_id'       => $sharedResource->connection_id,
                'shared_resource_id'  => $sharedResource->id,
                'organization_id'     => $currentOrg->id,
                'user_id'             => $request->user()->id,
                'action'              => 'access_revoked',
                'resource_type'       => $sharedResource->resource_type,
                'resource_id'         => $sharedResource->resource_id,
                'details'             => ['revoked_user_id' => $userId],
                'ip_address'          => $request->ip(),
                'acted_at'            => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning("Activity log failed (removeUser): " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'User removed from shared resource.',
        ]);
    }

    /**
     * GET /api/sharing/shared-project-users/{sharedResourceId}
     * Get partner org's users for a shared project (collaborate permission).
     * Also returns the partner org's project members.
     */
    public function getSharedProjectUsers(Request $request, int $sharedResourceId): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        // Find the SharedResource in local DB or partner DBs
        $sharedResource = SharedResource::where('id', $sharedResourceId)
            ->where('status', 'active')
            ->where(function ($q) use ($currentOrg) {
                $q->where('shared_by_organization_id', $currentOrg->id)
                  ->orWhere('shared_with_organization_id', $currentOrg->id);
            })->first();

        if (!$sharedResource) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($sharedResourceId, $currentOrg);
        }

        if (!$sharedResource) {
            return response()->json(['users' => [], 'partner_org' => null]);
        }

        // Only return users for collaborate permission
        if ($sharedResource->permission !== 'collaborate') {
            return response()->json(['users' => [], 'partner_org' => null]);
        }

        // Determine partner org
        $partnerOrgId = $sharedResource->shared_by_organization_id == $currentOrg->id
            ? $sharedResource->shared_with_organization_id
            : $sharedResource->shared_by_organization_id;

        $partnerOrg = \App\Models\Master\Organization::on('mysql_master')->find($partnerOrgId);
        if (!$partnerOrg || !$partnerOrg->database_name) {
            return response()->json(['users' => [], 'partner_org' => null]);
        }

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'shared_proj_users_' . $partnerOrgId . '_' . uniqid();
        $partnerUsers = [];

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $partnerOrg->database_name,
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

            // Get all active users from partner org
            $partnerUsers = $conn->table('users')
                ->where('active', true)
                ->select('id', 'name', 'email', 'role', 'department')
                ->orderBy('name')
                ->get()
                ->map(function ($u) use ($partnerOrg) {
                    return [
                        'id' => $u->id,
                        'name' => $u->name,
                        'email' => $u->email,
                        'role' => $u->role,
                        'department' => $u->department,
                        'org_name' => $partnerOrg->name,
                        'org_id' => $partnerOrg->id,
                        'is_external' => true,
                    ];
                })
                ->toArray();
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch shared project users: ' . $e->getMessage());
        } finally {
            DB::purge($connName);
        }

        return response()->json([
            'users' => $partnerUsers,
            'partner_org' => [
                'id' => $partnerOrg->id,
                'name' => $partnerOrg->name,
            ],
            'shared_resource_id' => $sharedResource->id,
            'permission' => $sharedResource->permission,
        ]);
    }

    /**
     * GET /api/sharing/shared-resources
     * Get all resources shared with the current organization, grouped by type.
     * Used by Projects, Tasks, and Events listing pages to show shared items.
     */
    public function sharedResources(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $type = $request->query('type'); // optional filter: project, task, event

        $query = SharedResource::where('shared_with_organization_id', $currentOrg->id)
            ->where('status', 'active')
            ->with('sharedByUser:id,name');

        if ($type) {
            $query->where('resource_type', $type);
        }

        $resources = $query->latest('shared_at')->get();

        // Also fetch from connected orgs' DBs (mirror may have failed)
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connections = OrganizationConnection::where(function ($q) use ($currentOrg) {
            $q->where('requesting_organization_id', $currentOrg->id)
              ->orWhere('receiving_organization_id', $currentOrg->id);
        })->where('status', 'active')->get();

        $existingIds = $resources->pluck('id')->toArray();
        foreach ($connections as $conn) {
            $otherOrgId = $conn->requesting_organization_id == $currentOrg->id
                ? $conn->receiving_organization_id
                : $conn->requesting_organization_id;

            $otherOrg = \App\Models\Master\Organization::on('mysql_master')->find($otherOrgId);
            if (!$otherOrg || !$otherOrg->database_name) continue;

            $connName = 'sharing_scan_' . $otherOrgId . '_' . uniqid();
            try {
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $otherOrg->database_name,
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
                $connDb = DB::connection($connName);

                if (!$connDb->getSchemaBuilder()->hasTable('shared_resources')) continue;

                $q = $connDb->table('shared_resources')
                    ->where('shared_with_organization_id', $currentOrg->id)
                    ->where('status', 'active')
                    ->where(function ($qq) {
                        $qq->whereNull('expires_at')
                           ->orWhere('expires_at', '>', now());
                    });

                if ($type) {
                    $q->where('resource_type', $type);
                }

                $remoteResources = $q->orderBy('shared_at', 'desc')->get();

                foreach ($remoteResources as $rr) {
                    if (in_array($rr->id, $existingIds)) continue;
                    // Convert to SharedResource-like object for consistent processing
                    $sr = new SharedResource();
                    foreach ((array)$rr as $k => $v) {
                        $sr->$k = $v;
                    }
                    $sr->setRelation('sharedByUser', null);
                    $resources->push($sr);
                    $existingIds[] = $rr->id;
                }
            } catch (\Throwable $e) {
                Log::warning("Failed to scan partner DB for shared resources: " . $e->getMessage());
            } finally {
                DB::purge($connName);
            }
        }

        $sharerOrgs = [];
        $sharerConnections = [];

        $data = $resources->map(function ($resource) use (&$sharerOrgs) {
            try {
                $sharerOrg = $this->getSharerOrg($resource->shared_by_organization_id, $sharerOrgs);
                $actual = $this->fetchActualResource($resource, $sharerOrg);
            } catch (\Throwable $e) {
                Log::warning("Failed fetching actual resource: " . $e->getMessage());
                $actual = null;
                $sharerOrg = null;
            }

            // Skip cascade-shared children where actual resource is not found
            if ($actual === null && !empty($resource->parent_resource_id)) {
                return null;
            }

            // If actual resource not found, use metadata from SharedResource record
            // Do NOT auto-revoke on read - a temporary connection failure should not destroy sharing
            $actualTitle = $actual ? ($actual->title ?? null) : null;

            $item = [
                'id' => 'shared_' . $resource->id,
                'shared_resource_id' => $resource->id,
                'resource_type' => $resource->resource_type,
                'resource_id' => $resource->resource_id,
                'title' => $actualTitle ?? $resource->resource_name ?? 'Untitled',
                'name' => $actualTitle ?? $resource->resource_name ?? 'Untitled',
                'permission' => $resource->permission,
                'can_download' => $resource->can_download,
                'shared_by_organization_id' => $resource->shared_by_organization_id,
                'shared_by_organization' => $sharerOrg ? ['id' => $sharerOrg->id, 'name' => $sharerOrg->name] : null,
                'shared_by_user' => $resource->sharedByUser ? [
                    'id' => $resource->sharedByUser->id,
                    'name' => $resource->sharedByUser->name,
                ] : null,
                'shared_at' => $resource->shared_at,
                'expires_at' => $resource->expires_at,
                'is_shared' => true,
                'parent_resource_id' => $resource->parent_resource_id ?? null,
                'cascade_shared' => !empty($resource->parent_resource_id),
            ];

            if ($actual) {
                $item['status'] = $actual->status ?? null;
                $item['description'] = $actual->description ?? null;
                $item['start_date'] = $actual->start_date ?? null;
                $item['end_date'] = $actual->end_date ?? null;
                $item['priority'] = $actual->priority ?? null;

                if ($resource->resource_type === 'project') {
                    $item['total_tasks'] = $actual->total_tasks ?? 0;
                    $item['completed_tasks'] = $actual->completed_tasks ?? 0;
                    $item['business_id'] = $actual->business_id ?? null;
                    $item['project_code'] = $actual->project_code ?? null;
                    $item['budget'] = $actual->budget ?? null;
                    $item['client_name'] = $actual->client_name ?? null;
                    $item['category'] = $actual->category ?? null;
                    $item['team_id'] = $actual->team_id ?? null;
                    $item['created_by'] = $actual->created_by ?? null;
                    $item['creator'] = $actual->creator ?? null;
                    $item['members'] = $actual->members ?? null;
                    $item['overall_progress'] = $actual->overall_progress ?? 0;
                    $item['progress'] = $actual->progress ?? 0;
                }

                if ($resource->resource_type === 'task') {
                    $item['assigned_to'] = $actual->assigned_to ?? null;
                    $item['assigned_by'] = $actual->assigned_by ?? null;
                    $item['project_id'] = $actual->project_id ?? null;
                    $item['project'] = null;
                    $item['creator_id'] = $actual->creator_id ?? null;
                    $item['deliverables_progress'] = $actual->deliverables_progress ?? 0;
                    $item['total_deliverables'] = $actual->total_deliverables ?? 0;
                    $item['completed_deliverables'] = $actual->completed_deliverables ?? 0;
                    $item['business_id'] = $actual->business_id ?? null;
                    $item['task_number'] = $actual->task_number ?? null;
                }

                if ($resource->resource_type === 'event') {
                    $item['location'] = $actual->location ?? null;
                    $item['meeting_link'] = $actual->meeting_link ?? null;
                    $item['color'] = $actual->color ?? null;
                    $item['type'] = $actual->type ?? null;
                    $item['all_day'] = $actual->all_day ?? false;
                    $item['organizer_id'] = $actual->organizer_id ?? null;
                    $item['user_id'] = $actual->user_id ?? null;
                    $item['visibility_level'] = $actual->visibility_level ?? null;
                    $item['is_global'] = $actual->is_global ?? false;
                    $item['event_timezone'] = $actual->event_timezone ?? null;
                }

                if ($resource->resource_type === 'knowledge_base') {
                    $item['category'] = $actual->category ?? null;
                    $item['tags'] = $actual->tags ?? null;
                }
            }

            return $item;
        })->filter()->values();

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    /**
     * Resolve a SharedResource for the current org using the same fallbacks as showSharedResource.
     */
    private function resolveSharedResource(int $id, $currentOrg): ?SharedResource
    {
        if (!$currentOrg) {
            return null;
        }

        $sharedResource = SharedResource::where('id', $id)
            ->where('status', 'active')
            ->where(function ($q) use ($currentOrg) {
                $q->where('shared_by_organization_id', $currentOrg->id)
                  ->orWhere('shared_with_organization_id', $currentOrg->id);
            })
            ->first();

        if (!$sharedResource) {
            $sharedResource = SharedResource::where('resource_id', $id)
                ->where('resource_type', '!=', 'project')
                ->where(function ($q) use ($currentOrg) {
                    $q->where('shared_by_organization_id', $currentOrg->id)
                      ->orWhere('shared_with_organization_id', $currentOrg->id);
                })
                ->where('status', 'active')
                ->latest()
                ->first();
        }

        if (!$sharedResource) {
            $sharedResource = $this->findOrCreateTaskSharedResource($id, $currentOrg);
        }

        if (!$sharedResource) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($id, $currentOrg);
        }

        return $sharedResource;
    }

    /**
     * Scan connected orgs' databases for a SharedResource record that wasn't mirrored.
     * Returns a SharedResource-like model if found, or null.
     */
    private function findSharedResourceInPartnerDbs(int $id, $currentOrg): ?SharedResource
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connections = OrganizationConnection::where(function ($q) use ($currentOrg) {
            $q->where('requesting_organization_id', $currentOrg->id)
              ->orWhere('receiving_organization_id', $currentOrg->id);
        })->where('status', 'active')->get();

        foreach ($connections as $connRecord) {
            $otherOrgId = $connRecord->requesting_organization_id == $currentOrg->id
                ? $connRecord->receiving_organization_id
                : $connRecord->requesting_organization_id;

            $otherOrg = \App\Models\Master\Organization::on('mysql_master')->find($otherOrgId);
            if (!$otherOrg || !$otherOrg->database_name) continue;

            $connName = 'partner_lookup_' . $otherOrgId . '_' . uniqid();
            try {
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $otherOrg->database_name,
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
                $connDb = DB::connection($connName);

                if (!$connDb->getSchemaBuilder()->hasTable('shared_resources')) continue;

                $row = $connDb->table('shared_resources')
                    ->where('id', $id)
                    ->where(function ($q) use ($currentOrg) {
                        $q->where('shared_by_organization_id', $currentOrg->id)
                          ->orWhere('shared_with_organization_id', $currentOrg->id);
                    })
                    ->where('status', 'active')
                    ->first();

                if ($row) {
                    $sr = new SharedResource();
                    foreach ((array)$row as $k => $v) {
                        $sr->$k = $v;
                    }
                    $sr->setRelation('sharedByUser', null);
                    $sr->setRelation('users', collect());
                    return $sr;
                }
            } catch (\Throwable $e) {
                Log::warning("Failed to scan partner DB for shared resource #{$id}: " . $e->getMessage());
            } finally {
                DB::purge($connName);
            }
        }

        return null;
    }

    /**
     * Look up a SharedResource in a specific partner org's DB by resource_id and resource_type.
     * Used by composite key navigation (shared_{orgId}_{resourceId}).
     */
    private function findSharedResourceInPartnerDb(int $orgId, int $resourceId, string $resourceType, $currentOrg): ?SharedResource
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $org = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
        if (!$org || !$org->database_name) return null;

        $connName = 'partner_sr_lookup_' . $orgId . '_' . uniqid();
        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $org->database_name,
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

            if (!$conn->getSchemaBuilder()->hasTable('shared_resources')) return null;

            $row = $conn->table('shared_resources')
                ->where('resource_type', $resourceType)
                ->where('resource_id', $resourceId)
                ->where(function ($q) use ($currentOrg) {
                    $q->where('shared_by_organization_id', $currentOrg->id)
                      ->orWhere('shared_with_organization_id', $currentOrg->id);
                })
                ->where('status', 'active')
                ->first();

            if ($row) {
                $sr = new SharedResource();
                foreach ((array)$row as $k => $v) {
                    $sr->$k = $v;
                }
                $sr->setRelation('sharedByUser', null);
                $sr->setRelation('users', collect());
                return $sr;
            }
        } catch (\Throwable $e) {
            Log::warning("findSharedResourceInPartnerDb: failed for org={$orgId} resource_id={$resourceId}: " . $e->getMessage());
        } finally {
            DB::purge($connName);
        }

        return null;
    }

    /**
     * Build the full JSON response for a SharedResource (fetches actual resource, merges members, etc.)
     * Extracted from showSharedResource to avoid duplication.
     */
    private function buildSharedResourceResponse(SharedResource $sharedResource, $currentOrg): JsonResponse
    {
        // Check if revoked — truly removed
        if ($sharedResource->status === 'revoked') {
            return response()->json(['success' => false, 'message' => 'This shared resource has been removed.'], 410);
        }

        // Determine effective permission: if expires_at has passed, downgrade to view-only
        $effectivePermission = $sharedResource->permission;
        $isViewOnly = false;
        if ($sharedResource->expires_at && $sharedResource->expires_at->isPast()) {
            $effectivePermission = 'view';
            $isViewOnly = true;
        }

        $sharerOrgs = [];
        $sharerOrg = $this->getSharerOrg($sharedResource->shared_by_organization_id, $sharerOrgs);
        Log::info("buildSharedResourceResponse: sharerOrg=" . ($sharerOrg ? "id={$sharerOrg->id} name={$sharerOrg->name} db={$sharerOrg->database_name}" : "null"));
        $resource = $this->fetchActualResource($sharedResource, $sharerOrg);
        Log::info("buildSharedResourceResponse: resource=" . ($resource ? "loaded id={$resource->id} title=" . ($resource->title ?? 'N/A') : "null"));

        // Recovery: if fetchActualResource failed (resource=null), the SharedResource record
        // in the current org's DB may be stale/wrong (ID collision across tenant DBs).
        // Search partner DBs for the correct SharedResource with matching org pair.
        if (!$resource && $sharerOrg) {
            Log::info("buildSharedResourceResponse: resource null, trying partner DB recovery for orgs shared_by={$sharedResource->shared_by_organization_id} shared_with={$sharedResource->shared_with_organization_id}");
            $recovered = $this->findCorrectSharedResourceInPartnerDbs($sharedResource, $currentOrg);
            if ($recovered) {
                Log::info("buildSharedResourceResponse: recovered id={$recovered->id} type={$recovered->resource_type} resource_id={$recovered->resource_id}");
                $sharedResource = $recovered;
                $sharerOrg = $this->getSharerOrg($recovered->shared_by_organization_id, $sharerOrgs);
                $resource = $this->fetchActualResource($recovered, $sharerOrg);
                Log::info("buildSharedResourceResponse: after recovery resource=" . ($resource ? "loaded" : "still null"));
            }
        }

        if (!$resource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found or no longer available.'], 404);
        }

        // Tag original members with sharer org info when viewer is the RECEIVER (not the sharer)
        if ($sharerOrg && $currentOrg && $sharerOrg->id != $currentOrg->id) {
            $members = $resource->getRelation('members');
            if ($members && $members->count()) {
                $taggedMembers = $members->map(function ($m) use ($sharerOrg) {
                    if (is_array($m)) {
                        $m['is_external'] = true;
                        $m['_isExternal'] = true;
                        $m['org_name'] = $sharerOrg->name;
                        $m['organization_id'] = $sharerOrg->id;
                        return $m;
                    } else {
                        $m->is_external = true;
                        $m->_isExternal = true;
                        $m->org_name = $sharerOrg->name;
                        $m->organization_id = $sharerOrg->id;
                        return $m;
                    }
                });
                $resource->setRelation('members', $taggedMembers);
            }
        }

        // For collaborate permission, merge shared_project_members from receiver orgs into resource->members
        if ($sharedResource->permission === 'collaborate' && $sharedResource->resource_type === 'project') {
            $this->mergeSharedProjectMembersIntoResource($resource, $sharedResource);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $sharedResource->id,
                'resource_type' => $sharedResource->resource_type,
                'resource_id' => $sharedResource->resource_id,
                'resource' => $resource,
                'permission' => $sharedResource->permission,
                'can_download' => $sharedResource->can_download,
                'status' => $sharedResource->status,
                'shared_at' => $sharedResource->shared_at,
                'expires_at' => $sharedResource->expires_at,
                'notes' => $sharedResource->notes,
                'shared_by_user' => $sharedResource->sharedByUser,
                'users' => $sharedResource->users,
                'parent_resource_id' => $sharedResource->parent_resource_id ?? null,
                'cascade_shared' => !empty($sharedResource->parent_resource_id),
            ],
        ]);
    }

    /**
     * Recovery method: when a SharedResource in the current org's DB is stale/wrong
     * (due to ID collision across tenant DBs), search partner DBs for the correct one.
     * Matches by (shared_by_organization_id, shared_with_organization_id, resource_type='project').
     */
    private function findCorrectSharedResourceInPartnerDbs(SharedResource $staleResource, $currentOrg): ?SharedResource
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connections = \App\Models\Master\OrganizationConnection::where(function ($q) use ($currentOrg) {
            $q->where('requesting_organization_id', $currentOrg->id)
              ->orWhere('receiving_organization_id', $currentOrg->id);
        })->where('status', 'active')->get();

        $partnerOrgIds = [];
        foreach ($connections as $connRecord) {
            $otherOrgId = $connRecord->requesting_organization_id == $currentOrg->id
                ? $connRecord->receiving_organization_id
                : $connRecord->requesting_organization_id;
            $partnerOrgIds[] = $otherOrgId;
        }

        if (!in_array($staleResource->shared_by_organization_id, $partnerOrgIds)) {
            $partnerOrgIds[] = $staleResource->shared_by_organization_id;
        }

        foreach ($partnerOrgIds as $partnerOrgId) {
            $partnerOrg = \App\Models\Master\Organization::on('mysql_master')->find($partnerOrgId);
            if (!$partnerOrg || !$partnerOrg->database_name) continue;

            $connName = 'recovery_' . $partnerOrgId . '_' . uniqid();
            try {
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $partnerOrg->database_name,
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

                if (!$conn->getSchemaBuilder()->hasTable('shared_resources')) continue;

                $row = $conn->table('shared_resources')
                    ->where('resource_type', 'project')
                    ->where('shared_by_organization_id', $staleResource->shared_by_organization_id)
                    ->where('shared_with_organization_id', $staleResource->shared_with_organization_id)
                    ->where('status', 'active')
                    ->latest()
                    ->first();

                if ($row) {
                    $sr = new SharedResource();
                    foreach ((array)$row as $k => $v) {
                        $sr->$k = $v;
                    }
                    $sr->setRelation('sharedByUser', null);
                    $sr->setRelation('users', collect());
                    Log::info("findCorrectSharedResourceInPartnerDbs: found correct project share id={$sr->id} resource_id={$sr->resource_id} in org={$partnerOrgId}");
                    return $sr;
                }
            } catch (\Throwable $e) {
                Log::warning("findCorrectSharedResourceInPartnerDbs: failed for org={$partnerOrgId}: " . $e->getMessage());
            } finally {
                DB::purge($connName);
            }
        }

        return null;
    }

    /**
     * Find tasks for shared projects that don't have their own SharedResource entries.
     * Checks BOTH the receiver's DB and the sender's DB (via cross-tenant connection).
     * Creates SharedResource entries on-the-fly so frontend navigation works.
     */
    /**
     * When a SharedResource entry doesn't exist for the given ID, check if there's a task
     * with that resource_id in any active shared project. If so, create the entry.
     */
    private function findOrCreateTaskSharedResource(int $possibleTaskId, $currentOrg): ?SharedResource
    {
        // Check if there's an active shared project for this org
        $sharedProjects = SharedResource::where('shared_with_organization_id', $currentOrg->id)
            ->where('resource_type', 'project')
            ->where('status', 'active')
            ->get();

        if ($sharedProjects->isEmpty()) return null;

        foreach ($sharedProjects as $projectShare) {
            // Check if there's already a SharedResource for this task under this project
            $existing = SharedResource::where('shared_with_organization_id', $currentOrg->id)
                ->where('resource_type', 'task')
                ->where('resource_id', $possibleTaskId)
                ->where('parent_resource_id', $projectShare->id)
                ->first();
            if ($existing) return $existing;
        }

        // Try to find a task with this ID in the sender's DB
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $sharerOrgs = [];

        foreach ($sharedProjects as $projectShare) {
            $sharerOrg = $this->getSharerOrg($projectShare->shared_by_organization_id, $sharerOrgs);
            if (!$sharerOrg || !$sharerOrg->database_name) continue;

            $connName = 'find_task_' . uniqid();
            try {
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $sharerOrg->database_name,
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

                $taskRow = $conn->table('tasks')->where('id', $possibleTaskId)->first();
                if ($taskRow) {
                    // Also check the receiver's own DB
                    $localTask = \App\Models\Task::find($possibleTaskId);

                    $taskTitle = $taskRow->title ?? ($localTask ? $localTask->title : null);
                    if (!$taskTitle) continue;

                    $newEntry = SharedResource::create([
                        'connection_id' => null,
                        'resource_type' => 'task',
                        'resource_id' => $possibleTaskId,
                        'resource_name' => $taskTitle,
                        'shared_by_organization_id' => $projectShare->shared_by_organization_id,
                        'shared_with_organization_id' => $currentOrg->id,
                        'shared_by_user_id' => $projectShare->shared_by_user_id ?? null,
                        'permission' => $projectShare->permission,
                        'can_download' => $projectShare->can_download ?? false,
                        'status' => 'active',
                        'shared_at' => $projectShare->shared_at ?? now(),
                        'parent_resource_id' => $projectShare->id,
                    ]);

                    return $newEntry;
                }
            } catch (\Throwable $e) {
                Log::warning("findOrCreateTaskSharedResource error: " . $e->getMessage());
            } finally {
                DB::purge($connName);
            }
        }

        // Also try the receiver's own DB
        $localTask = \App\Models\Task::find($possibleTaskId);
        if ($localTask) {
            foreach ($sharedProjects as $projectShare) {
                if ($localTask->project_id == $projectShare->resource_id) {
                    $newEntry = SharedResource::create([
                        'connection_id' => null,
                        'resource_type' => 'task',
                        'resource_id' => $possibleTaskId,
                        'resource_name' => $localTask->title,
                        'shared_by_organization_id' => $projectShare->shared_by_organization_id,
                        'shared_with_organization_id' => $currentOrg->id,
                        'shared_by_user_id' => $projectShare->shared_by_user_id ?? null,
                        'permission' => $projectShare->permission,
                        'can_download' => $projectShare->can_download ?? false,
                        'status' => 'active',
                        'shared_at' => $projectShare->shared_at ?? now(),
                        'parent_resource_id' => $projectShare->id,
                    ]);
                    return $newEntry;
                }
            }
        }

        return null;
    }

    private function getSharerOrg(int $orgId, array &$cache): ?\App\Models\Master\Organization
    {
        if (isset($cache[$orgId])) {
            return $cache[$orgId];
        }

        $org = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
        $cache[$orgId] = $org;

        return $org;
    }

    private function fetchActualResource(SharedResource $resource, ?\App\Models\Master\Organization $sharerOrg)
    {
        if (!$sharerOrg || !$sharerOrg->database_name) {
            Log::warning("fetchActualResource: sharerOrg is null or has no database_name. resource_id={$resource->id} shared_by_org_id={$resource->shared_by_organization_id}");
            return null;
        }

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'sharer_read_' . $sharerOrg->id . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $sharerOrg->database_name,
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

            $table = match ($resource->resource_type) {
                'project' => 'projects',
                'task' => 'tasks',
                'event' => 'events',
                'knowledge_base' => 'knowledge_bases',
                default => null,
            };

            if (!$table) return null;

            $row = $conn->table($table)->where('id', $resource->resource_id)->first();

            if (!$row) {
                Log::warning("fetchActualResource: row not found in sharer DB. table={$table} resource_id={$resource->resource_id} sharer_db={$sharerOrg->database_name}");
                return null;
            }

            $modelClass = match ($resource->resource_type) {
                'project' => \App\Models\Project::class,
                'task' => \App\Models\Task::class,
                'event' => \App\Models\Event::class,
                'knowledge_base' => \App\Models\KnowledgeBase::class,
                default => null,
            };

            if (!$modelClass) return null;

            $model = new $modelClass();
            foreach ((array) $row as $key => $value) {
                $model->$key = $value;
            }

            // For projects, load relationships from sharer's DB so frontend tabs work
            if ($resource->resource_type === 'project') {
                $projectId = $resource->resource_id;
                $sharerUserId = $resource->shared_by_user_id;

                // Load tasks with their assignees
                // Exclude self-tasks (assigned_by = assigned_to) - they are private to
                // their creator and must never be exposed to external organizations.
                $taskRows = $conn->table('tasks')->where('project_id', $projectId)
                    ->where(function ($q) {
                        $q->whereColumn('assigned_by', '!=', 'assigned_to')
                          ->orWhereNull('assigned_to');
                    })
                    ->orderBy('sort_order')->orderBy('created_at', 'desc')->get();
                $tasks = collect();
                foreach ($taskRows as $tRow) {
                    $task = new \App\Models\Task();
                    foreach ((array) $tRow as $k => $v) { $task->$k = $v; }

                    // Load assignees from pivot table
                    $assigneeIds = [];
                    if ($conn->getSchemaBuilder()->hasTable('task_user')) {
                        $pivotRows = $conn->table('task_user')->where('task_id', $tRow->id)->get();
                        $assigneeIds = $pivotRows->pluck('user_id')->toArray();
                    }
                    // Also include assigned_to
                    if ($tRow->assigned_to && !in_array($tRow->assigned_to, $assigneeIds)) {
                        $assigneeIds[] = $tRow->assigned_to;
                    }
                    $assignees = collect();
                    if (!empty($assigneeIds)) {
                        $userRows = $conn->table('users')->whereIn('id', $assigneeIds)->get();
                        foreach ($userRows as $uRow) {
                            $assignees->push((array)$uRow);
                        }
                    }

                    // Resolve cross-org assignee if task has external assignment
                    if (!empty($tRow->assigned_to_org_id) && !empty($tRow->assigned_to_external_id) && $assignees->isEmpty()) {
                        try {
                            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
                            $extOrg = \App\Models\Master\Organization::on('mysql_master')->find($tRow->assigned_to_org_id);
                            if ($extOrg && !empty($extOrg->database_name)) {
                                $xconnName = 'xorg_sharing_' . $extOrg->id . '_' . uniqid();
                                config()->set("database.connections.{$xconnName}", [
                                    'driver'    => 'mysql',
                                    'host'      => $masterConfig['host'],
                                    'port'      => $masterConfig['port'],
                                    'database'  => $extOrg->database_name,
                                    'username'  => $masterConfig['username'],
                                    'password'  => $masterConfig['password'] ?? '',
                                    'charset'   => 'utf8mb4',
                                    'collation' => 'utf8mb4_unicode_ci',
                                ]);
                                DB::purge($xconnName);
                                $xconn = DB::connection($xconnName);
                                $extUser = $xconn->table('users')->where('id', $tRow->assigned_to_external_id)
                                    ->select('id', 'name', 'email', 'role')->first();
                                if ($extUser) {
                                    $assignees->push((array) [
                                        'id' => (int) $extUser->id,
                                        'name' => $extUser->name,
                                        'email' => $extUser->email,
                                        'role' => $extUser->role,
                                        'org_name' => $extOrg->name,
                                        'is_external' => true,
                                    ]);
                                }
                                DB::purge($xconnName);
                            }
                        } catch (\Throwable $e) {
                            \Log::warning("SharingController: cross-org assignee resolve failed: " . $e->getMessage());
                        }
                    }

                    $task->assignees = $assignees->values();

                    // Load assigner (assigned_by user) from sharer's DB
                    if ($tRow->assigned_by) {
                        $assignerRow = $conn->table('users')->where('id', $tRow->assigned_by)->first();
                        $task->assigner = $assignerRow ? (array)$assignerRow : null;
                    } else {
                        $task->assigner = null;
                    }

                    // Load creator
                    if ($tRow->creator_id) {
                        $creatorRow = $conn->table('users')->where('id', $tRow->creator_id)->first();
                        $task->creator = $creatorRow ? (array)$creatorRow : null;
                    }

                    // Self-task check: a task where the assigner is also an assignee
                    // is private to its creator and must NEVER be exposed to external orgs.
                    // This uses resolved emails (not raw IDs) to correctly identify
                    // self-tasks across different tenant databases.
                    $assignerEmail = strtolower($task->assigner['email'] ?? '');
                    $assigneeEmails = $assignees->pluck('email')->map(fn($e) => strtolower((string)$e))->values()->toArray();
                    if (!empty($assignerEmail) && in_array($assignerEmail, $assigneeEmails)) {
                        continue; // Skip self-task
                    }

                    $tasks->push($task);
                }
                $model->setRelation('tasks', $tasks);

                // Ensure SharedResource entries exist for loaded tasks so frontend navigation works
                // Also tag each task with its SharedResource ID so frontend can use it
                try {
                    foreach ($tasks as $task) {
                        $existingEntry = SharedResource::where('shared_with_organization_id', $resource->shared_with_organization_id)
                            ->where('resource_type', 'task')
                            ->where('resource_id', $task->id)
                            ->where('status', 'active')
                            ->first();
                        if (!$existingEntry) {
                            $existingEntry = SharedResource::create([
                                'connection_id' => null,
                                'resource_type' => 'task',
                                'resource_id' => $task->id,
                                'resource_name' => $task->title ?? 'Untitled',
                                'shared_by_organization_id' => $resource->shared_by_organization_id,
                                'shared_with_organization_id' => $resource->shared_with_organization_id,
                                'shared_by_user_id' => $resource->shared_by_user_id ?? null,
                                'permission' => $resource->permission,
                                'can_download' => $resource->can_download ?? false,
                                'status' => 'active',
                                'shared_at' => $resource->shared_at,
                                'parent_resource_id' => $resource->id,
                            ]);
                        }
                        $task->shared_resource_id = $existingEntry->id;
                    }
                } catch (\Throwable $e) {
                    Log::warning("Failed to ensure task shared entries: " . $e->getMessage());
                }

                // Load project files
                if ($conn->getSchemaBuilder()->hasTable('project_files')) {
                    $fileRows = $conn->table('project_files')->where('project_id', $projectId)->orderBy('sort_order')->get();
                    $model->setRelation('files', $fileRows);
                } else {
                    $model->setRelation('files', collect());
                }

                // Load members (assigned_users are stored as JSON array of user IDs)
                $assignedUserIds = is_array($model->assigned_users) ? $model->assigned_users : (json_decode($model->assigned_users, true) ?? []);
                $members = collect();
                if (!empty($assignedUserIds)) {
                    $userRows = $conn->table('users')->whereIn('id', $assignedUserIds)->get();
                    foreach ($userRows as $uRow) {
                        $uData = (array)$uRow;
                        $uData['organization_id'] = $resource->shared_by_organization_id;
                        $members->push($uData);
                    }
                }
                // Add creator as member
                if ($model->created_by) {
                    $creatorRow = $conn->table('users')->where('id', $model->created_by)->first();
                    if ($creatorRow) {
                        $creatorData = (array)$creatorRow;
                        $creatorData['organization_id'] = $resource->shared_by_organization_id;
                        if (!$members->contains('id', $model->created_by)) {
                            $members->push($creatorData);
                        }
                        $model->creator = $creatorData;
                    }
                }
                // Merge shared_project_members from both local AND partner org DBs
                try {
                    $currentOrg = request()->attributes->get('currentOrganization');
                    $currentOrgId = $currentOrg?->id ?? null;
                    if ($currentOrgId) {
                        $partnerOrgId = ($resource->shared_by_organization_id == $currentOrgId)
                            ? $resource->shared_with_organization_id
                            : $resource->shared_by_organization_id;

                        // 1) Load from local DB's shared_project_members linked to this resource's mirror
                        // Note: local SPM members have user_id from current org's DB, resolve from current org's DB
                        $localMirrorId = null;
                        if (method_exists($this, 'findLocalMirrorId')) {
                            $localMirrorId = $this->findLocalMirrorId($resource, $currentOrgId);
                        }
                        if ($localMirrorId && DB::getSchemaBuilder()->hasTable('shared_project_members')) {
                            $localSpm = \App\Models\SharedProjectMember::where('shared_resource_id', $localMirrorId)->get();
                            foreach ($localSpm as $spm) {
                                $userId = (int) $spm->user_id;
                                if ($members->contains('id', $userId)) continue;
                                // Resolve from current org's DB (default connection), not sharer's DB
                                $userRow = DB::table('users')->where('id', $userId)->select('id', 'name', 'email', 'role', 'department')->first();
                                if ($userRow) {
                                    $uData = (array)$userRow;
                                    $uData['organization_id'] = $spm->organization_id;
                                    $uData['is_shared_member'] = true;
                                    $uData['is_external'] = ($spm->organization_id != $resource->shared_by_organization_id);
                                    $members->push($uData);
                                }
                            }
                        }

                        // 2) Load from partner org's shared_project_members
                        if ($partnerOrgId) {
                            $partnerOrg = \App\Models\Master\Organization::on('mysql_master')->find($partnerOrgId);
                            if ($partnerOrg && $partnerOrg->database_name) {
                                $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
                                $spmConnName = 'fetch_spm_' . $partnerOrgId . '_' . uniqid();
                                try {
                                    config()->set("database.connections.{$spmConnName}", [
                                        'driver'    => 'mysql',
                                        'host'      => $masterConfig['host'],
                                        'port'      => $masterConfig['port'],
                                        'database'  => $partnerOrg->database_name,
                                        'username'  => $masterConfig['username'],
                                        'password'  => $masterConfig['password'] ?? '',
                                        'charset'   => 'utf8mb4',
                                        'collation' => 'utf8mb4_unicode_ci',
                                        'prefix'    => '',
                                        'prefix_indexes' => false,
                                        'strict'    => true,
                                        'engine'    => null,
                                    ]);
                                    DB::purge($spmConnName);
                                    $spmConn = DB::connection($spmConnName);

                                    if ($spmConn->getSchemaBuilder()->hasTable('shared_resources') && $spmConn->getSchemaBuilder()->hasTable('shared_project_members')) {
                                        $partnerMirrorIds = $spmConn->table('shared_resources')
                                            ->where('resource_type', 'project')
                                            ->where('resource_id', $projectId)
                                            ->where('status', 'active')
                                            ->pluck('id');
                                        if ($partnerMirrorIds->isNotEmpty()) {
                                            $partnerSpmRows = $spmConn->table('shared_project_members')
                                                ->whereIn('shared_resource_id', $partnerMirrorIds)
                                                ->get();
                                            foreach ($partnerSpmRows as $spmRow) {
                                                $userId = (int) $spmRow->user_id;
                                                $spmOrgId = (int) $spmRow->organization_id;
                                                $dedupKey = $userId . ':' . $spmOrgId;
                                                if ($members->contains('id', $userId)) continue;
                                                $userRow = $spmConn->table('users')->where('id', $userId)->select('id', 'name', 'email', 'role', 'department')->first();
                                                if ($userRow) {
                                                    $uData = (array)$userRow;
                                                    $uData['organization_id'] = $spmOrgId;
                                                    $uData['is_shared_member'] = true;
                                                    $uData['is_external'] = ($spmOrgId != $resource->shared_by_organization_id);
                                                    $members->push($uData);
                                                }
                                            }
                                        }
                                    }
                                } catch (\Throwable $e) {
                                    Log::warning("fetchActualResource: failed to load partner shared_project_members: " . $e->getMessage());
                                } finally {
                                    DB::purge($spmConnName);
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    Log::warning("fetchActualResource: failed to merge shared_project_members: " . $e->getMessage());
                }

                $model->setRelation('members', $members->values());

                // Load access credentials with assigned_users
                if ($conn->getSchemaBuilder()->hasTable('project_access_credentials')) {
                    $credRows = $conn->table('project_access_credentials')->where('project_id', $projectId)->get();
                    $credentials = collect();
                    foreach ($credRows as $credRow) {
                        $credArr = (array)$credRow;
                        // Decrypt password
                        try {
                            $credArr['password'] = \Illuminate\Support\Facades\Crypt::decryptString($credRow->password);
                        } catch (\Exception $e) {
                            $credArr['password'] = '';
                        }
                        // Load assigned_users from pivot table
                        $credArr['assigned_users'] = [];
                        if ($conn->getSchemaBuilder()->hasTable('project_access_credential_user')) {
                            $credUserIds = $conn->table('project_access_credential_user')->where('credential_id', $credRow->id)->pluck('user_id')->toArray();
                            if (!empty($credUserIds)) {
                                $credUsers = $conn->table('users')->whereIn('id', $credUserIds)->get();
                                $credArr['assigned_users'] = $credUsers->map(fn($u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email])->values()->all();
                            }
                        }
                        $credentials->push($credArr);
                    }
                    $model->setRelation('accessCredentials', $credentials);
                } else {
                    $model->setRelation('accessCredentials', collect());
                }

                // Load deliverables — exclude self-assigned subtasks
                if ($conn->getSchemaBuilder()->hasTable('deliverables')) {
                    $delRows = $conn->table('deliverables')->where('project_id', $projectId)
                        ->where(function ($q) use ($sharerUserId) {
                            if ($sharerUserId) {
                                // NOT (created_by = me AND assigned_to = me)
                                $q->where('created_by', '!=', $sharerUserId)
                                  ->orWhere('assigned_to', '!=', $sharerUserId);
                            }
                        })->get();
                    $deliverables = collect();
                    foreach ($delRows as $dRow) {
                        $del = new \App\Models\Deliverable();
                        foreach ((array)$dRow as $k => $v) { $del->$k = $v; }
                        $deliverables->push($del);
                    }
                    $model->setRelation('deliverables', $deliverables);
                } else {
                    $model->setRelation('deliverables', collect());
                }

                // Load milestones
                if ($conn->getSchemaBuilder()->hasTable('project_milestones')) {
                    $msRows = $conn->table('project_milestones')->where('project_id', $projectId)->orderBy('sort_order')->get();
                    $model->setRelation('milestones', $msRows);
                } else {
                    $model->setRelation('milestones', collect());
                }

                // Compute task counts
                $totalTasks = $tasks->count();
                $completedTasks = $tasks->filter(fn($t) => in_array($t->status ?? '', ['approved', 'completed', 'done']))->count();
                $model->total_tasks = $totalTasks;
                $model->completed_tasks = $completedTasks;

                // Load knowledge base articles linked to this project
                if ($conn->getSchemaBuilder()->hasTable('knowledge_bases')) {
                    $kbRows = $conn->table('knowledge_bases')->where('project_id', $projectId)->get();
                    $kbArticles = collect();
                    foreach ($kbRows as $kbRow) {
                        $kbArticles->push((array)$kbRow);
                    }
                    // Also load KB linked via project's kb_ids JSON field
                    $kbIds = is_array($model->kb_ids) ? $model->kb_ids : (json_decode($model->kb_ids, true) ?? []);
                    if (!empty($kbIds)) {
                        $extraKb = $conn->table('knowledge_bases')->whereIn('id', $kbIds)->get();
                        foreach ($extraKb as $ekb) {
                            $ekbArr = (array)$ekb;
                            if (!$kbArticles->contains('id', $ekbArr['id'] ?? null)) {
                                $kbArticles->push($ekbArr);
                            }
                        }
                    }
                    $model->setRelation('projectKbArticles', $kbArticles->values());
                } else {
                    $model->setRelation('projectKbArticles', collect());
                }

                // Load events linked to this project
                if ($conn->getSchemaBuilder()->hasTable('events')) {
                    $eventRows = $conn->table('events')->where('project_id', $projectId)->get();
                    $events = collect();
                    foreach ($eventRows as $eRow) {
                        $events->push((array)$eRow);
                    }
                    // Also load events linked via project's event_ids JSON field
                    $eventIds = is_array($model->event_ids) ? $model->event_ids : (json_decode($model->event_ids, true) ?? []);
                    if (!empty($eventIds)) {
                        $extraEvents = $conn->table('events')->whereIn('id', $eventIds)->get();
                        foreach ($extraEvents as $ee) {
                            $eeArr = (array)$ee;
                            if (!$events->contains('id', $eeArr['id'] ?? null)) {
                                $events->push($eeArr);
                            }
                        }
                    }
                    $model->setRelation('projectEvents', $events->values());
                } else {
                    $model->setRelation('projectEvents', collect());
                }
            }

            return $model;
        } catch (\Throwable $e) {
            Log::warning("Failed to fetch shared resource from sharer DB: " . $e->getMessage());
            // Don't fall back to local DB - cross-tenant resources don't exist there
            return null;
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * GET /api/sharing/shared-by-resource/{resourceType}/{resourceId}
     * Get all active shares for a specific resource.
     * Used by the Share/Edit modal to show which orgs already have access.
     */
    public function getExistingShares(Request $request, string $resourceType, int $resourceId): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        \Log::info('getExistingShares: Querying', [
            'org_id' => $currentOrg->id,
            'resource_type' => $resourceType,
            'resource_id' => $resourceId,
            'db' => config('database.connections.mysql.database'),
        ]);

        $shares = SharedResource::where('resource_type', $resourceType)
            ->where('resource_id', $resourceId)
            ->where('shared_by_organization_id', $currentOrg->id)
            ->where('status', 'active')
            ->with(['sharedByUser:id,name', 'users.user:id,name'])
            ->get();

        \Log::info('getExistingShares: Found', ['count' => $shares->count()]);

        $enriched = $shares->map(function ($share) {
            // Resolve the receiving org from master DB
            $receivingOrg = \App\Models\Master\Organization::on('mysql_master')
                ->find($share->shared_with_organization_id);

            return [
                'id' => $share->id,
                'connection_id' => $share->connection_id,
                'permission' => $share->permission,
                'can_download' => $share->can_download,
                'status' => $share->status,
                'notes' => $share->notes,
                'shared_at' => $share->shared_at,
                'expires_at' => $share->expires_at,
                'is_view_only' => $share->expires_at && $share->expires_at->isPast(),
                'shared_with_organization' => $receivingOrg ? [
                    'id' => $receivingOrg->id,
                    'name' => $receivingOrg->name,
                    'organization_code' => $receivingOrg->organization_code,
                    'logo_path' => $receivingOrg->logo_path,
                ] : null,
                'shared_by_user' => $share->sharedByUser ? [
                    'id' => $share->sharedByUser->id,
                    'name' => $share->sharedByUser->name,
                ] : null,
                'users' => $share->users->map(fn($su) => [
                    'id' => $su->id,
                    'user' => $su->user ? ['id' => $su->user->id, 'name' => $su->user->name] : null,
                    'permission_override' => $su->permission_override,
                ]),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $enriched,
        ]);
    }

    /**
     * GET /api/sharing/check-access
     * Check if the current user has access to a shared resource.
     */
    public function checkAccess(Request $request): JsonResponse
    {
        $request->validate([
            'resource_type' => 'required|string',
            'resource_id'   => 'required|integer',
        ]);

        $user = $request->user();

        $sharedResource = $this->sharingService->checkAccess(
            userId: $user->id,
            resourceType: $request->input('resource_type'),
            resourceId: $request->input('resource_id')
        );

        return response()->json([
            'success' => true,
            'data' => [
                'has_access' => $sharedResource !== null,
                'permission' => $sharedResource?->permission,
                'can_download' => $sharedResource?->can_download,
                'expires_at' => $sharedResource?->expires_at,
            ],
        ]);
    }

    /**
     * PUT /api/sharing/resources/{id}/project
     * Edit a shared project's details (title, description, etc.) when collaborate permission.
     * Updates the actual project in the sharer's database.
     */
    public function updateSharedProject(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $currentOrgId = $user->organization_id ?? $user->org_id ?? null;

        $sharedResource = SharedResource::where('id', $id)
            ->where('shared_with_organization_id', $currentOrgId)
            ->where('permission', 'collaborate')
            ->where('status', 'active')
            ->first();

        if (!$sharedResource) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($id, $request->attributes->get('currentOrganization'));
        }

        if (!$sharedResource || $sharedResource->permission !== 'collaborate') {
            return response()->json(['success' => false, 'message' => 'Not authorized to edit this project.'], 403);
        }

        $sharerOrg = \App\Models\Master\Organization::on('mysql_master')->find($sharedResource->shared_by_organization_id);
        if (!$sharerOrg || !$sharerOrg->database_name) {
            return response()->json(['success' => false, 'message' => 'Partner organization not found.'], 404);
        }

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'priority' => 'sometimes|string',
            'start_date' => 'sometimes|date|nullable',
            'end_date' => 'sometimes|date|nullable',
            'budget' => 'sometimes|numeric|nullable',
            'client_name' => 'sometimes|string|nullable',
            'status' => 'sometimes|string',
        ]);

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'shared_proj_edit_' . $id . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $sharerOrg->database_name,
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

            $conn->table('projects')
                ->where('id', $sharedResource->resource_id)
                ->update($validated);

            try {
                SharedResourceActivityLog::create([
                    'connection_id'       => $sharedResource->connection_id,
                    'shared_resource_id'  => $sharedResource->id,
                    'organization_id'     => $currentOrgId,
                    'user_id'             => $user->id,
                    'action'              => 'resource_modified',
                    'resource_type'       => 'project',
                    'resource_id'         => $sharedResource->resource_id,
                    'details'             => ['modified_fields' => array_keys($validated)],
                    'ip_address'          => $request->ip(),
                    'acted_at'            => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning("Activity log failed (updateSharedProject): " . $e->getMessage());
            }

            return response()->json(['success' => true, 'message' => 'Project updated successfully.']);
        } catch (\Throwable $e) {
            Log::warning('Failed to update shared project: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to update project.'], 500);
        } finally {
            DB::purge($connName);
        }
    }

    /**
     * GET /api/sharing/resources/{id}/members
     * Get all members for a shared project (original members + shared_project_members).
     */
    public function getSharedProjectMembers(Request $request, int $id): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $sharedResource = $this->resolveSharedResource($id, $currentOrg);

        \Log::info('[getSharedProjectMembers] Resolved SharedResource', [
            'id' => $id,
            'current_org_id' => $currentOrg?->id,
            'resolved' => $sharedResource ? true : false,
            'sr_id' => $sharedResource?->id,
            'sr_shared_by' => $sharedResource?->shared_by_organization_id,
            'sr_shared_with' => $sharedResource?->shared_with_organization_id,
            'sr_resource_id' => $sharedResource?->resource_id,
        ]);

        if (!$sharedResource) {
            return response()->json(['members' => [], 'shared_members' => []]);
        }

        $localMirrorId = $this->findLocalMirrorId($sharedResource, $currentOrg->id);

        $sharerOrg = \App\Models\Master\Organization::on('mysql_master')->find($sharedResource->shared_by_organization_id);
        $originalMembers = [];

        \Log::info('[getSharedProjectMembers] Sharer info', [
            'local_mirror_id' => $localMirrorId,
            'sharer_org_id' => $sharerOrg?->id,
            'sharer_db' => $sharerOrg?->database_name,
            'resource_id' => $sharedResource->resource_id,
        ]);

        // Fetch original project members from sharer's DB
        if ($sharerOrg && $sharerOrg->database_name) {
            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
            $connName = 'shared_proj_members_' . $id . '_' . uniqid();
            try {
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $sharerOrg->database_name,
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

                $project = $conn->table('projects')->where('id', $sharedResource->resource_id)->first();

                \Log::info('[getSharedProjectMembers] Sharer project lookup', [
                    'resource_id' => $sharedResource->resource_id,
                    'project_found' => $project ? true : false,
                    'assigned_users' => $project->assigned_users ?? null,
                    'created_by' => $project->created_by ?? null,
                ]);

                if ($project) {
                    $memberIds = json_decode($project->assigned_users ?? '[]', true) ?? [];
                    if ($project->created_by) {
                        $memberIds[] = $project->created_by;
                    }
                    $memberIds = array_unique(array_filter($memberIds));

                    \Log::info('[getSharedProjectMembers] Original member IDs', ['member_ids' => $memberIds]);

                    if (!empty($memberIds)) {
                        $originalMembers = $conn->table('users')
                            ->whereIn('id', $memberIds)
                            ->where('active', true)
                            ->select('id', 'name', 'email', 'role', 'department')
                            ->orderBy('name')
                            ->get()
                            ->map(fn ($u) => [
                                'id' => $u->id,
                                'name' => $u->name,
                                'email' => $u->email,
                                'role' => $u->role,
                                'department' => $u->department,
                                'org_name' => $sharerOrg->name,
                                'org_id' => $sharerOrg->id,
                                'is_external' => ($sharerOrg->id != $currentOrg->id),
                                'source' => 'original',
                            ])
                            ->toArray();

                        \Log::info('[getSharedProjectMembers] Original members resolved', [
                            'count' => count($originalMembers),
                            'names' => array_map(fn($m) => $m['name'], $originalMembers),
                        ]);
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch original project members: ' . $e->getMessage());
            } finally {
                DB::purge($connName);
            }
        }

        // Fetch shared_project_members from both local AND partner org mirrors
        $sharedMembers = [];
        try {
            $partnerOrgId = ($sharedResource->shared_by_organization_id == $currentOrg->id)
                ? $sharedResource->shared_with_organization_id
                : $sharedResource->shared_by_organization_id;
            $partnerOrg = \App\Models\Master\Organization::on('mysql_master')->find($partnerOrgId);

            // 1) Query current org's DB for shared_project_members linked to local mirror
            $allMembersCollection = collect();
            try {
                $hasSpmTable = DB::getSchemaBuilder()->hasTable('shared_project_members');
                \Log::info('[getSharedProjectMembers] Local SPM check', [
                    'local_mirror_id' => $localMirrorId,
                    'has_spm_table' => $hasSpmTable,
                ]);
                if ($hasSpmTable) {
                    $localSpm = \App\Models\SharedProjectMember::where('shared_resource_id', $localMirrorId)->get();
                    \Log::info('[getSharedProjectMembers] Local SPM results', [
                        'count' => $localSpm->count(),
                        'user_ids' => $localSpm->pluck('user_id')->toArray(),
                        'org_ids' => $localSpm->pluck('organization_id')->toArray(),
                    ]);
                    $allMembersCollection = $allMembersCollection->concat($localSpm);
                }
            } catch (\Throwable $e) {
                \Log::warning('[getSharedProjectMembers] Local SPM query failed', ['error' => $e->getMessage()]);
            }

            \Log::info('[getSharedProjectMembers] Partner SPM lookup', [
                'partner_org_id' => $partnerOrgId,
                'partner_db' => $partnerOrg?->database_name,
            ]);

            // 2) Query partner org's DB directly for shared_project_members linked to partner's mirror
            if ($partnerOrg && $partnerOrg->database_name) {
                $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
                $partnerConnName = 'spm_partner_' . $partnerOrg->id . '_' . uniqid();
                try {
                    config()->set("database.connections.{$partnerConnName}", [
                        'driver'    => 'mysql',
                        'host'      => $masterConfig['host'],
                        'port'      => $masterConfig['port'],
                        'database'  => $partnerOrg->database_name,
                        'username'  => $masterConfig['username'],
                        'password'  => $masterConfig['password'] ?? '',
                        'charset'   => 'utf8mb4',
                        'collation' => 'utf8mb4_unicode_ci',
                        'prefix'    => '',
                        'prefix_indexes' => false,
                        'strict'    => true,
                        'engine'    => null,
                    ]);
                    DB::purge($partnerConnName);
                    $pConn = DB::connection($partnerConnName);

                    $hasSrTable = $pConn->getSchemaBuilder()->hasTable('shared_resources');
                    $hasSpmTableP = $pConn->getSchemaBuilder()->hasTable('shared_project_members');
                    \Log::info('[getSharedProjectMembers] Partner DB tables', [
                        'has_shared_resources' => $hasSrTable,
                        'has_shared_project_members' => $hasSpmTableP,
                    ]);

                    if ($hasSrTable && $hasSpmTableP) {
                        // Use ALL matching mirror IDs to handle duplicate shared_resources records
                        $partnerMirrorIds = $pConn->table('shared_resources')
                            ->where('resource_type', $sharedResource->resource_type)
                            ->where('resource_id', $sharedResource->resource_id)
                            ->where('status', 'active')
                            ->pluck('id');

                        \Log::info('[getSharedProjectMembers] Partner mirror lookup', [
                            'resource_type' => $sharedResource->resource_type,
                            'resource_id' => $sharedResource->resource_id,
                            'mirror_count' => $partnerMirrorIds->count(),
                            'mirror_ids' => $partnerMirrorIds->toArray(),
                        ]);

                        if ($partnerMirrorIds->isNotEmpty()) {
                            $partnerSpmRows = $pConn->table('shared_project_members')
                                ->whereIn('shared_resource_id', $partnerMirrorIds)
                                ->get();

                            \Log::info('[getSharedProjectMembers] Partner SPM results', [
                                'mirror_ids' => $partnerMirrorIds->toArray(),
                                'spm_count' => $partnerSpmRows->count(),
                                'spm_user_ids' => $partnerSpmRows->pluck('user_id')->toArray(),
                            ]);

                            foreach ($partnerSpmRows as $row) {
                                $allMembersCollection->push((object) [
                                    'id' => $row->id,
                                    'shared_resource_id' => $row->shared_resource_id,
                                    'user_id' => $row->user_id,
                                    'organization_id' => $row->organization_id,
                                    'added_by' => $row->added_by ?? null,
                                    'created_at' => $row->created_at ?? null,
                                ]);
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    Log::warning("getSharedProjectMembers: failed to query partner org {$partnerOrgId} shared_project_members: " . $e->getMessage());
                } finally {
                    DB::purge($partnerConnName);
                }
            }

            \Log::info('[getSharedProjectMembers] Pre-dedup collection', [
                'total' => $allMembersCollection->count(),
                'entries' => $allMembersCollection->map(fn($s) => ['user_id' => $s->user_id ?? null, 'org_id' => $s->organization_id ?? null])->toArray(),
            ]);

            // Deduplicate by (user_id + organization_id)
            $seen = [];
            $allMembersCollection = $allMembersCollection->filter(function ($spm) use (&$seen) {
                $key = $spm->user_id . '_' . $spm->organization_id;
                if (isset($seen[$key])) return false;
                $seen[$key] = true;
                return true;
            });

            // Delete stale records where user_id doesn't exist in the member's org (local only)
            foreach ($allMembersCollection as $spm) {
                // Only delete stale records from the current org's DB
                if (isset($spm->organization_id) && (int) $spm->organization_id !== (int) $currentOrg->id) continue;
                if (!isset($spm->id)) continue;
                try {
                    $memberOrg = \App\Models\Master\Organization::on('mysql_master')->find($spm->organization_id);
                    if ($memberOrg && $memberOrg->database_name) {
                        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
                        $checkConn = 'check_stale_' . $spm->id . '_' . uniqid();
                        try {
                            config()->set("database.connections.{$checkConn}", [
                                'driver'    => 'mysql',
                                'host'      => $masterConfig['host'],
                                'port'      => $masterConfig['port'],
                                'database'  => $memberOrg->database_name,
                                'username'  => $masterConfig['username'],
                                'password'  => $masterConfig['password'] ?? '',
                                'charset'   => 'utf8mb4',
                                'collation' => 'utf8mb4_unicode_ci',
                                'prefix'    => '',
                                'prefix_indexes' => false,
                                'strict'    => true,
                                'engine'    => null,
                            ]);
                            DB::purge($checkConn);
                            $userExists = DB::connection($checkConn)
                                ->table('users')->where('id', $spm->user_id)->exists();
                            if (!$userExists) {
                                Log::info('Removing stale shared_project_member (user not in org)', [
                                    'id' => $spm->id, 'user_id' => $spm->user_id, 'organization_id' => $spm->organization_id,
                                ]);
                                $spm->delete();
                            }
                        } catch (\Throwable $e) {
                            // Skip stale check on error
                        } finally {
                            DB::purge($checkConn);
                        }
                    }
                } catch (\Throwable $e) {
                    // Skip stale check on error
                }
            }

            $sharedMembers = $allMembersCollection
                ->map(function ($spm) use ($currentOrg) {
                    $org = \App\Models\Master\Organization::on('mysql_master')->find($spm->organization_id);
                    return [
                        'id' => $spm->user_id,
                        'name' => null,
                        'email' => null,
                        'role' => null,
                        'department' => null,
                        'org_name' => $org?->name ?? 'Unknown',
                        'org_id' => $spm->organization_id,
                        'is_external' => $spm->organization_id != $currentOrg->id,
                        'source' => 'added',
                        'shared_member_id' => $spm->id,
                    ];
                })
                ->toArray();
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch shared project members: ' . $e->getMessage());
        }

        \Log::info('[getSharedProjectMembers] Pre-resolution shared_members', [
            'count' => count($sharedMembers),
            'entries' => array_map(fn($sm) => ['user_id' => $sm['id'], 'org_id' => $sm['org_id'], 'name' => $sm['name']], $sharedMembers),
        ]);

        // Resolve user details for shared_project_members from their respective org DBs
        $orgUserCache = [];
        foreach ($sharedMembers as &$sm) {
            if ($sm['name'] !== null) continue;
            $orgId = $sm['org_id'];
            if (!isset($orgUserCache[$orgId])) {
                $orgUserCache[$orgId] = [];
                $org = \App\Models\Master\Organization::on('mysql_master')->find($orgId);
                if ($org && $org->database_name) {
                    $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
                    $connName = 'shared_member_resolve_' . $orgId . '_' . uniqid();
                    try {
                        config()->set("database.connections.{$connName}", [
                            'driver'    => 'mysql',
                            'host'      => $masterConfig['host'],
                            'port'      => $masterConfig['port'],
                            'database'  => $org->database_name,
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
                        $users = $conn->table('users')
                            ->where('active', true)
                            ->select('id', 'name', 'email', 'role', 'department')
                            ->get();
                        foreach ($users as $u) {
                            $orgUserCache[$orgId][$u->id] = [
                                'name' => $u->name,
                                'email' => $u->email,
                                'role' => $u->role,
                                'department' => $u->department,
                            ];
                        }
                        \Log::info('[getSharedProjectMembers] Resolved users', [
                            'org_id' => $orgId,
                            'user_ids_in_cache' => array_keys($orgUserCache[$orgId]),
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning("Failed to resolve users for org {$orgId}: " . $e->getMessage());
                    } finally {
                        DB::purge($connName);
                    }
                }
            }
            if (isset($orgUserCache[$orgId][$sm['id']])) {
                $u = $orgUserCache[$orgId][$sm['id']];
                $sm['name'] = $u['name'];
                $sm['email'] = $u['email'];
                $sm['role'] = $u['role'];
                $sm['department'] = $u['department'];
            } else {
                \Log::info('[getSharedProjectMembers] User not found in cache', ['user_id' => $sm['id'], 'org_id' => $orgId]);
            }
        }
        unset($sm);

        \Log::info('[getSharedProjectMembers] Final response', [
            'original_count' => count($originalMembers),
            'shared_count' => count($sharedMembers),
            'original_names' => array_map(fn($m) => $m['name'], $originalMembers),
            'shared_names' => array_map(fn($m) => $m['name'], $sharedMembers),
        ]);

        return response()->json([
            'members' => $originalMembers,
            'shared_members' => $sharedMembers,
            'permission' => $sharedResource->permission,
            'shared_resource_id' => $localMirrorId,
        ]);
    }

    /**
     * POST /api/sharing/resources/{id}/members
     * Add members to a shared project (collaborate permission).
     */
    public function addSharedProjectMembers(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $currentOrg = $request->attributes->get('currentOrganization');
        $currentOrgId = $currentOrg?->id ?? $user->organization_id ?? $user->org_id ?? null;

        if (!$currentOrgId) {
            return response()->json(['success' => false, 'message' => 'Organization not resolved.'], 400);
        }

        $sharedResource = SharedResource::where('id', $id)
            ->where('permission', 'collaborate')
            ->where('status', 'active')
            ->where(function ($q) use ($currentOrgId) {
                $q->where('shared_with_organization_id', $currentOrgId)
                  ->orWhere('shared_by_organization_id', $currentOrgId);
            })
            ->first();

        if (!$sharedResource && $currentOrg) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($id, $currentOrg);
        }

        if (!$sharedResource || $sharedResource->permission !== 'collaborate' || $sharedResource->status !== 'active') {
            return response()->json(['success' => false, 'message' => 'Not authorized.'], 403);
        }

        $localMirrorId = $this->findLocalMirrorId($sharedResource, $currentOrgId);

        $validated = $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'integer',
        ]);

        $mirrorExists = SharedResource::where('id', $localMirrorId)->first();
        if (!$mirrorExists) {
            return response()->json([
                'success' => false,
                'message' => 'Shared resource mirror not found in your database (ID: ' . $localMirrorId . '). Please refresh and try again.',
            ], 422);
        }

        $tableExists = DB::getSchemaBuilder()->hasTable('shared_project_members');
        if (!$tableExists) {
            return response()->json([
                'success' => false,
                'message' => 'Shared project members table not found. Please contact support.',
            ], 500);
        }

        // Verify user_ids belong to current org
        $validUserIds = [];
        if ($currentOrg && $currentOrg->database_name) {
            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
            $verifyConn = 'verify_add_users_' . uniqid();
            try {
                config()->set("database.connections.{$verifyConn}", [
                    'driver'    => 'mysql',
                    'host'      => $masterConfig['host'],
                    'port'      => $masterConfig['port'],
                    'database'  => $currentOrg->database_name,
                    'username'  => $masterConfig['username'],
                    'password'  => $masterConfig['password'] ?? '',
                    'charset'   => 'utf8mb4',
                    'collation' => 'utf8mb4_unicode_ci',
                    'prefix'    => '',
                    'prefix_indexes' => false,
                    'strict'    => true,
                    'engine'    => null,
                ]);
                DB::purge($verifyConn);
                $validUserIds = DB::connection($verifyConn)
                    ->table('users')
                    ->whereIn('id', $validated['user_ids'])
                    ->pluck('id')
                    ->map(fn($id) => (int) $id)
                    ->toArray();
            } catch (\Throwable $e) {
                Log::warning('Failed to verify user IDs: ' . $e->getMessage());
            } finally {
                DB::purge($verifyConn);
            }
        }

        $added = [];
        $skipped = [];
        $errors = [];
        foreach ($validated['user_ids'] as $userId) {
            if (!in_array($userId, $validUserIds)) {
                $errors[] = "User ID {$userId} is not a member of your organization";
                continue;
            }

            $existing = \App\Models\SharedProjectMember::where('shared_resource_id', $localMirrorId)
                ->where('user_id', $userId)
                ->where('organization_id', $currentOrgId)
                ->first();

            if ($existing) {
                $skipped[] = $userId;
            } else {
                try {
                    $member = \App\Models\SharedProjectMember::create([
                        'shared_resource_id' => $localMirrorId,
                        'user_id' => $userId,
                        'organization_id' => $currentOrgId,
                        'added_by' => $user->id,
                    ]);
                    $added[] = $member;
                } catch (\Throwable $e) {
                    Log::warning('addSharedProjectMembers: failed to create member', [
                        'user_id' => $userId,
                        'shared_resource_id' => $localMirrorId,
                        'error' => $e->getMessage(),
                    ]);
                    $errors[] = "User {$userId}: " . $e->getMessage();
                }
            }
        }

        if (count($added) > 0) {
            try {
                SharedResourceActivityLog::create([
                    'connection_id'       => $sharedResource->connection_id,
                    'shared_resource_id'  => $sharedResource->id,
                    'organization_id'     => $currentOrgId,
                    'user_id'             => $user->id,
                    'action'              => 'collaborator_added',
                    'resource_type'       => $sharedResource->resource_type,
                    'resource_id'         => $sharedResource->resource_id,
                    'details'             => ['user_ids' => array_map(fn($m) => $m->user_id, $added), 'count' => count($added)],
                    'ip_address'          => $request->ip(),
                    'acted_at'            => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning("Activity log failed (addSharedProjectMembers): " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'message' => count($added) > 0
                ? count($added) . ' member(s) added.'
                : (count($skipped) > 0 ? 'All selected members are already added.' : 'No new members added.'),
            'added' => count($added),
            'skipped' => count($skipped),
            'errors' => $errors,
        ]);
    }

    /**
     * DELETE /api/sharing/resources/{id}/members/{userId}
     * Remove a member from a shared project.
     */
    public function removeSharedProjectMember(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();
        $currentOrg = $request->attributes->get('currentOrganization');
        $currentOrgId = $currentOrg?->id ?? $user->organization_id ?? $user->org_id ?? null;

        $sharedResource = SharedResource::where('id', $id)
            ->where('permission', 'collaborate')
            ->where('status', 'active')
            ->where(function ($q) use ($currentOrgId) {
                $q->where('shared_with_organization_id', $currentOrgId)
                  ->orWhere('shared_by_organization_id', $currentOrgId);
            })
            ->first();

        if (!$sharedResource && $currentOrg) {
            $sharedResource = $this->findSharedResourceInPartnerDbs($id, $currentOrg);
        }

        if (!$sharedResource || $sharedResource->permission !== 'collaborate' || $sharedResource->status !== 'active') {
            return response()->json(['success' => false, 'message' => 'Not authorized.'], 403);
        }

        $localMirrorId = $this->findLocalMirrorId($sharedResource, $currentOrgId);

        \App\Models\SharedProjectMember::where('shared_resource_id', $localMirrorId)
            ->where('user_id', $userId)
            ->delete();

        try {
            SharedResourceActivityLog::create([
                'connection_id'       => $sharedResource->connection_id,
                'shared_resource_id'  => $sharedResource->id,
                'organization_id'     => $currentOrgId,
                'user_id'             => $user->id,
                'action'              => 'collaborator_removed',
                'resource_type'       => $sharedResource->resource_type,
                'resource_id'         => $sharedResource->resource_id,
                'details'             => ['removed_user_id' => $userId],
                'ip_address'          => $request->ip(),
                'acted_at'            => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning("Activity log failed (removeSharedProjectMember): " . $e->getMessage());
        }

        return response()->json(['success' => true, 'message' => 'Member removed.']);
    }

    /**
     * Find the local mirror ID in the receiver's tenant DB.
     * When mirror IDs don't match the original (legacy data), this finds the correct local ID
     * by matching connection_id + resource_type + resource_id.
     */
    private function findLocalMirrorId(SharedResource $sharedResource, int $currentOrgId): int
    {
        // If the resource is already from the local DB, use its ID directly
        // Check both shared_with AND shared_by (sharer can also manage members)
        $localMirror = SharedResource::where('id', $sharedResource->id)
            ->where(function ($q) use ($currentOrgId) {
                $q->where('shared_with_organization_id', $currentOrgId)
                  ->orWhere('shared_by_organization_id', $currentOrgId);
            })
            ->first();

        if ($localMirror) {
            return $localMirror->id;
        }

        // Fallback: find by shared_by + resource_type + resource_id (uniquely identifies a share)
        $localMirror = SharedResource::where('shared_by_organization_id', $sharedResource->shared_by_organization_id)
            ->where('resource_type', $sharedResource->resource_type)
            ->where('resource_id', $sharedResource->resource_id)
            ->where('status', 'active')
            ->first();

        if ($localMirror) {
            return $localMirror->id;
        }

        // Fallback: find by connection_id + resource_type + resource_id in local DB
        if ($sharedResource->connection_id) {
            $localMirror = SharedResource::where('connection_id', $sharedResource->connection_id)
                ->where('resource_type', $sharedResource->resource_type)
                ->where('resource_id', $sharedResource->resource_id)
                ->where(function ($q) use ($currentOrgId) {
                    $q->where('shared_with_organization_id', $currentOrgId)
                      ->orWhere('shared_by_organization_id', $currentOrgId);
                })
                ->first();

            if ($localMirror) {
                return $localMirror->id;
            }
        }

        // The resource exists locally with this ID (sharer's own record)
        $existsLocally = SharedResource::where('id', $sharedResource->id)->first();
        if ($existsLocally) {
            return $existsLocally->id;
        }

        // Truly last resort: create the mirror with the correct ID
        try {
            SharedResource::create([
                'id' => $sharedResource->id,
                'connection_id' => $sharedResource->connection_id,
                'shared_by_organization_id' => $sharedResource->shared_by_organization_id,
                'shared_with_organization_id' => $sharedResource->shared_with_organization_id,
                'resource_type' => $sharedResource->resource_type,
                'resource_id' => $sharedResource->resource_id,
                'resource_name' => $sharedResource->resource_name,
                'parent_resource_id' => $sharedResource->parent_resource_id ?? null,
                'permission' => $sharedResource->permission,
                'can_download' => $sharedResource->can_download,
                'status' => $sharedResource->status,
                'shared_by_user_id' => $sharedResource->shared_by_user_id,
                'notes' => $sharedResource->notes,
                'shared_at' => $sharedResource->shared_at,
                'expires_at' => $sharedResource->expires_at,
            ]);
            return $sharedResource->id;
        } catch (\Throwable $e) {
            Log::warning('Failed to create local mirror for shared resource: ' . $e->getMessage());
        }

        return $sharedResource->id;
    }

    /**
     * POST /api/sharing/resources/{id}/tasks
     * Create task(s) in a shared project (cross-tenant task creation).
     */
    public function storeTaskForSharedProject(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $currentOrg = $request->attributes->get('currentOrganization');
        $currentOrgId = $currentOrg?->id ?? ($user->organization_id ?? $user->org_id ?? null);

        // 1. Find the SharedResource using tenant org context (not user.organization_id)
        $sharedResource = $this->resolveSharedResource($id, $currentOrg);

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        // Sharer (owner) can always create tasks. Receiver needs 'collaborate' permission.
        $isSharer = $sharedResource->shared_by_organization_id == $currentOrgId;
        if (!$isSharer && $sharedResource->permission !== 'collaborate') {
            return response()->json(['success' => false, 'message' => 'Not authorized to create tasks in this project.'], 403);
        }

        // 2. Get sharer org info
        $sharerOrg = \App\Models\Master\Organization::on('mysql_master')->find($sharedResource->shared_by_organization_id);
        if (!$sharerOrg || !$sharerOrg->database_name) {
            return response()->json(['success' => false, 'message' => 'Partner organization not found.'], 404);
        }

        // 3. Validate request (same rules as TaskController::store)
        $validated = $request->validate([
            'title'                => 'required|string|max:255',
            'description'          => 'nullable|string',
            'requirements'         => 'nullable|array',
            'requirements.*'       => 'required_with:requirements|string|max:500',
            'start_date'           => 'nullable|date',
            'end_date'             => 'nullable|date',
            'assigned_to'          => 'required|array|min:1',
            'assigned_to.*'        => 'string',
            'priority'             => 'required|string|max:32',
            'task_type'            => 'nullable|in:standard,recurring',
            'allow_transfer'       => 'nullable|boolean',
            'followers'            => 'nullable|array',
            'followers.*'          => 'string',
            'kb_ids'               => 'nullable|array',
            'kb_ids.*'             => 'nullable|integer',
            'event_ids'            => 'nullable|array',
            'event_ids.*'          => 'nullable|integer',
            'deliverables'         => 'nullable|array',
            'deliverables.*.title'       => 'required_with:deliverables|string|max:255',
            'deliverables.*.description' => 'nullable|string|max:2000',
            'deliverables.*.start_date'  => 'nullable|date',
            'deliverables.*.due_date'    => 'nullable|date',
            'deliverables.*.assigned_to' => 'nullable|string',
            'parent_id'            => 'nullable|integer',
        ]);

        // 4. Split assigned_to into local (receiver-org) users and cross-org users
        $localUserIds = [];
        $crossOrgAssignments = [];
        foreach ($validated['assigned_to'] as $assignee) {
            if (str_contains((string) $assignee, ':')) {
                [$orgId, $extUserId] = explode(':', $assignee, 2);
                $crossOrgAssignments[] = ['org_id' => (int) $orgId, 'external_id' => (int) $extUserId];
            } else {
                $localUserIds[] = (int) $assignee;
            }
        }

        // 5. Normalize dates
        foreach (['start_date', 'end_date'] as $dateField) {
            if (!empty($validated[$dateField]) && is_string($validated[$dateField])) {
                $validated[$dateField] = \Carbon\Carbon::parse($validated[$dateField])->format('Y-m-d H:i:s');
            }
        }
        if (!empty($validated['deliverables']) && is_array($validated['deliverables'])) {
            foreach ($validated['deliverables'] as &$del) {
                foreach (['start_date', 'due_date'] as $df) {
                    if (!empty($del[$df]) && is_string($del[$df])) {
                        $del[$df] = \Carbon\Carbon::parse($del[$df])->format('Y-m-d H:i:s');
                    }
                }
            }
        }

        // 6. Create cross-DB connection to sharer's tenant DB and insert tasks
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $connName = 'shared_proj_task_' . $id . '_' . uniqid();

        try {
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $sharerOrg->database_name,
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

            // Verify project exists in sharer's DB
            $project = $conn->table('projects')->where('id', $sharedResource->resource_id)->first();
            if (!$project) {
                return response()->json(['success' => false, 'message' => 'Shared project not found.'], 404);
            }

            // Resolve the creator's user ID in the SHARER'S DB by email.
            // User IDs are NOT globally unique across tenant databases. The authenticated
            // user's ID belongs to the current (receiver) org's DB and may map to a
            // completely different user or nobody in the sharer's DB. We must find or
            // create the matching user record in the sharer's DB to correctly attribute
            // task ownership.
            $now = now()->format('Y-m-d H:i:s');
            $projectId = $sharedResource->resource_id;
            $createdTasks = [];

            $creatorLocalId = null;
            try {
                $creatorEmail = strtolower(trim($user->email ?? ''));
                if (!empty($creatorEmail)) {
                    $creatorRow = $conn->table('users')
                        ->whereRaw('LOWER(email) = ?', [$creatorEmail])
                        ->select('id')
                        ->first();
                    if ($creatorRow) {
                        $creatorLocalId = (int) $creatorRow->id;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning("storeTaskForSharedProject: creator email resolve failed: " . $e->getMessage());
            }

            // Fallback: if creator not found in sharer's DB, create a placeholder user
            // so the task has a valid assigned_by/creator_id.
            if (!$creatorLocalId) {
                try {
                    $creatorLocalId = $conn->table('users')->insertGetId([
                        'name'              => $user->name ?? 'External User',
                        'email'             => $user->email,
                        'role'              => 'member',
                        'password'          => bcrypt('pending'),
                        'organization_id'   => $sharerOrg->id ?? null,
                        'email_verified_at' => now(),
                        'created_at'        => $now,
                        'updated_at'        => $now,
                    ]);
                } catch (\Throwable $e) {
                    Log::warning("storeTaskForSharedProject: creator fallback insert failed: " . $e->getMessage());
                    // Last resort: use the user's raw ID (will show wrong name but won't crash)
                    $creatorLocalId = $user->id;
                }
            }

            // Resolve local user IDs from the receiver org to their equivalents in the
            // sharer's DB. User IDs are NOT globally unique across tenant databases.
            // NEVER short-circuit by raw ID — always resolve by email to avoid
            // assigning to the wrong person.
            $resolvedLocalUserIds = [];
            foreach ($localUserIds as $rawUserId) {
                // Find the user from the receiver org's DB to get their email
                try {
                    $receiverUser = \App\Models\User::withTrashed()->find($rawUserId);
                    if ($receiverUser && !empty($receiverUser->email)) {
                        $matchRow = $conn->table('users')
                            ->whereRaw('LOWER(email) = ?', [strtolower($receiverUser->email)])
                            ->select('id')
                            ->first();
                        if ($matchRow) {
                            $resolvedLocalUserIds[] = (int) $matchRow->id;
                            continue;
                        }
                    }
                } catch (\Throwable $e) {
                    // ignore
                }
                // Not found — skip this user (will fail insert or be orphaned)
                $resolvedLocalUserIds[] = (int) $rawUserId;
            }

            // Dynamically determine which columns exist in the sharer's tasks table
            $existingColumns = $conn->getSchemaBuilder()->getColumnListing('tasks');
            $existingColumnsSet = array_flip($existingColumns);

            // Build a helper to only include columns that exist
            $taskData = function (array $base) use ($existingColumnsSet) {
                return array_filter($base, fn($key) => isset($existingColumnsSet[$key]), ARRAY_FILTER_USE_KEY);
            };

            // Generate a unique business_id prefix
            $prefix = 'TSK';
            $taskSeq = $conn->table('tasks')->where('project_id', $projectId)->max('id') ?? 0;

            // --- Local user tasks (receiver-org users) ---
            foreach ($resolvedLocalUserIds as $userId) {
                $taskSeq++;
                $businessId = $prefix . '-' . str_pad($taskSeq, 4, '0', STR_PAD_LEFT);

                $insertData = $taskData([
                    'project_id'          => $projectId,
                    'business_id'         => $businessId,
                    'title'               => $validated['title'],
                    'description'         => $validated['description'] ?? null,
                    'requirements'        => !empty($validated['requirements']) ? json_encode($validated['requirements']) : null,
                    'start_date'          => $validated['start_date'] ?? $now,
                    'end_date'            => $validated['end_date'] ?? null,
                    'assigned_to'         => $userId,
                    'assigned_by'         => $creatorLocalId,
                    'creator_id'          => $creatorLocalId,
                    'updated_by'          => $creatorLocalId,
                    'priority'            => $validated['priority'],
                    'status'              => 'pending',
                    'task_type'           => $validated['task_type'] ?? 'standard',
                    'allow_transfer'      => $validated['allow_transfer'] ?? true,
                    'kb_ids'              => !empty($validated['kb_ids']) ? json_encode($validated['kb_ids']) : null,
                    'event_ids'           => !empty($validated['event_ids']) ? json_encode($validated['event_ids']) : null,
                    'parent_id'           => $validated['parent_id'] ?? null,
                    'created_at'          => $now,
                    'updated_at'          => $now,
                ]);

                $taskId = $conn->table('tasks')->insertGetId($insertData);

                // Sync assignees pivot
                $conn->table('task_user')->insertOrIgnore([
                    'task_id'    => $taskId,
                    'user_id'    => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // Sync followers (resolve IDs by email to handle cross-org ID collisions)
                if (!empty($validated['followers'])) {
                    try {
                        foreach ($validated['followers'] as $followerId) {
                            $resolvedFollowerId = $followerId;
                            try {
                                $followerUser = \App\Models\User::withTrashed()->find($followerId);
                                if ($followerUser && !empty($followerUser->email)) {
                                    $matchRow = $conn->table('users')
                                        ->whereRaw('LOWER(email) = ?', [strtolower($followerUser->email)])
                                        ->select('id')->first();
                                    if ($matchRow) {
                                        $resolvedFollowerId = $matchRow->id;
                                    }
                                }
                            } catch (\Throwable $e) {
                                // ignore — use raw ID
                            }
                            $conn->table('task_followers')->insertOrIgnore([
                                'task_id'    => $taskId,
                                'user_id'    => (int) $resolvedFollowerId,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]);
                        }
                    } catch (\Throwable $e) {
                        Log::warning('Failed to sync task followers: ' . $e->getMessage());
                    }
                }

                // Create deliverables
                if (!empty($validated['deliverables'])) {
                    foreach ($validated['deliverables'] as $del) {
                        if (!empty($del['assigned_to']) && (string) $del['assigned_to'] !== (string) $userId) {
                            continue;
                        }
                        $conn->table('deliverables')->insert([
                            'project_id'  => $projectId,
                            'task_id'     => $taskId,
                            'title'       => $del['title'],
                            'description' => $del['description'] ?? null,
                            'status'      => 'pending',
                            'priority'    => $validated['priority'],
                            'start_date'  => $del['start_date'] ?? null,
                            'due_date'    => $del['due_date'] ?? $validated['end_date'] ?? null,
                            'assigned_to' => $userId,
                            'created_by'  => $creatorLocalId,
                            'created_at'  => $now,
                            'updated_at'  => $now,
                        ]);
                    }
                }

                // Workflow event
                $conn->table('task_workflow_events')->insert([
                    'task_id'    => $taskId,
                    'user_id'    => $creatorLocalId,
                    'action'     => 'created',
                    'comment'    => 'Task created via shared project',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $createdTasks[] = ['id' => $taskId, 'assigned_to' => $userId];
            }

            // --- Cross-org user tasks ---
            foreach ($crossOrgAssignments as $cross) {
                $taskSeq++;
                $businessId = $prefix . '-' . str_pad($taskSeq, 4, '0', STR_PAD_LEFT);

                $insertData = $taskData([
                    'project_id'               => $projectId,
                    'business_id'              => $businessId,
                    'title'                    => $validated['title'],
                    'description'              => $validated['description'] ?? null,
                    'requirements'             => !empty($validated['requirements']) ? json_encode($validated['requirements']) : null,
                    'start_date'               => $validated['start_date'] ?? $now,
                    'end_date'                 => $validated['end_date'] ?? null,
                    'assigned_to'              => null,
                    'assigned_to_org_id'       => $cross['org_id'],
                    'assigned_to_external_id'  => $cross['external_id'],
                    'assigned_by'              => $creatorLocalId,
                    'creator_id'               => $creatorLocalId,
                    'updated_by'               => $creatorLocalId,
                    'priority'                 => $validated['priority'],
                    'status'                   => 'pending',
                    'task_type'                => $validated['task_type'] ?? 'standard',
                    'allow_transfer'           => $validated['allow_transfer'] ?? true,
                    'kb_ids'                   => !empty($validated['kb_ids']) ? json_encode($validated['kb_ids']) : null,
                    'event_ids'                => !empty($validated['event_ids']) ? json_encode($validated['event_ids']) : null,
                    'parent_id'                => $validated['parent_id'] ?? null,
                    'created_at'               => $now,
                    'updated_at'               => $now,
                ]);

                $taskId = $conn->table('tasks')->insertGetId($insertData);

                // Workflow event
                $conn->table('task_workflow_events')->insert([
                    'task_id'    => $taskId,
                    'user_id'    => $creatorLocalId,
                    'action'     => 'created',
                    'comment'    => 'Assigned to external user (Org #' . $cross['org_id'] . ', User #' . $cross['external_id'] . ')',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $createdTasks[] = [
                    'id'                       => $taskId,
                    'assigned_to'              => null,
                    'assigned_to_org_id'       => $cross['org_id'],
                    'assigned_to_external_id'  => $cross['external_id'],
                ];
            }

            if (empty($createdTasks)) {
                return response()->json(['success' => false, 'message' => 'No tasks were created.'], 422);
            }

            // Activity log
            try {
                SharedResourceActivityLog::create([
                    'connection_id'      => $sharedResource->connection_id,
                    'shared_resource_id' => $sharedResource->id,
                    'organization_id'    => $currentOrgId,
                    'user_id'            => $user->id,
                    'action'             => 'task_created',
                    'resource_type'      => 'task',
                    'resource_id'        => $createdTasks[0]['id'] ?? null,
                    'details'            => ['task_count' => count($createdTasks), 'title' => $validated['title']],
                    'ip_address'         => $request->ip(),
                    'acted_at'           => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning("Activity log failed (storeTaskForSharedProject): " . $e->getMessage());
            }

            return response()->json([
                'success' => true,
                'message' => count($createdTasks) . ' task(s) created successfully',
                'task'    => !empty($createdTasks) ? ['id' => $createdTasks[0]['id']] : null,
                'tasks'   => $createdTasks,
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['success' => false, 'message' => 'Validation failed.', 'errors' => $e->errors()], 422);
        } catch (\Throwable $e) {
            Log::warning('Failed to create task in shared project: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to create task in shared project.'], 500);
        } finally {
            DB::purge($connName);
        }
    }
}
