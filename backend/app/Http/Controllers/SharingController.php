<?php

namespace App\Http\Controllers;

use App\Models\Master\OrganizationConnection;
use App\Models\SharedResource;
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
            'expires_at'        => 'nullable|date|after:now',
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

            return response()->json([
                'success' => true,
                'message' => 'Resource shared successfully.',
                'data' => [
                    'id' => $sharedResource->id,
                    'permission' => $sharedResource->permission,
                    'can_download' => $sharedResource->can_download,
                    'status' => $sharedResource->status,
                    'shared_at' => $sharedResource->shared_at,
                ],
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
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
    public function showSharedResource(Request $request, int $id): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        $sharedResource = SharedResource::where('id', $id)
            ->where(function ($q) use ($currentOrg) {
                $q->where('shared_by_organization_id', $currentOrg->id)
                  ->orWhere('shared_with_organization_id', $currentOrg->id);
            })->with(['sharedByUser', 'users.user'])->first();

        if (!$sharedResource) {
            return response()->json(['success' => false, 'message' => 'Shared resource not found.'], 404);
        }

        $sharerOrgs = [];
        $sharerOrg = $this->getSharerOrg($sharedResource->shared_by_organization_id, $sharerOrgs);
        $resource = $this->fetchActualResource($sharedResource, $sharerOrg);

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
     * PUT /api/sharing/resources/{id}/permission
     * Update sharing permission.
     */
    public function updatePermission(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'permission'   => 'required|string|in:view,comment,collaborate',
            'can_download' => 'required|boolean',
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

        try {
            $updated = $this->sharingService->updatePermission(
                sharedResource: $sharedResource,
                newPermission: $request->input('permission'),
                canDownload: $request->boolean('can_download'),
                userId: $user->id,
                organizationId: $currentOrg->id
            );

            return response()->json([
                'success' => true,
                'message' => 'Permission updated.',
                'data' => [
                    'permission' => $updated->permission,
                    'can_download' => $updated->can_download,
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
                $added++;
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

        return response()->json([
            'success' => true,
            'message' => 'User removed from shared resource.',
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

        $sharerOrgs = [];
        $sharerConnections = [];

        $data = $resources->map(function ($resource) use (&$sharerOrgs) {
            try {
                $sharerOrg = $this->getSharerOrg($resource->shared_by_organization_id, $sharerOrgs);
                $actual = $this->fetchActualResource($resource, $sharerOrg);
            } catch (\Throwable $e) {
                Log::warning("Failed fetching actual resource: " . $e->getMessage());
                $actual = null;
            }

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
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
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
            return $resource->getResource();
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

            if (!$row) return null;

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

                // Load tasks with their assignees
                $taskRows = $conn->table('tasks')->where('project_id', $projectId)->get();
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
                    $task->assignees = $assignees->values();

                    // Load assigner (assigned_by user)
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

                    $tasks->push($task);
                }
                $model->setRelation('tasks', $tasks);

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
                        $members->push((array)$uRow);
                    }
                }
                // Add creator as member
                if ($model->created_by) {
                    $creatorRow = $conn->table('users')->where('id', $model->created_by)->first();
                    if ($creatorRow) {
                        $creatorData = (array)$creatorRow;
                        if (!$members->contains('id', $model->created_by)) {
                            $members->push($creatorData);
                        }
                        $model->creator = $creatorData;
                    }
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

                // Load deliverables
                if ($conn->getSchemaBuilder()->hasTable('deliverables')) {
                    $delRows = $conn->table('deliverables')->where('project_id', $projectId)->get();
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
            return $resource->getResource();
        } finally {
            DB::purge($connName);
        }
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
}
