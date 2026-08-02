<?php

/**
 * Super Admin API routes for SaaS management.
 *
 * All routes are prefixed with /api/super-admin (configured in bootstrap/app.php).
 */
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Saas\SuperAdminController;
use App\Http\Controllers\HealthCheckController;
use App\Services\Saas\OrganizationService;
use App\Models\Master\Organization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

$ctrl = SuperAdminController::class;

// ─── Public Organization Registration (no auth required) ──────
Route::post('/organizations/register', [$ctrl, 'register']);

// ─── Dashboard ─────────────────────────────────────────────────
Route::get('/stats', [$ctrl, 'stats']);

// ─── Organizations CRUD ────────────────────────────────────────
Route::get('/organizations', [$ctrl, 'organizations']);
Route::get('/organizations/{id}', [$ctrl, 'organization']);
Route::post('/organizations', [$ctrl, 'storeOrganization']);
Route::put('/organizations/{id}', [$ctrl, 'updateOrganization']);
Route::delete('/organizations/{id}', [$ctrl, 'destroyOrganization']);
Route::post('/organizations/{id}/suspend', [$ctrl, 'suspendOrganization']);
Route::post('/organizations/{id}/activate', [$ctrl, 'activateOrganization']);

// ─── Plans & Modules ───────────────────────────────────────────
Route::get('/plans', [$ctrl, 'plans']);
Route::get('/modules', [$ctrl, 'modules']);
Route::get('/domains', [$ctrl, 'domains']);

// ─── Activity Logs ─────────────────────────────────────────────
Route::get('/activity-logs', [$ctrl, 'activityLogs']);

// ─── Health ────────────────────────────────────────────────────
Route::get('/health', [$ctrl, 'health']);
Route::get('/health/tenant/{slug}', [$ctrl, 'healthTenant']);
Route::get('/health/all', [$ctrl, 'healthAll']);

// ─── Debug (keep existing) ─────────────────────────────────────
Route::get('/tenant/current', function (Request $request) {
    $org = $request->attributes->get('currentOrganization');
    if (!$org) {
        return response()->json(['success' => false, 'message' => 'No tenant resolved.']);
    }
    return response()->json([
        'success' => true,
        'tenant' => [
            'id' => $org->id, 'name' => $org->name, 'slug' => $org->slug,
            'type' => $org->type ?? 'standard', 'database_name' => $org->database_name,
            'status' => $org->status,
        ],
    ]);
});
