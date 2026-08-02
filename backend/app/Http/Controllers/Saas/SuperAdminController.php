<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationDomain;
use App\Models\Master\SaasModule;
use App\Models\Master\ActivityLog;
use App\Services\Saas\OrganizationService;
use App\Services\Saas\ModuleService;
use App\Services\Saas\SubscriptionService;
use App\Services\Saas\Infrastructure\HealthCheckService;
use App\Mail\OrganizationWelcome;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Artisan;

class SuperAdminController extends Controller
{
    public function __construct(
        protected OrganizationService $orgService,
        protected ModuleService $moduleService,
        protected SubscriptionService $subscriptionService,
        protected HealthCheckService $healthCheck,
    ) {}

    // ─── Public Organization Registration ───────────────────────────

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
            'name'         => 'required|string|max:255',
            'email'        => 'required|email|unique:mysql_master.organizations,name', // We check user email separately
            'phone'        => 'nullable|string|max:50',
            'email_policy' => 'nullable|string|in:standard,company_required',
        ]);

        // Check if email already exists as admin in any tenant DB
        $email = $validated['email'];
        $existingOrgs = Organization::where('status', '!=', 'deleted')->get();
        foreach ($existingOrgs as $org) {
            try {
                $dbName = $org->database_name;
                $exists = DB::connection('mysql')->select("SHOW TABLES LIKE ?", [$dbName . '.users']);
                if (!empty($exists)) {
                    $result = DB::connection('mysql')->select(
                        "SELECT id FROM `{$dbName}`.`users` WHERE email = ? LIMIT 1",
                        [$email]
                    );
                    if (!empty($result)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'This email is already registered. Please use a different email or contact support.',
                        ], 422);
                    }
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        // Generate slug from company name
        $slug = Str::slug($validated['company_name']);
        $originalSlug = $slug;
        $counter = 1;
        while (Organization::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $originalSlug . '-' . $counter;
            $counter++;
        }

        // Auto-generate password (guest pattern)
        $plainPassword = Str::random(10) . '@' . Str::random(2);

        $dbName = config('tenancy.database_prefix', 'pms_tenant_') . $slug;
        $domain = $slug . '.pms.test';

        try {
            // Step 1: Create database
            $pdo = DB::connection('mysql_master')->getPdo();
            $escaped = str_replace('`', '``', $dbName);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            // Step 2: Run tenant migrations
            $masterConfig = config('database.connections.mysql_master');
            config()->set('database.connections.tenant', [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $dbName,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => true,
                'strict'    => true,
                'engine'    => null,
            ]);
            Artisan::call('migrate', ['--database' => 'tenant', '--force' => true]);

            // Step 3: Create organization record
            $org = Organization::create([
                'name'            => $validated['name'],
                'slug'            => $slug,
                'database_name'   => $dbName,
                'database_host'   => $masterConfig['host'],
                'database_port'   => $masterConfig['port'],
                'database_username' => $masterConfig['username'],
                'database_password' => $masterConfig['password'] ?? '',
                'type'            => 'standard',
                'status'          => 'trial',
                'timezone'        => 'Asia/Karachi',
                'email_policy'    => $validated['email_policy'] ?? 'standard',
                'trial_ends_at'   => now()->addDays(14),
            ]);

            // Step 4: Register domain
            OrganizationDomain::create([
                'organization_id' => $org->id,
                'domain'          => $domain,
                'is_primary'      => true,
                'is_verified'     => true,
                'verified_at'     => now(),
            ]);

            // Step 5: Create admin user in tenant DB (active, must_change_password)
            DB::connection('mysql')->select(
                "INSERT INTO `{$dbName}`.`users` (name, email, personal_email, professional_email, password, role, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())",
                [$validated['name'], $email, $email, $email, Hash::make($plainPassword)]
            );

            // Step 6: Send welcome email with credentials
            $loginUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/') . '/login';
            $emailSent = false;
            $emailError = null;
            try {
                Mail::to($email)->send(new OrganizationWelcome(
                    $org,
                    $validated['name'],
                    $email,
                    $plainPassword,
                    $loginUrl
                ));
                $emailSent = true;
            } catch (\Throwable $mailError) {
                $emailError = $mailError->getMessage();
                \Log::warning('Organization welcome email dispatch failed: ' . $emailError);
            }

            // Log activity
            ActivityLog::create([
                'user'   => $validated['name'],
                'action' => 'Organization registered (self-service)',
                'target' => $org->name,
                'ip'     => $request->ip(),
                'status' => 'success',
            ]);

            $message = $emailSent
                ? 'Organization created successfully! Check your email for login credentials.'
                : 'Organization created successfully! Email could not be sent. Please contact support for credentials.';

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => [
                    'organization' => $org->fresh(),
                    'login_url'    => $loginUrl,
                ],
            ], 201);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create organization: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Dashboard Stats ────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $orgStats = $this->orgService->getStats();

        $totalUsers = $this->getTotalUsers();
        $totalProjects = $this->getTotalProjects();
        $totalModules = SaasModule::where('is_active', true)->count();

        $this->logActivity('System', 'Viewed dashboard stats');

        return response()->json([
            'success' => true,
            'data' => array_merge($orgStats, [
                'total_users' => $totalUsers,
                'total_projects' => $totalProjects,
                'total_modules' => $totalModules,
                'total_plans' => OrganizationPlan::where('is_active', true)->count(),
            ]),
        ]);
    }

    private function getTotalUsers(): int
    {
        $count = 0;
        $orgs = Organization::where('status', '!=', 'deleted')->get();
        foreach ($orgs as $org) {
            $count += $this->getOrgUserCount($org);
        }
        return $count;
    }

    private function getTotalProjects(): int
    {
        $count = 0;
        $orgs = Organization::where('status', '!=', 'deleted')->get();
        foreach ($orgs as $org) {
            $count += $this->getOrgProjectCount($org);
        }
        return $count;
    }

    // ─── Organizations CRUD ─────────────────────────────────────────

    public function organizations(Request $request): JsonResponse
    {
        $query = Organization::with(['subscription.plan', 'primaryDomain'])
            ->where('status', '!=', 'deleted');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $orgs = $query->orderBy('name')->get();

        $orgs->transform(function ($org) {
            $org->users_count = $this->getOrgUserCount($org);
            $org->projects_count = $this->getOrgProjectCount($org);
            return $org;
        });

        return response()->json(['success' => true, 'data' => $orgs]);
    }

    public function organization(int $id): JsonResponse
    {
        $org = Organization::with(['subscription.plan', 'domains'])->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org->users_count = $this->getOrgUserCount($org);
        $org->projects_count = $this->getOrgProjectCount($org);

        return response()->json(['success' => true, 'data' => $org]);
    }

    public function storeOrganization(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'          => 'required|string|max:255',
            'admin_email'   => 'required|email',
            'admin_name'    => 'required|string|max:255',
            'email_policy'  => 'nullable|string|in:standard,company_required',
        ]);

        // Auto-generate slug from company name
        $slug = Str::slug($validated['name']);
        $originalSlug = $slug;
        $counter = 1;
        while (Organization::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $originalSlug . '-' . $counter;
            $counter++;
        }

        $dbName = config('tenancy.database_prefix', 'pms_tenant_') . $slug;
        $domain = $slug . '.pms.test';

        try {
            // Step 1: Create database
            $pdo = DB::connection('mysql_master')->getPdo();
            $escaped = str_replace('`', '``', $dbName);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            // Step 2: Run tenant migrations
            $masterConfig = config('database.connections.mysql_master');
            config()->set('database.connections.tenant', [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $dbName,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => true,
                'strict'    => true,
                'engine'    => null,
            ]);
            Artisan::call('migrate', ['--database' => 'tenant', '--force' => true]);

            // Step 3: Create organization record
            $org = Organization::create([
                'name'            => $validated['name'],
                'slug'            => $slug,
                'database_name'   => $dbName,
                'database_host'   => $masterConfig['host'],
                'database_port'   => $masterConfig['port'],
                'database_username' => $masterConfig['username'],
                'database_password' => $masterConfig['password'] ?? '',
                'type'            => 'standard',
                'status'          => 'trial',
                'timezone'        => 'Asia/Karachi',
                'email_policy'    => $validated['email_policy'] ?? 'standard',
                'trial_ends_at'   => now()->addDays(14),
            ]);

            // Step 4: Register domain
            OrganizationDomain::create([
                'organization_id' => $org->id,
                'domain'          => $domain,
                'is_primary'      => true,
                'is_verified'     => true,
                'verified_at'     => now(),
            ]);

            // Step 5: Create admin user in tenant DB (active, must_change_password)
            $plainPassword = Str::random(10) . '@' . Str::random(2);
            DB::connection('mysql')->select(
                "INSERT INTO `{$dbName}`.`users` (name, email, personal_email, professional_email, password, role, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())",
                [$validated['admin_name'], $validated['admin_email'], $validated['admin_email'], $validated['admin_email'], Hash::make($plainPassword)]
            );

            // Step 6: Send welcome email
            $loginUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/') . '/login';
            $emailSent = false;
            $emailError = null;
            try {
                Mail::to($validated['admin_email'])->send(new OrganizationWelcome(
                    $org,
                    $validated['admin_name'],
                    $validated['admin_email'],
                    $plainPassword,
                    $loginUrl
                ));
                $emailSent = true;
            } catch (\Throwable $mailError) {
                $emailError = $mailError->getMessage();
                \Log::warning('Organization welcome email failed: ' . $emailError);
            }

            // Log activity
            ActivityLog::create([
                'user'   => 'Admin',
                'action' => 'Provisioned new organization',
                'target' => $org->name,
                'ip'     => $request->ip(),
                'status' => 'success',
            ]);

            $message = $emailSent
                ? 'Organization provisioned successfully. Welcome email queued.'
                : 'Organization provisioned successfully. Email dispatch failed. Share credentials manually.';

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => $org->fresh(),
                'admin_email' => $validated['admin_email'],
                'admin_password' => $plainPassword,
                'email_sent' => $emailSent,
                'email_error' => $emailError,
            ], 201);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create organization: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateOrganization(Request $request, int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'slug' => 'sometimes|string|max:255|unique:mysql_master.organizations,slug,' . $id,
            'email_policy' => 'sometimes|string|in:standard,company_required',
        ]);

        $org->update($validated);
        $this->logActivity('Admin', 'Updated organization', $org->name);

        return response()->json(['success' => true, 'data' => $org->fresh()]);
    }

    public function destroyOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org->update(['status' => 'deleted']);
        $this->logActivity('Admin', 'Deleted organization', $org->name);

        return response()->json(['success' => true, 'message' => 'Organization deleted']);
    }

    // ─── Organization Actions ───────────────────────────────────────

    public function suspendOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org = $this->orgService->suspend($org);
        $this->logActivity('Admin', 'Suspended organization', $org->name, 'warning');

        return response()->json(['success' => true, 'data' => $org]);
    }

    public function activateOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org = $this->orgService->reactivate($org);
        $this->logActivity('Admin', 'Activated organization', $org->name);

        return response()->json(['success' => true, 'data' => $org]);
    }

    // ─── Plans ──────────────────────────────────────────────────────

    public function plans(): JsonResponse
    {
        $plans = OrganizationPlan::with('modules')->get();
        return response()->json(['success' => true, 'data' => $plans]);
    }

    // ─── Modules ────────────────────────────────────────────────────

    public function modules(): JsonResponse
    {
        $modules = $this->moduleService->getAll();
        return response()->json(['success' => true, 'data' => $modules]);
    }

    // ─── Domains ────────────────────────────────────────────────────

    public function domains(): JsonResponse
    {
        $domains = OrganizationDomain::with('organization')->get();
        return response()->json(['success' => true, 'data' => $domains]);
    }

    // ─── Activity Logs ──────────────────────────────────────────────

    public function activityLogs(Request $request): JsonResponse
    {
        $query = ActivityLog::query();

        if ($search = $request->input('search')) {
            $query->search($search);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $logs = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json(['success' => true, 'data' => $logs]);
    }

    // ─── System Health ──────────────────────────────────────────────

    public function health(): JsonResponse
    {
        $results = $this->healthCheck->check();
        return response()->json(['success' => true, 'data' => $results]);
    }

    public function healthTenant(string $slug): JsonResponse
    {
        $org = Organization::where('slug', $slug)->first();
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $results = $this->healthCheck->check($org);
        return response()->json(['success' => true, 'data' => $results]);
    }

    public function healthAll(): JsonResponse
    {
        $orgs = Organization::where('status', 'active')->get();
        $results = [];

        foreach ($orgs as $org) {
            try {
                $results[$org->slug] = $this->healthCheck->check($org);
            } catch (\Throwable $e) {
                $results[$org->slug] = ['status' => 'error', 'message' => $e->getMessage()];
            }
        }

        return response()->json(['success' => true, 'data' => $results]);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private function createAdminUser(Organization $org, array $data): void
    {
        $dbName = $org->database_name;

        DB::connection('mysql')->select(
            "INSERT INTO `{$dbName}`.`users` (name, email, password, role, active, created_at, updated_at) 
             VALUES (?, ?, ?, 'admin', 1, NOW(), NOW())",
            [$data['admin_name'], $data['admin_email'], Hash::make($data['admin_password'])]
        );
    }

    private function getOrgUserCount(Organization $org): int
    {
        try {
            $dbName = $org->database_name;
            $result = DB::connection('mysql')->select("SELECT COUNT(*) as c FROM `{$dbName}`.`users`");
            return $result[0]->c ?? 0;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function getOrgProjectCount(Organization $org): int
    {
        try {
            $dbName = $org->database_name;
            $result = DB::connection('mysql')->select("SELECT COUNT(*) as c FROM `{$dbName}`.`projects`");
            return $result[0]->c ?? 0;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function logActivity(string $user, string $action, string $target = null, string $status = 'success'): void
    {
        ActivityLog::create([
            'user'   => $user,
            'action' => $action,
            'target' => $target,
            'ip'     => request()->ip(),
            'status' => $status,
        ]);
    }
}
