<?php

namespace App\Http\Controllers;

use App\Models\Master\Organization;
use App\Services\AuditService;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrganizationSettingsController extends Controller
{
    public function __construct(
        private AuditService $auditService
    ) {}

    private function resolveOrganization(Request $request): ?Organization
    {
        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            return $org;
        }

        $dbName = DB::connection()->getDatabaseName();
        return Organization::on('mysql_master')
            ->where('database_name', $dbName)
            ->first();
    }

    /**
     * Get the current organization's email policy.
     */
    public function getEmailPolicy(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'email_policy' => $org->email_policy ?? 'standard',
        ]);
    }

    /**
     * Update the organization's email policy.
     * Only admin/super_admin can change this setting.
     */
    public function updateEmailPolicy(Request $request): JsonResponse
    {
        $request->validate([
            'email_policy' => ['required', Rule::in(['standard', 'company_required'])],
        ]);

        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        $oldPolicy = $org->email_policy ?? 'standard';
        $newPolicy = $request->input('email_policy');

        if ($oldPolicy === $newPolicy) {
            return response()->json([
                'success' => true,
                'message' => 'Email policy is already set to ' . $newPolicy . '.',
                'email_policy' => $newPolicy,
            ]);
        }

        $org->update(['email_policy' => $newPolicy]);

        try {
            $this->auditService->log(
                module: 'organization_settings',
                action: 'update_email_policy',
                description: "Changed email policy from '{$oldPolicy}' to '{$newPolicy}'",
                user: $request->user(),
                entityType: 'Organization',
                entityId: $org->id,
                oldValues: ['email_policy' => $oldPolicy],
                newValues: ['email_policy' => $newPolicy],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log email policy change audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Email policy updated successfully. Existing users are not affected.',
            'email_policy' => $newPolicy,
        ]);
    }
}
