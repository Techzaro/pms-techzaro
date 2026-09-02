<?php

namespace App\Http\Middleware;

use App\Models\SharedResource;
use App\Models\SharedResourceUser;
use App\Models\Master\OrganizationConnection;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * CheckExternalAccess Middleware
 *
 * Verifies that an external user has valid access to a shared resource.
 * Must be used after ResolveTenantDatabase middleware.
 *
 * Usage in routes:
 *   Route::middleware('external-access:project,view')->group(function () { ... });
 *
 * The middleware sets 'sharedResource' and 'externalPermission' on the request.
 */
class CheckExternalAccess
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, ?string $resourceType = null, ?string $requiredPermission = null): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401);
        }

        // Get resource type and ID from route parameters or request
        $resourceType = $resourceType ?? $request->route('resource_type');
        $resourceId = $request->route('resource_id') ?? $request->input('resource_id');

        if (!$resourceType || !$resourceId) {
            return response()->json([
                'success' => false,
                'message' => 'Resource type and ID are required.',
            ], 400);
        }

        // Check if user has direct access via shared_resource_users
        $sharedResource = SharedResource::where('resource_type', $resourceType)
            ->where('resource_id', $resourceId)
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>', now());
            })->first();

        if (!$sharedResource) {
            return response()->json([
                'success' => false,
                'message' => 'Resource is not shared.',
            ], 403);
        }

        // Check if the connection is still active
        $connection = OrganizationConnection::where('id', $sharedResource->connection_id)
            ->where('status', 'active')
            ->first();

        if (!$connection) {
            return response()->json([
                'success' => false,
                'message' => 'The connection is no longer active.',
            ], 403);
        }

        // Check user-level access
        $userAccess = SharedResourceUser::where('shared_resource_id', $sharedResource->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if ($userAccess) {
            // User has explicit access - check if expired
            if ($userAccess->expires_at && $userAccess->expires_at->isPast()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your access to this resource has expired.',
                ], 403);
            }

            // Determine effective permission from user override or resource-level
            $effectivePermission = $userAccess->getEffectivePermission();
            $effectiveCanDownload = $userAccess->getEffectiveCanDownload();
        } else {
            // No specific user access - check if any users are explicitly assigned
            $assignedUsersCount = SharedResourceUser::where('shared_resource_id', $sharedResource->id)
                ->where('status', 'active')
                ->count();

            if ($assignedUsersCount > 0) {
                // Users are explicitly assigned but this user is not among them
                return response()->json([
                    'success' => false,
                    'message' => 'You do not have access to this resource.',
                ], 403);
            }

            // No users explicitly assigned - grant access to all users of the receiving org
            $effectivePermission = $sharedResource->permission;
            $effectiveCanDownload = $sharedResource->can_download;
        }

        // Check permission level if required
        if ($requiredPermission) {
            $hierarchy = ['view' => 1, 'comment' => 2, 'collaborate' => 3];
            $grantedLevel = $hierarchy[$effectivePermission] ?? 0;
            $requiredLevel = $hierarchy[$requiredPermission] ?? 0;

            if ($grantedLevel < $requiredLevel) {
                return response()->json([
                    'success' => false,
                    'message' => "Insufficient permissions. Required: {$requiredPermission}, Granted: {$effectivePermission}",
                ], 403);
            }
        }

        // Set shared resource and permission on request for downstream use
        $request->attributes->set('sharedResource', $sharedResource);
        $request->attributes->set('externalPermission', $effectivePermission);
        $request->attributes->set('externalCanDownload', $effectiveCanDownload);

        return $next($request);
    }
}
