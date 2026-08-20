<?php

namespace App\Http\Controllers;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\OrganizationSubscriptionHistory;
use App\Services\AuditService;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

        $tenantSlug = $request->header('X-Tenant-ID');
        if ($tenantSlug) {
            $org = Organization::on('mysql_master')
                ->where('slug', $tenantSlug)
                ->first();
            if ($org) {
                return $org;
            }
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

    /**
     * Get the current organization's branding settings (logo + subtitle).
     */
    public function getBranding(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        $settings = $org->settings ?? [];
        $logoUrl = null;
        if ($org->logo_path && Storage::disk('public')->exists($org->logo_path)) {
            $logoUrl = Storage::disk('public')->url($org->logo_path);
        }

        return response()->json([
            'success' => true,
            'branding' => [
                'slug' => $org->slug,
                'logo_url' => $logoUrl,
                'logo_path' => $org->logo_path,
                'subtitle' => $settings['subtitle'] ?? 'PMS Portal',
                'org_name' => $settings['org_name'] ?? $org->name,
            ],
        ]);
    }

    /**
     * Update the organization's branding settings (logo upload + subtitle text).
     * Only admin can change this.
     */
    public function updateBranding(Request $request): JsonResponse
    {
        $request->validate([
            'subtitle' => ['required', 'string', 'max:100'],
            'org_name' => ['nullable', 'string', 'max:100'],
            'logo' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,svg', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ]);

        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        $settings = $org->settings ?? [];
        $newSubtitle = $request->input('subtitle');
        $newOrgName = $request->input('org_name') ?? $org->name;
        $oldSubtitle = $settings['subtitle'] ?? 'PMS Portal';
        $oldOrgName = $settings['org_name'] ?? $org->name;

        // Handle logo upload or removal
        $logoPath = $org->logo_path;
        if ($request->boolean('remove_logo')) {
            if ($logoPath && Storage::disk('public')->exists($logoPath)) {
                Storage::disk('public')->delete($logoPath);
            }
            $logoPath = null;
        } elseif ($request->hasFile('logo')) {
            // Delete old logo if exists
            if ($logoPath && Storage::disk('public')->exists($logoPath)) {
                Storage::disk('public')->delete($logoPath);
            }

            $file = $request->file('logo');
            $ext = $file->getClientOriginalExtension();
            $uploadDir = 'org_logos/' . $org->slug;
            Storage::disk('public')->makeDirectory($uploadDir);
            $filename = 'logo.' . $ext;
            $file->storeAs($uploadDir, $filename, 'public');
            $logoPath = $uploadDir . '/' . $filename;
        }

        // Update settings JSON
        $settings['subtitle'] = $newSubtitle;
        $settings['org_name'] = $newOrgName;

        $org->update([
            'settings' => $settings,
            'logo_path' => $logoPath,
        ]);

        $logoUrl = null;
        if ($logoPath && Storage::disk('public')->exists($logoPath)) {
            $logoUrl = Storage::disk('public')->url($logoPath);
        }

        try {
            $this->auditService->log(
                module: 'organization_settings',
                action: 'update_branding',
                description: "Updated branding: subtitle changed from '{$oldSubtitle}' to '{$newSubtitle}'" . ($request->boolean('remove_logo') ? ', logo removed' : ($request->hasFile('logo') ? ', logo updated' : '')),
                user: $request->user(),
                entityType: 'Organization',
                entityId: $org->id,
                oldValues: ['subtitle' => $oldSubtitle],
                newValues: ['subtitle' => $newSubtitle],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log branding change audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Branding updated successfully.',
            'branding' => [
                'logo_url' => $logoUrl,
                'logo_path' => $logoPath,
                'subtitle' => $newSubtitle,
                'org_name' => $newOrgName,
            ],
        ]);
    }

    /**
     * Get the current organization's subscription plan details.
     * Shows plan name, pricing, limits, modules, and benefits.
     */
    public function getSubscription(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with(['plan.modules'])
            ->latest()
            ->first();

        if (!$subscription) {
            $currentUsers = \App\Models\User::count();
            $currentProjects = \App\Models\Project::count();

            return response()->json([
                'success' => true,
                'subscription' => null,
                'plan' => null,
                'trial_config' => null,
                'usage' => [
                    'users' => $currentUsers,
                    'projects' => $currentProjects,
                ],
                'modules' => [],
                'organization' => [
                    'name' => $org->name,
                    'status' => $org->status,
                    'is_owner' => $org->isOwner(),
                    'trial_ends_at' => $org->trial_ends_at?->toISOString(),
                ],
            ]);
        }

        $plan = $subscription->plan;
        $modules = $plan ? $plan->modules->map(function ($module) {
            return [
                'id' => $module->id,
                'name' => $module->name,
                'slug' => $module->slug,
                'description' => $module->description,
                'category' => $module->category,
                'is_enabled' => $module->pivot->is_enabled ?? false,
            ];
        }) : [];

        $enabledModules = $modules->where('is_enabled', true);
        $disabledModules = $modules->where('is_enabled', false);

        // Count ALL active users and projects (not scoped to subscription period)
        // This ensures limits are enforced against total resource count
        $currentUsers = \App\Models\User::count();
        $currentProjects = \App\Models\Project::count();

        // Check for org-specific trial config overrides
        $effectiveMaxUsers = $plan?->max_users;
        $effectiveMaxProjects = $plan?->max_projects;
        $effectiveMaxStorage = $plan?->max_storage_gb;
        $effectivePriceMonthly = $plan?->price_monthly;
        $effectivePriceYearly = $plan?->price_yearly;
        $isCustomPlan = $subscription->is_custom;
        $trialConfig = null;

        // Apply custom plan overrides if set
        if ($isCustomPlan) {
            $effectiveMaxUsers = $subscription->custom_max_users ?? $effectiveMaxUsers;
            $effectiveMaxProjects = $subscription->custom_max_projects ?? $effectiveMaxProjects;
            $effectiveMaxStorage = $subscription->custom_max_storage_gb ?? $effectiveMaxStorage;
            $effectivePriceMonthly = $subscription->custom_price_monthly ?? $effectivePriceMonthly;
            $effectivePriceYearly = $subscription->custom_price_yearly ?? $effectivePriceYearly;
        }

        if ($plan && $plan->slug === 'trial') {
            $trialSetting = \App\Models\Master\OrganizationTrialSetting::on('mysql_master')
                ->where('organization_id', $org->id)
                ->first();

            if ($trialSetting) {
                $effectiveMaxUsers = $trialSetting->max_users;
                $effectiveMaxProjects = $trialSetting->max_projects;
                $effectiveMaxStorage = $trialSetting->max_storage_gb;
                $trialConfig = [
                    'is_custom' => true,
                    'trial_duration' => $trialSetting->trial_duration,
                    'trial_duration_unit' => $trialSetting->trial_duration_unit,
                    'max_users' => $trialSetting->max_users,
                    'max_projects' => $trialSetting->max_projects,
                    'max_storage_gb' => $trialSetting->max_storage_gb,
                ];
            } else {
                $trialConfig = [
                    'is_custom' => false,
                    'trial_duration' => $plan->trial_duration ?? 14,
                    'trial_duration_unit' => 'days',
                    'max_users' => $plan->max_users,
                    'max_projects' => $plan->max_projects,
                    'max_storage_gb' => $plan->max_storage_gb,
                ];
            }
        }

        return response()->json([
            'success' => true,
            'subscription' => [
                'id' => $subscription->id,
                'billing_period' => $subscription->billing_period,
                'status' => $subscription->status,
                'amount' => $subscription->amount,
                'currency' => $subscription->currency,
                'starts_at' => $subscription->starts_at?->toISOString(),
                'ends_at' => $subscription->ends_at?->toISOString(),
                'cancelled_at' => $subscription->cancelled_at?->toISOString(),
                'trial_ends_at' => $subscription->trial_ends_at?->toISOString(),
                'created_at' => $subscription->created_at?->toISOString(),
            ],
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'price_monthly' => $effectivePriceMonthly,
                'price_yearly' => $effectivePriceYearly,
                'max_users' => $effectiveMaxUsers,
                'max_projects' => $effectiveMaxProjects,
                'max_storage_gb' => $effectiveMaxStorage,
                'is_custom' => $isCustomPlan,
            ] : null,
            'trial_config' => $trialConfig,
            'usage' => [
                'users' => $currentUsers,
                'projects' => $currentProjects,
            ],
            'modules' => [
                'enabled' => $enabledModules->values(),
                'disabled' => $disabledModules->values(),
                'total_enabled' => $enabledModules->count(),
                'total_disabled' => $disabledModules->count(),
            ],
            'organization' => [
                'name' => $org->name,
                'status' => $org->status,
                'is_owner' => $org->isOwner(),
                'trial_ends_at' => $org->trial_ends_at?->toISOString(),
            ],
        ]);
    }

    /**
     * Get subscription history for the current organization.
     */
    public function getSubscriptionHistory(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json([
                'success' => false,
                'message' => 'Organization not found.',
            ], 404);
        }

        $history = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan:id,name,slug', 'previousPlan:id,name,slug')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        $totalSubscriptions = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)->count();
        $planChanges = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)
            ->whereIn('event_type', ['plan_changed', 'plan_upgraded', 'plan_downgraded'])->count();
        $renewals = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('event_type', 'subscription_renewed')->count();
        $trialPeriods = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('event_type', 'trial_started')->count();

        $planUsage = OrganizationSubscriptionHistory::on('mysql_master')
            ->where('organization_id', $org->id)
            ->selectRaw('plan_id, COUNT(*) as times_used')
            ->groupBy('plan_id')
            ->get()
            ->map(function ($row) {
                $plan = \App\Models\Master\OrganizationPlan::on('mysql_master')->find($row->plan_id);
                return [
                    'plan_id' => $row->plan_id,
                    'plan_name' => $plan?->name ?? 'Unknown',
                    'plan_slug' => $plan?->slug ?? 'unknown',
                    'times_used' => $row->times_used,
                ];
            });

        return response()->json([
            'success' => true,
            'history' => $history,
            'summary' => [
                'total_subscriptions' => $totalSubscriptions,
                'total_plan_changes' => $planChanges,
                'total_renewals' => $renewals,
                'total_trial_periods' => $trialPeriods,
            ],
            'plan_usage' => $planUsage,
            'organization' => [
                'name' => $org->name,
                'created_at' => $org->created_at?->toISOString(),
            ],
        ]);
    }

    /**
     * Get comprehensive organization details for the current tenant.
     * Read-only — used by Settings → Organization Details.
     */
    public function getOrganizationDetails(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = \App\Models\Master\OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan.modules')
            ->latest()
            ->first();

        $domains = \App\Models\Master\OrganizationDomain::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get()
            ->map(fn($d) => [
                'id' => $d->id,
                'domain' => $d->domain,
                'is_primary' => $d->is_primary,
                'is_verified' => $d->is_verified,
            ]);

        $currentUsers = \App\Models\User::count();
        $currentProjects = \App\Models\Project::count();

        $plan = $subscription?->plan;
        $modules = $plan?->modules->map(fn($m) => [
            'id' => $m->id,
            'name' => $m->name,
            'slug' => $m->slug,
            'is_enabled' => $m->pivot->is_enabled ?? false,
        ]) ?? collect();

        $effectiveMaxUsers = $plan?->max_users;
        $effectiveMaxProjects = $plan?->max_projects;
        $effectiveMaxStorage = $plan?->max_storage_gb;
        $effectivePriceMonthly = $plan?->price_monthly;
        $effectivePriceYearly = $plan?->price_yearly;
        $isCustomPlan = $subscription?->is_custom ?? false;

        if ($isCustomPlan && $subscription) {
            $effectiveMaxUsers = $subscription->custom_max_users ?? $effectiveMaxUsers;
            $effectiveMaxProjects = $subscription->custom_max_projects ?? $effectiveMaxProjects;
            $effectiveMaxStorage = $subscription->custom_max_storage_gb ?? $effectiveMaxStorage;
            $effectivePriceMonthly = $subscription->custom_price_monthly ?? $effectivePriceMonthly;
            $effectivePriceYearly = $subscription->custom_price_yearly ?? $effectivePriceYearly;
        }

        $trialConfig = null;
        if ($plan && $plan->slug === 'trial') {
            $trialSetting = \App\Models\Master\OrganizationTrialSetting::on('mysql_master')
                ->where('organization_id', $org->id)->first();
            $trialConfig = $trialSetting ? [
                'is_custom' => true,
                'trial_duration' => $trialSetting->trial_duration,
                'trial_duration_unit' => $trialSetting->trial_duration_unit,
                'max_users' => $trialSetting->max_users,
                'max_projects' => $trialSetting->max_projects,
                'max_storage_gb' => $trialSetting->max_storage_gb,
            ] : [
                'is_custom' => false,
                'trial_duration' => $plan->trial_duration ?? 14,
                'trial_duration_unit' => 'days',
                'max_users' => $plan->max_users,
                'max_projects' => $plan->max_projects,
                'max_storage_gb' => $plan->max_storage_gb,
            ];
        }

        $settings = $org->settings ?? [];

        $adminName = null;
        $adminEmail = null;
        $adminPhone = null;
        try {
            $dbName = $org->database_name;
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $stmt = $pdo->prepare(
                "SELECT name, email, phone_number FROM `{$escaped}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
            );
            $stmt->execute();
            $admin = $stmt->fetchAll(\PDO::FETCH_OBJ);
            if (!empty($admin)) {
                $adminName = $admin[0]->name ?? null;
                $adminEmail = $admin[0]->email ?? null;
                $adminPhone = $admin[0]->phone_number ?? null;
            }
        } catch (\Throwable $e) {
            \Log::error('Failed to fetch admin details from tenant DB', ['org_id' => $org->id, 'error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'organization' => [
                'id' => $org->id,
                'name' => $org->name,
                'slug' => $org->slug,
                'status' => $org->status,
                'type' => $org->type,
                'database_name' => $org->database_name,
                'email_policy' => $org->email_policy ?? 'standard',
                'timezone' => $org->timezone ?? 'Asia/Karachi',
                'created_at' => $org->created_at?->toISOString(),
                'admin_name' => $adminName,
                'admin_email' => $adminEmail,
                'admin_phone' => $adminPhone,
                'country_code' => $org->country_code,
                'is_owner' => $org->isOwner(),
                'settings' => $settings,
                'domain' => \App\Helpers\UrlHelper::getOrganizationUrl($org->slug),
            ],
            'subscription' => $subscription ? [
                'id' => $subscription->id,
                'billing_period' => $subscription->billing_period,
                'status' => $subscription->status,
                'amount' => $subscription->amount,
                'currency' => $subscription->currency,
                'starts_at' => $subscription->starts_at?->toISOString(),
                'ends_at' => $subscription->ends_at?->toISOString(),
                'created_at' => $subscription->created_at?->toISOString(),
            ] : null,
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'price_monthly' => $effectivePriceMonthly,
                'price_yearly' => $effectivePriceYearly,
                'max_users' => $effectiveMaxUsers,
                'max_projects' => $effectiveMaxProjects,
                'max_storage_gb' => $effectiveMaxStorage,
                'is_custom' => $isCustomPlan,
            ] : null,
            'trial_config' => $trialConfig,
            'usage' => [
                'users' => $currentUsers,
                'projects' => $currentProjects,
            ],
            'modules' => [
                'enabled' => $modules->where('is_enabled', true)->values(),
                'disabled' => $modules->where('is_enabled', false)->values(),
            ],
            'domains' => $domains,
        ]);
    }

    /**
     * Get billing history for the current organization.
     */
    public function getBillingHistory(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $invoices = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan:id,name,slug')
            ->orderBy('created_at', 'desc')
            ->get();

        $totalPaid = $invoices->where('status', 'paid')->sum('total_amount');
        $totalPending = $invoices->where('status', 'pending')->sum('total_amount');
        $totalApproved = $invoices->where('status', 'approved')->sum('total_amount');

        return response()->json([
            'success' => true,
            'invoices' => $invoices,
            'summary' => [
                'total_paid' => round($totalPaid, 2),
                'total_pending' => round($totalPending, 2),
                'total_approved' => round($totalApproved, 2),
                'total_invoices' => $invoices->count(),
            ],
        ]);
    }

    /**
     * Update organization timezone preference.
     */
    public function updateTimezone(Request $request): JsonResponse
    {
        $request->validate([
            'timezone' => ['required', 'string', 'max:50'],
        ]);

        $org = $this->resolveOrganization($request);

        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $org->update(['timezone' => $request->input('timezone')]);

        return response()->json([
            'success' => true,
            'message' => 'Timezone updated successfully.',
            'timezone' => $org->timezone,
        ]);
    }
}
