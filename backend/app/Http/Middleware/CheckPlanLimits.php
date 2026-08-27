<?php

namespace App\Http\Middleware;

use App\Services\Saas\EntitlementService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * CheckPlanLimits Middleware.
 *
 * Enforces organization plan limits before resource creation.
 * Must run AFTER ResolveTenantDatabase (which sets currentOrganization).
 *
 * Usage: Apply to POST routes that create limited resources.
 *   ->middleware(\App\Http\Middleware\CheckPlanLimits::class . ':users')
 *   ->middleware(\App\Http\Middleware\CheckPlanLimits::class . ':projects')
 */
class CheckPlanLimits
{
    public function __construct(
        protected EntitlementService $entitlementService,
    ) {}

    /**
     * Handle an incoming request.
     *
     * @param  string  $resource  The resource type to check: 'users', 'projects', 'teams'
     */
    public function handle(Request $request, Closure $next, string $resource = 'users'): Response
    {
        /** @var \App\Models\Master\Organization|null $organization */
        $organization = $request->attributes->get('currentOrganization');

        if (!$organization) {
            return $next($request);
        }

        // Owner organizations bypass all limits
        if ($organization->isOwner()) {
            return $next($request);
        }

        $result = match ($resource) {
            'users'    => $this->entitlementService->canCreateUser($organization),
            'projects' => $this->entitlementService->canCreateProject($organization),
            'teams'    => $this->entitlementService->canCreateTeam($organization),
            default    => ['allowed' => true],
        };

        if (!$result['allowed']) {
            return response()->json([
                'success'      => false,
                'code'         => 'LIMIT_REACHED',
                'resource'     => $result['resource'],
                'limit'        => $result['limit'],
                'current_usage' => $result['current'],
                'remaining'    => $result['remaining'],
                'message'      => $result['message'],
            ], 422);
        }

        // Attach entitlement info to request for controllers that want it
        $request->attributes->set('entitlement_check', $result);

        return $next($request);
    }
}
