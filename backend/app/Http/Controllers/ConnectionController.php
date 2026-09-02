<?php

namespace App\Http\Controllers;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationConnection;
use App\Services\Sharing\ConnectionService;
use App\Services\Sharing\SharingService;
use App\Services\Sharing\SharingNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ConnectionController
 *
 * Handles organization-to-organization connection management.
 * Get Access, Give Access, Connections listing.
 */
class ConnectionController extends Controller
{
    public function __construct(
        private ConnectionService $connectionService,
        private SharingService $sharingService,
        private SharingNotificationService $notificationService
    ) {}

    /**
     * GET /api/sharing/connections
     * List all connections for the current organization.
     */
    public function index(Request $request): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $status = $request->query('status');

        $connections = $this->connectionService->getConnections($organization, $status);

        return response()->json([
            'success' => true,
            'data' => $connections->map(function ($connection) use ($organization) {
                $otherOrg = $connection->getOtherOrganization($organization->id);
                return [
                    'id' => $connection->id,
                    'connection_code' => $connection->connection_code,
                    'status' => $connection->status,
                    'other_organization' => $otherOrg ? [
                        'id' => $otherOrg->id,
                        'name' => $otherOrg->name,
                        'slug' => $otherOrg->slug,
                        'organization_code' => $otherOrg->organization_code,
                        'logo_path' => $otherOrg->logo_path,
                        'country' => $otherOrg->country,
                    ] : null,
                    'direction' => $connection->requesting_organization_id === $organization->id ? 'incoming' : 'outgoing',
                    'requested_at' => $connection->requested_at,
                    'approved_at' => $connection->approved_at,
                    'expires_at' => $connection->expires_at,
                    'request_message' => $connection->request_message,
                ];
            }),
        ]);
    }

    /**
     * GET /api/sharing/connections/stats
     * Get connection statistics.
     */
    public function stats(Request $request): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $stats = $this->connectionService->getStats($organization);

        return response()->json([
            'success' => true,
            'data' => $stats,
        ]);
    }

    /**
     * GET /api/sharing/all-stats
     * Combined connection + sharing stats in a single DB query round-trip.
     */
    public function allStats(Request $request): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');

        if (!$organization) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $orgId = $organization->id;

        try {
            $connStats = $this->connectionService->getStats($organization);
        } catch (\Throwable $e) {
            $connStats = ['total' => 0, 'active' => 0, 'pending' => 0, 'rejected' => 0, 'revoked' => 0, '_error' => $e->getMessage()];
        }

        try {
            $shareStats = $this->sharingService->getStats($orgId);
        } catch (\Throwable $e) {
            $shareStats = ['shared_by_us' => 0, 'shared_with_us' => 0, 'by_type' => [], '_error' => $e->getMessage()];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'connections' => $connStats,
                'sharing'     => $shareStats,
            ],
        ]);
    }

    /**
     * GET /api/sharing/connections/{id}
     * Get a specific connection.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $connection->id,
                'connection_code' => $connection->connection_code,
                'status' => $connection->status,
                'requesting_organization' => [
                    'id' => $connection->requestingOrganization->id,
                    'name' => $connection->requestingOrganization->name,
                    'organization_code' => $connection->requestingOrganization->organization_code,
                    'logo_path' => $connection->requestingOrganization->logo_path,
                ],
                'receiving_organization' => [
                    'id' => $connection->receivingOrganization->id,
                    'name' => $connection->receivingOrganization->name,
                    'organization_code' => $connection->receivingOrganization->organization_code,
                    'logo_path' => $connection->receivingOrganization->logo_path,
                ],
                'requested_at' => $connection->requested_at,
                'approved_at' => $connection->approved_at,
                'expires_at' => $connection->expires_at,
                'request_message' => $connection->request_message,
                'rejection_reason' => $connection->rejection_reason,
            ],
        ]);
    }

    /**
     * POST /api/sharing/get-access
     * Find an organization and request connection (Get Access flow).
     */
    public function findOrganization(Request $request): JsonResponse
    {
        $request->validate([
            'identifier' => 'required|string|max:255',
        ]);

        $currentOrg = $request->attributes->get('currentOrganization');
        $organization = $this->connectionService->findOrganization(
            $request->input('identifier'),
            $currentOrg?->id
        );

        if (!$organization) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $organization->id,
                'name' => $organization->name,
                'slug' => $organization->slug,
                'organization_code' => $organization->organization_code,
                'logo_path' => $organization->logo_path,
                'country' => $organization->country,
                'description' => $organization->description,
                'industry' => $organization->industry,
                'website' => $organization->website,
            ],
        ]);
    }

    /**
     * POST /api/sharing/get-access/request
     * Send a connection request to another organization.
     */
    public function requestConnection(Request $request): JsonResponse
    {
        $request->validate([
            'organization_id' => 'required|integer',
            'message' => 'nullable|string|max:500',
        ]);

        $currentOrg = $request->attributes->get('currentOrganization');
        $user = $request->user();
        $targetOrg = Organization::find($request->input('organization_id'));

        if (!$targetOrg) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        if ($currentOrg->id === $targetOrg->id) {
            return response()->json(['success' => false, 'message' => 'You cannot connect with your own organization.'], 422);
        }

        try {
            $connection = $this->connectionService->requestConnection(
                requestingOrg: $currentOrg,
                receivingOrg: $targetOrg,
                userId: $user->id,
                message: $request->input('message')
            );

            // Notify the receiving organization
            $this->notificationService->connectionRequestReceived(
                orgId: $targetOrg->id,
                fromOrgId: $currentOrg->id,
                data: ['connection_id' => $connection->id, 'connection_code' => $connection->connection_code]
            );

            return response()->json([
                'success' => true,
                'message' => 'Connection request sent successfully.',
                'data' => [
                    'connection_id' => $connection->id,
                    'connection_code' => $connection->connection_code,
                    'status' => $connection->status,
                ],
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/give-access/generate
     * Generate an invitation code/link (Give Access flow).
     */
    public function generateInvitation(Request $request): JsonResponse
    {
        $currentOrg = $request->attributes->get('currentOrganization');

        try {
            $invitation = $this->connectionService->generateInvitation($currentOrg);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Failed to generate invitation: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'success' => true,
            'data' => $invitation,
        ]);
    }

    /**
     * POST /api/sharing/connections/{id}/approve
     * Approve a pending connection request.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        if ($connection->receiving_organization_id !== $organization->id) {
            return response()->json(['success' => false, 'message' => 'Only the receiving organization can approve.'], 403);
        }

        try {
            $connection = $this->connectionService->approveConnection($connection, $user->id);

            // Notify requesting organization
            $this->notificationService->connectionApproved(
                orgId: $connection->requesting_organization_id,
                fromOrgId: $organization->id,
                data: ['connection_id' => $connection->id]
            );

            return response()->json([
                'success' => true,
                'message' => 'Connection approved.',
                'data' => ['status' => $connection->status],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/connections/{id}/reject
     * Reject a pending connection request.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        if ($connection->receiving_organization_id !== $organization->id) {
            return response()->json(['success' => false, 'message' => 'Only the receiving organization can reject.'], 403);
        }

        try {
            $connection = $this->connectionService->rejectConnection(
                $connection,
                $user->id,
                $request->input('reason')
            );

            // Notify requesting organization
            $this->notificationService->connectionRejected(
                orgId: $connection->requesting_organization_id,
                fromOrgId: $organization->id,
                data: ['connection_id' => $connection->id, 'reason' => $request->input('reason')]
            );

            return response()->json([
                'success' => true,
                'message' => 'Connection rejected.',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/connections/{id}/revoke
     * Revoke an active connection.
     */
    public function revoke(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        try {
            $connection = $this->connectionService->revokeConnection($connection, $user->id);

            // Notify the other organization
            $otherOrgId = $connection->getOtherOrganization($organization->id)?->id;
            if ($otherOrgId) {
                $this->notificationService->organizationDisconnected(
                    orgId: $otherOrgId,
                    fromOrgId: $organization->id
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Connection revoked.',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/connections/{id}/suspend
     * Suspend an active connection.
     */
    public function suspend(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        try {
            $connection = $this->connectionService->suspendConnection($connection, $user->id);

            $otherOrgId = $connection->getOtherOrganization($organization->id)?->id;
            if ($otherOrgId) {
                $this->notificationService->organizationDisconnected(
                    orgId: $otherOrgId,
                    fromOrgId: $organization->id
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Connection suspended.',
                'data' => ['status' => $connection->status],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * POST /api/sharing/connections/{id}/restore
     * Restore a revoked/rejected connection back to active.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        try {
            $connection = $this->connectionService->restoreConnection($connection, $user->id);

            $otherOrgId = $connection->getOtherOrganization($organization->id)?->id;
            if ($otherOrgId) {
                $this->notificationService->connectionApproved(
                    orgId: $otherOrgId,
                    fromOrgId: $organization->id,
                    data: ['connection_id' => $connection->id]
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Connection restored.',
                'data' => ['status' => $connection->status],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * DELETE /api/sharing/connections/{id}/force-delete
     * Permanently delete a connection. Removes from both DBs and logs activity.
     */
    public function forceDelete(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        try {
            $otherOrgId = $connection->getOtherOrganization($organization->id)?->id;

            $this->connectionService->deleteConnection($connection, $user->id);

            return response()->json([
                'success' => true,
                'message' => 'Connection permanently deleted.',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * DELETE /api/sharing/connections/{id}
     * Disconnect from an organization.
     */
    public function disconnect(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('currentOrganization');
        $user = $request->user();

        $connection = $this->connectionService->getConnection($id, $organization->id);

        if (!$connection) {
            return response()->json(['success' => false, 'message' => 'Connection not found.'], 404);
        }

        try {
            $connection = $this->connectionService->revokeConnection($connection, $user->id);

            // Notify the other organization
            $otherOrgId = $connection->getOtherOrganization($organization->id)?->id;
            if ($otherOrgId) {
                $this->notificationService->organizationDisconnected(
                    orgId: $otherOrgId,
                    fromOrgId: $organization->id
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Disconnected from organization.',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }
}
