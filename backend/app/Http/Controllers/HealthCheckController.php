<?php

namespace App\Http\Controllers;

use App\Models\Master\Organization;
use App\Services\Saas\Infrastructure\HealthCheckService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * HealthCheckController.
 *
 * Internal health check endpoints.
 * Verifies: Master DB, Tenant DB, Cache, Queue, Storage, Mail.
 */
class HealthCheckController extends Controller
{
    public function __construct(
        protected HealthCheckService $healthCheck,
    ) {}

    /**
     * GET /health
     *
     * General health check (no tenant context).
     */
    public function index(): JsonResponse
    {
        $result = $this->healthCheck->check();

        $statusCode = $result['overall'] === 'healthy' ? 200 : 503;

        return response()->json([
            'success' => true,
            'status'  => $result['overall'],
            'checks'  => $result,
        ], $statusCode);
    }

    /**
     * GET /health/tenant/{slug}
     *
     * Health check including a specific tenant's database.
     */
    public function tenant(string $slug): JsonResponse
    {
        $organization = Organization::where('slug', $slug)->first();

        if (!$organization) {
            return response()->json([
                'success' => false,
                'message' => "Organization not found: {$slug}",
            ], 404);
        }

        $result = $this->healthCheck->check($organization);

        $statusCode = $result['overall'] === 'healthy' ? 200 : 503;

        return response()->json([
            'success' => true,
            'status'  => $result['overall'],
            'tenant'  => $slug,
            'checks'  => $result,
        ], $statusCode);
    }

    /**
     * GET /health/all
     *
     * Health check for all tenants.
     */
    public function all(): JsonResponse
    {
        $organizations = Organization::all();
        $results = [];

        foreach ($organizations as $org) {
            $results[$org->slug] = $this->healthCheck->check($org);
        }

        $allHealthy = collect($results)->every(fn ($r) => $r['overall'] === 'healthy');

        return response()->json([
            'success' => true,
            'status'  => $allHealthy ? 'healthy' : 'degraded',
            'tenants' => count($results),
            'results' => $results,
        ]);
    }
}
