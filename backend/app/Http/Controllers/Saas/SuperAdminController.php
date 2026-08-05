<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationDomain;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\SaasModule;
use App\Models\Master\ActivityLog;
use App\Services\Saas\OrganizationService;
use App\Services\Saas\ModuleService;
use App\Services\Saas\SubscriptionService;
use App\Services\Saas\SubscriptionHistoryService;
use App\Services\Saas\TrialResolverService;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\Infrastructure\HealthCheckService;
use App\Mail\OrganizationWelcome;
use App\Jobs\SendOrganizationWelcomeEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;

class SuperAdminController extends Controller
{
    public function __construct(
        protected OrganizationService $orgService,
        protected ModuleService $moduleService,
        protected SubscriptionService $subscriptionService,
        protected SubscriptionHistoryService $historyService,
        protected TrialResolverService $trialResolver,
        protected HealthCheckService $healthCheck,
    ) {
        // Wire up history service to subscription service
        $this->subscriptionService->setHistoryService($this->historyService);
    }

    // ─── Super Admin Profile ───────────────────────────────────────

    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'email'        => 'required|email',
            'old_password' => 'required',
            'new_password' => ['required', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/'],
        ]);

        $email = $request->input('email');
        $orgs = Organization::where('status', '!=', 'deleted')->get();

        foreach ($orgs as $org) {
            try {
                $dbName = $org->database_name;
                $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
                $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
                $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
                $pdo = new \PDO($dsn, $username, $dbPassword, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_TIMEOUT => 2,
                ]);

                $stmt = $pdo->prepare("SELECT id, password FROM `users` WHERE email = ? OR professional_email = ? OR personal_email = ? LIMIT 1");
                $stmt->execute([$email, $email, $email]);
                $userRow = $stmt->fetch(\PDO::FETCH_OBJ);

                if (!$userRow) { $pdo = null; continue; }

                if (!\Hash::check($request->old_password, $userRow->password)) {
                    $pdo = null;
                    return response()->json(['success' => false, 'message' => 'Current password is incorrect'], 422);
                }

                $newHash = \Hash::make($request->new_password);
                $stmt3 = $pdo->prepare("UPDATE `users` SET `password` = ?, `updated_at` = NOW() WHERE id = ?");
                $stmt3->execute([$newHash, $userRow->id]);

                $pdo = null;
                return response()->json(['success' => true, 'message' => 'Password updated successfully']);
            } catch (\Throwable $e) {
                continue;
            }
        }

        return response()->json(['success' => false, 'message' => 'User not found'], 404);
    }

    public function myProfile(Request $request): JsonResponse
    {
        $email = $request->input('email') ?? $request->query('email');
        if (!$email) {
            return response()->json(['success' => false, 'message' => 'Email is required'], 422);
        }

        $orgs = Organization::where('status', '!=', 'deleted')->get();

        foreach ($orgs as $org) {
            try {
                $dbName = $org->database_name;
                $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
                $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
                $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
                $pdo = new \PDO($dsn, $username, $dbPassword, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_TIMEOUT => 2,
                ]);

                $stmt = $pdo->prepare("SELECT * FROM `users` WHERE email = ? OR professional_email = ? OR personal_email = ? LIMIT 1");
                $stmt->execute([$email, $email, $email]);
                $userRow = $stmt->fetch(\PDO::FETCH_OBJ);

                $pdo = null;

                if ($userRow) {
                    return response()->json([
                        'success' => true,
                        'user' => [
                            'id'                    => (int) $userRow->id,
                            'name'                  => $userRow->name,
                            'email'                 => $userRow->email ?? $userRow->professional_email,
                            'role'                  => $userRow->role,
                            'active'                => (bool) $userRow->active,
                            'avatar'                => $userRow->avatar ?? null,
                            'phone_number'          => $userRow->phone_number ?? $userRow->contact_no ?? null,
                            'father_name'           => $userRow->father_name ?? null,
                            'id_card_number'        => $userRow->id_card_number ?? null,
                            'present_address'       => $userRow->present_address ?? $userRow->address ?? null,
                            'permanent_address'     => $userRow->permanent_address ?? null,
                            'emergency_contact_name'     => $userRow->emergency_contact_name ?? null,
                            'emergency_contact_relation' => $userRow->emergency_contact_relation ?? null,
                            'emergency_contact_phone'    => $userRow->emergency_contact_phone ?? null,
                            'created_at'            => $userRow->created_at,
                            'last_login_at'         => $userRow->last_login_at ?? null,
                        ],
                        'account' => [
                            'status'    => $userRow->active ? 'Active' : 'Inactive',
                            'last_login' => $userRow->last_login_at,
                        ],
                    ]);
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return response()->json(['success' => false, 'message' => 'User not found'], 404);
    }

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
        $domain = $slug . '.' . config('tenancy.domain', 'pms.test');

        try {
            // Step 1: Drop + Create database (clean slate)
            $pdo = DB::connection('mysql_master')->getPdo();
            $escaped = str_replace('`', '``', $dbName);
            $pdo->exec("DROP DATABASE IF EXISTS `{$escaped}`");
            $pdo->exec("CREATE DATABASE `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            // Step 2: Import tenant schema (fast — bypasses 134 individual migrations)
            $this->importTenantSchema($dbName);

            // Step 3: Create organization record
            $masterConfig = config('database.connections.mysql_master');
            $trialPlan = OrganizationPlan::where('slug', 'trial')->first();
            $trialMinutes = $trialPlan ? $trialPlan->getTrialMinutes() : 14 * 24 * 60;
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
                'trial_ends_at'   => now()->addMinutes($trialMinutes),
            ]);

            // Step 4: Register domain
            OrganizationDomain::create([
                'organization_id' => $org->id,
                'domain'          => $domain,
                'is_primary'      => true,
                'is_verified'     => true,
                'verified_at'     => now(),
            ]);

            // Step 5: Create tenant-specific company documents directory
            $this->createTenantCompanyDocsDirectory($slug);

            // Step 6: Create admin user in tenant DB (active, must_change_password)
            $phone = $validated['phone'] ?? null;
            $hashedPassword = Hash::make($plainPassword);
            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $stmt = $pdo->prepare("INSERT INTO `{$escaped}`.`users` (name, email, personal_email, professional_email, phone_number, contact_no, password, role, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())");
            $stmt->execute([$validated['name'], $email, $email, $email, $phone, $phone, $hashedPassword]);

            // Step 7: Send welcome email with credentials (non-blocking via queue)
            $loginUrl = rtrim(config('app.frontend_url'), '/') . '/login';
            $org->load('subscription.plan');
            try {
                SendOrganizationWelcomeEmail::dispatch($org, $validated['name'], $email, $plainPassword, $loginUrl);
            } catch (\Throwable $e) {
                \Log::warning("Welcome email dispatch failed for {$email}: " . $e->getMessage());
            }

            // Log activity
            ActivityLog::create([
                'user'   => $validated['name'],
                'action' => 'Organization registered (self-service)',
                'target' => $org->name,
                'ip'     => $request->ip(),
                'status' => 'success',
            ]);

            // Record subscription history for self-service registration
            $subscription = $org->subscription;
            if ($subscription) {
                $this->historyService->record(
                    organization: $org,
                    eventType: 'trial_started',
                    plan: $subscription->plan,
                    subscription: $subscription,
                    changedBy: $validated['name'],
                    status: 'trial',
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Organization created successfully! Check your email for login credentials.',
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
            // "active" filter includes trial orgs (trial = active but in trial period)
            if ($status === 'active') {
                $query->whereIn('status', ['active', 'trial']);
            } else {
                $query->where('status', $status);
            }
        }

        $orgs = $query->orderBy('name')->get();

        $orgs->transform(function ($org) {
            $org->users_count = $this->getOrgUserCount($org);
            $org->projects_count = $this->getOrgProjectCount($org);
            $org->trial_config = $this->trialResolver->resolve($org);
            return $org;
        });

        return response()->json(['success' => true, 'data' => $orgs]);
    }

    public function organization(int $id): JsonResponse
    {
        $org = Organization::with(['subscription.plan.modules', 'domains', 'trialSetting'])->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org->users_count = $this->getOrgUserCount($org);
        $org->projects_count = $this->getOrgProjectCount($org);

        // Attach resolved trial configuration
        $org->trial_config = $this->trialResolver->resolve($org);

        // Fetch admin user details from tenant DB
        try {
            $dbName = $org->database_name;
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $stmt = $pdo->prepare("SELECT name, email, phone_number FROM `{$escaped}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
            $stmt->execute();
            $admin = $stmt->fetchAll(\PDO::FETCH_OBJ);
            $org->admin_name = $admin[0]->name ?? null;
            $org->admin_email = $admin[0]->email ?? null;
            $org->admin_phone = $admin[0]->phone_number ?? null;
        } catch (\Throwable $e) {
            $org->admin_name = null;
            $org->admin_email = null;
            $org->admin_phone = null;
        }

        return response()->json(['success' => true, 'data' => $org]);
    }

    public function storeOrganization(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'           => 'required|string|max:255',
            'admin_email'    => 'required|email',
            'admin_name'     => 'required|string|max:255',
            'admin_phone'    => 'nullable|string|max:50',
            'email_policy'   => 'nullable|string|in:standard,company_required',
            'plan_id'        => 'required|integer|exists:mysql_master.organization_plans,id',
            'billing_period' => 'nullable|string|in:monthly,yearly',
            'customize_trial' => 'nullable|boolean',
            'trial_duration'       => 'nullable|integer|min:1',
            'trial_duration_unit'  => 'nullable|string|in:minutes,hours,days',
            'trial_max_users'      => 'nullable|integer|min:1',
            'trial_max_projects'   => 'nullable|integer|min:1',
            'trial_max_storage_gb' => 'nullable|integer|min:1',
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
        $domain = $slug . '.' . config('tenancy.domain', 'pms.test');

        try {
            // Step 1: Drop + Create database (clean slate)
            $pdo = DB::connection('mysql_master')->getPdo();
            $escaped = str_replace('`', '``', $dbName);
            $pdo->exec("DROP DATABASE IF EXISTS `{$escaped}`");
            $pdo->exec("CREATE DATABASE `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            // Step 2: Import tenant schema (fast — bypasses 134 individual migrations)
            $this->importTenantSchema($dbName);

            // Step 3: Create organization record
            $masterConfig = config('database.connections.mysql_master');
            $trialPlan = OrganizationPlan::where('slug', 'trial')->first();

            // Resolve trial duration — use custom if provided, else plan default
            if (!empty($validated['customize_trial']) && $trialPlan) {
                $trialMinutes = $this->trialResolver->resolveTrialMinutes(
                    $validated['trial_duration'] ?? $trialPlan->trial_duration,
                    $validated['trial_duration_unit'] ?? $trialPlan->trial_duration_unit
                );
            } else {
                $trialMinutes = $trialPlan ? $trialPlan->getTrialMinutes() : 14 * 24 * 60;
            }

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
                'trial_ends_at'   => now()->addMinutes($trialMinutes),
            ]);

            // Step 4: Register domain
            OrganizationDomain::create([
                'organization_id' => $org->id,
                'domain'          => $domain,
                'is_primary'      => true,
                'is_verified'     => true,
                'verified_at'     => now(),
            ]);

            // Step 5: Create tenant-specific company documents directory
            $this->createTenantCompanyDocsDirectory($slug);

            // Step 6: Create admin user in tenant DB (active, must_change_password)
            $plainPassword = Str::random(10) . '@' . Str::random(2);
            $adminPhone = $validated['admin_phone'] ?? null;
            $hashedPassword = Hash::make($plainPassword);

            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("SET CHARACTER SET utf8mb4");
            $escaped = str_replace('`', '``', $dbName);
            $stmt = $pdo->prepare("INSERT INTO `{$escaped}`.`users` (name, email, personal_email, professional_email, phone_number, contact_no, password, role, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())");
            $stmt->execute([$validated['admin_name'], $validated['admin_email'], $validated['admin_email'], $validated['admin_email'], $adminPhone, $adminPhone, $hashedPassword]);

            // Step 7: Assign selected plan to organization
            $plan = OrganizationPlan::find($validated['plan_id']);
            $billingPeriod = $validated['billing_period'] ?? 'monthly';
            $isTrial = $plan->slug === 'trial';
            $planTrialMinutes = $plan->getTrialMinutes();
            OrganizationSubscription::create([
                'organization_id' => $org->id,
                'plan_id'         => $plan->id,
                'billing_period'  => $billingPeriod,
                'status'          => $isTrial ? 'trial' : 'active',
                'amount'          => $isTrial ? 0 : ($billingPeriod === 'monthly' ? $plan->price_monthly : $plan->price_yearly),
                'currency'        => 'USD',
                'starts_at'       => now(),
                'ends_at'         => $isTrial ? now()->addMinutes($planTrialMinutes) : ($billingPeriod === 'yearly' ? now()->addYear() : now()->addMonth()),
                'trial_ends_at'   => $isTrial ? now()->addMinutes($planTrialMinutes) : null,
            ]);

            // Update org status to trial if trial plan selected
            if ($isTrial) {
                $org->update(['status' => 'trial', 'trial_ends_at' => now()->addMinutes($planTrialMinutes)]);
            }

            // Record subscription history
            $this->historyService->record(
                organization: $org,
                eventType: $isTrial ? 'trial_started' : 'plan_assigned',
                plan: $plan,
                subscription: $subscription ?? null,
                changedBy: $request->header('X-Admin-Name', 'Super Admin'),
                status: $isTrial ? 'trial' : 'active',
            );

            // Step 7b: Create org-specific trial override if customized
            if ($isTrial && !empty($validated['customize_trial'])) {
                $this->trialResolver->setOverride($org, [
                    'trial_duration'      => $validated['trial_duration'] ?? $plan->trial_duration,
                    'trial_duration_unit' => $validated['trial_duration_unit'] ?? $plan->trial_duration_unit,
                    'max_users'           => $validated['trial_max_users'] ?? $plan->max_users,
                    'max_projects'        => $validated['trial_max_projects'] ?? $plan->max_projects,
                    'max_storage_gb'      => $validated['trial_max_storage_gb'] ?? $plan->max_storage_gb,
                ]);
            }

            // Step 8: Send welcome email (non-blocking via queue)
            $loginUrl = rtrim(config('app.frontend_url'), '/') . '/login';
            $org->load('subscription.plan');
            try {
                SendOrganizationWelcomeEmail::dispatch($org, $validated['admin_name'], $validated['admin_email'], $plainPassword, $loginUrl);
            } catch (\Throwable $e) {
                \Log::warning("Welcome email dispatch failed for {$validated['admin_email']}: " . $e->getMessage());
            }

            // Log activity
            ActivityLog::create([
                'user'   => $request->header('X-Admin-Name', 'Super Admin'),
                'action' => 'Provisioned new organization',
                'target' => $org->name,
                'ip'     => $request->ip(),
                'status' => 'success',
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Organization provisioned successfully. Welcome email queued.',
                'data' => $org->fresh(),
                'admin_email' => $validated['admin_email'],
                'admin_password' => $plainPassword,
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
            'name'            => 'sometimes|string|max:255',
            'slug'            => 'sometimes|string|max:255|unique:mysql_master.organizations,slug,' . $id,
            'email_policy'    => 'sometimes|string|in:standard,company_required',
            'timezone'        => 'sometimes|string|max:50',
            'type'            => 'sometimes|string|in:owner,standard',
            'plan_id'         => 'sometimes|integer|exists:mysql_master.organization_plans,id',
            'billing_period'  => 'sometimes|string|in:monthly,yearly',
            'admin_name'      => 'sometimes|string|max:255',
            'admin_phone'     => 'nullable|string|max:50',
        ]);

        $planId = $validated['plan_id'] ?? null;
        $billingPeriod = $validated['billing_period'] ?? null;
        $adminName = $validated['admin_name'] ?? null;
        $adminPhone = $validated['admin_phone'] ?? null;
        unset($validated['plan_id'], $validated['billing_period'], $validated['admin_name'], $validated['admin_phone']);

        if (!empty($validated)) {
            $org->update($validated);
        }

        if ($adminName || $adminPhone) {
            try {
                $dbName = $org->database_name;
                $sets = [];
                $bindings = [];
                if ($adminName) { $sets[] = '`name` = ?'; $bindings[] = $adminName; }
                if ($adminPhone !== null) { $sets[] = '`phone_number` = ?'; $bindings[] = $adminPhone; }
                if (!empty($sets)) {
                    $escaped = str_replace('`', '``', $dbName);
                    $pdo = DB::connection('mysql_master')->getPdo();
                    $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
                    $stmt = $pdo->prepare("UPDATE `{$escaped}`.`users` SET " . implode(', ', $sets) . " WHERE `role` = 'admin' LIMIT 1");
                    $stmt->execute($bindings);
                }
            } catch (\Throwable $e) {
                \Log::warning('Could not update admin user in tenant DB: ' . $e->getMessage());
            }
        }

        if ($planId) {
            $plan = \App\Models\Master\OrganizationPlan::find($planId);
            if ($plan) {
                $currentSub = $org->subscription;
                $oldPlan = $currentSub?->plan;
                if ($currentSub && $currentSub->isActive()) {
                    $currentSub->update(['status' => 'replaced']);
                }
                $newSub = \App\Models\Master\OrganizationSubscription::create([
                    'organization_id' => $org->id,
                    'plan_id'         => $plan->id,
                    'billing_period'  => $billingPeriod ?? 'monthly',
                    'status'          => 'active',
                    'amount'          => $plan->getPrice($billingPeriod ?? 'monthly'),
                    'currency'        => 'USD',
                    'starts_at'       => now(),
                    'ends_at'         => ($billingPeriod ?? 'monthly') === 'yearly' ? now()->addYear() : now()->addMonth(),
                ]);

                // Record subscription history
                if ($oldPlan) {
                    $this->historyService->recordPlanChanged(
                        organization: $org,
                        newPlan: $plan,
                        oldPlan: $oldPlan,
                        subscription: $newSub,
                    );
                } else {
                    $this->historyService->record(
                        organization: $org,
                        eventType: 'plan_assigned',
                        plan: $plan,
                        subscription: $newSub,
                    );
                }
            }
        }

        $this->logActivity('Updated organization', $org->name);

        return response()->json([
            'success' => true,
            'message' => 'Organization updated successfully.',
            'data' => $org->fresh()->load(['subscription.plan', 'primaryDomain']),
        ]);
    }

    public function destroyOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $dbName = $org->database_name;

        // 1. Drop the tenant database (all user data, sessions, tokens gone)
        try {
            app(DatabaseProvisionService::class)->dropDatabase($dbName);
        } catch (\Throwable $e) {
            \Log::error("Failed to drop tenant database {$dbName}: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete tenant database. Please try again.',
            ], 500);
        }

        // 2. Delete all domain records for this org
        OrganizationDomain::where('organization_id', $org->id)->delete();

        // 3. Soft-delete the organization record
        $org->delete();

        $this->logActivity('Deleted organization and dropped database', $org->name);

        return response()->json(['success' => true, 'message' => 'Organization and database deleted']);
    }

    // ─── Organization Actions ───────────────────────────────────────

    public function suspendOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org = $this->orgService->suspend($org);
        $this->logActivity('Suspended organization', $org->name, 'warning');

        return response()->json(['success' => true, 'data' => $org]);
    }

    public function activateOrganization(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $org = $this->orgService->reactivate($org);
        $this->logActivity('Activated organization', $org->name);

        return response()->json(['success' => true, 'data' => $org]);
    }

    // ─── Plans ──────────────────────────────────────────────────────

    public function plans(): JsonResponse
    {
        $plans = OrganizationPlan::with('modules')->get();
        return response()->json(['success' => true, 'data' => $plans]);
    }

    public function updatePlan(Request $request, int $id): JsonResponse
    {
        $plan = OrganizationPlan::find($id);
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Plan not found.'], 404);
        }

        $validated = $request->validate([
            'name'                 => ['sometimes', 'string', 'max:100'],
            'description'          => ['nullable', 'string', 'max:500'],
            'price_monthly'        => ['sometimes', 'numeric', 'min:0'],
            'price_yearly'         => ['sometimes', 'numeric', 'min:0'],
            'max_users'            => ['sometimes', 'integer', 'min:1'],
            'max_projects'         => ['sometimes', 'integer', 'min:1'],
            'max_storage_gb'       => ['sometimes', 'integer', 'min:1'],
            'trial_duration'       => ['sometimes', 'integer', 'min:1'],
            'trial_duration_unit'  => ['sometimes', 'string', 'in:minutes,hours,days'],
            'is_active'            => ['sometimes', 'boolean'],
            'is_default'           => ['sometimes', 'boolean'],
            'sort_order'           => ['sometimes', 'integer', 'min:0'],
            'module_ids'           => ['nullable', 'array'],
            'module_ids.*'         => ['integer'],
        ]);

        $moduleIds = $validated['module_ids'] ?? null;
        unset($validated['module_ids']);

        if ($moduleIds !== null) {
            $validIds = \App\Models\Master\SaasModule::whereIn('id', $moduleIds)->pluck('id')->toArray();
            $moduleIds = $validIds;
        }

        if (isset($validated['is_default']) && $validated['is_default']) {
            OrganizationPlan::where('is_default', true)->where('id', '!=', $id)->update(['is_default' => false]);
        }

        $plan->update($validated);

        if ($moduleIds !== null) {
            $syncData = [];
            foreach ($moduleIds as $moduleId) {
                $syncData[$moduleId] = ['is_enabled' => true];
            }
            $plan->modules()->sync($syncData);
        }

        $this->logActivity('Updated plan', $plan->name);

        return response()->json([
            'success' => true,
            'message' => 'Plan updated successfully.',
            'data' => $plan->fresh()->load('modules'),
        ]);
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

    private function createTenantCompanyDocsDirectory(string $slug): void
    {
        $disk = config('company.disk', 'public');
        $baseDir = config('company.upload_dir', 'company_docs');
        $tenantDir = $baseDir . '/' . $slug;

        if (!Storage::disk($disk)->exists($tenantDir)) {
            Storage::disk($disk)->makeDirectory($tenantDir);
        }
    }

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

    private function logActivity(string $action, string $target = null, string $status = 'success'): void
    {
        ActivityLog::create([
            'user'   => request()->header('X-Admin-Name', 'Super Admin'),
            'action' => $action,
            'target' => $target,
            'ip'     => request()->ip(),
            'status' => $status,
        ]);
    }

    /**
     * Import the pre-generated tenant schema SQL file into a database.
     * Uses PDO with multi-statements enabled — ~25x faster than 134 Laravel migrations.
     */
    private function importTenantSchema(string $dbName): void
    {
        $schemaPath = database_path('tenant-schema.sql');
        if (!file_exists($schemaPath)) {
            throw new \RuntimeException('Tenant schema file not found: ' . $schemaPath);
        }

        $masterConfig = config('database.connections.mysql_master');
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $masterConfig['host'],
            $masterConfig['port'],
            $dbName
        );

        $pdo = new \PDO($dsn, $masterConfig['username'], $masterConfig['password'] ?? '', [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_TIMEOUT => 60,
        ]);

        $sql = file_get_contents($schemaPath);

        // Strip UTF-8 BOM if present
        if (str_starts_with($sql, "\xEF\xBB\xBF")) {
            $sql = substr($sql, 3);
        }

        // Set charset before any statements
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("SET CHARACTER SET utf8mb4");
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
        $pdo->exec("SET UNIQUE_CHECKS = 0");

        // Strip ALL MySQL dump conditional comment lines (/*!...*/) that cause issues
        $sql = preg_replace('/\/\*!\d+\s+.*?\*\//', '', $sql);

        // Execute in large batches (much faster than line-by-line)
        $statements = array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== '' && !str_starts_with($s, '--'));
        $batch = '';
        $batchSize = 0;
        foreach ($statements as $statement) {
            $batch .= $statement . ";\n";
            $batchSize++;
            if ($batchSize >= 50) {
                try {
                    $pdo->exec($batch);
                } catch (\Throwable $e) {
                    if (!str_contains($e->getMessage(), 'already exists') &&
                        !str_contains($e->getMessage(), 'Duplicate key')) {
                        throw $e;
                    }
                }
                $batch = '';
                $batchSize = 0;
            }
        }
        if (trim($batch) !== '') {
            try {
                $pdo->exec($batch);
            } catch (\Throwable $e) {
                if (!str_contains($e->getMessage(), 'already exists') &&
                    !str_contains($e->getMessage(), 'Duplicate key')) {
                    throw $e;
                }
            }
        }
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
        $pdo->exec("SET UNIQUE_CHECKS = 1");
        $pdo = null;
    }

    // ─── Organization Trial Settings ────────────────────────────────

    /**
     * Get subscription history for an organization.
     */
    public function subscriptionHistory(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $history = $this->historyService->getHistory($org);

        return response()->json(['success' => true, 'data' => $history]);
    }

    /**
     * Get subscription summary stats for an organization.
     */
    public function subscriptionSummary(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $summary = $this->historyService->getSubscriptionSummary($org);
        $planUsage = $this->historyService->getPlanUsageSummary($org);
        $currentSubscription = $org->subscription;

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => $summary,
                'plan_usage' => $planUsage,
                'current_subscription' => $currentSubscription ? [
                    'plan' => $currentSubscription->plan,
                    'status' => $currentSubscription->status,
                    'billing_period' => $currentSubscription->billing_period,
                    'starts_at' => $currentSubscription->starts_at,
                    'ends_at' => $currentSubscription->ends_at,
                    'amount' => $currentSubscription->amount,
                ] : null,
            ],
        ]);
    }

    /**
     * Get the resolved trial configuration for an organization.
     * Returns is_custom, source, and configuration values.
     */
    public function getTrialSettings(int $id): JsonResponse
    {
        $org = Organization::with(['subscription.plan', 'trialSetting'])->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $this->trialResolver->resolve($org),
        ]);
    }

    /**
     * Create or update an organization's trial override.
     */
    public function updateTrialSettings(Request $request, int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $validated = $request->validate([
            'trial_duration'      => 'required|integer|min:1',
            'trial_duration_unit' => 'required|string|in:minutes,hours,days',
            'max_users'           => 'required|integer|min:1',
            'max_projects'        => 'required|integer|min:1',
            'max_storage_gb'      => 'required|integer|min:1',
        ]);

        $setting = $this->trialResolver->setOverride($org, $validated);

        // Update subscription ends_at based on new trial duration
        $subscription = \App\Models\Master\OrganizationSubscription::where('organization_id', $org->id)->latest()->first();
        if ($subscription && $subscription->plan && $subscription->plan->slug === 'trial') {
            $trialMinutes = $this->trialResolver->resolveTrialMinutes($validated['trial_duration'], $validated['trial_duration_unit']);
            $startsAt = $subscription->starts_at ?? now();
            $subscription->ends_at = $startsAt->copy()->addMinutes($trialMinutes);
            $subscription->save();
        }

        $this->logActivity('Updated trial settings for organization', $org->name);

        return response()->json([
            'success' => true,
            'message' => 'Trial settings updated for this organization.',
            'data'    => $this->trialResolver->resolve($org),
        ]);
    }

    /**
     * Reset an organization's trial override to the global default.
     */
    public function resetTrialSettings(int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $this->trialResolver->resetToDefault($org);

        // Restore subscription ends_at to plan default
        $subscription = \App\Models\Master\OrganizationSubscription::where('organization_id', $org->id)->latest()->first();
        if ($subscription && $subscription->plan && $subscription->plan->slug === 'trial') {
            $trialMinutes = $subscription->plan->getTrialMinutes();
            $startsAt = $subscription->starts_at ?? now();
            $subscription->ends_at = $startsAt->copy()->addMinutes($trialMinutes);
            $subscription->save();
        }

        $this->logActivity('Reset trial settings to default for organization', $org->name);

        return response()->json([
            'success' => true,
            'message' => 'Trial configuration reset to default.',
            'data'    => $this->trialResolver->resolve($org),
        ]);
    }

    /**
     * Get the global/default trial configuration from the trial plan.
     */
    public function getGlobalTrialDefaults(): JsonResponse
    {
        $plan = OrganizationPlan::where('slug', 'trial')->first();

        return response()->json([
            'success' => true,
            'data'    => $this->trialResolver->getGlobalDefault($plan),
        ]);
    }

    // ─── Notifications ──────────────────────────────────────────

    /**
     * Get the super admin user from the TechXaro tenant DB.
     */
    private function getSuperAdminUser(): ?object
    {
        try {
            $org = Organization::where('slug', 'techxaro')->first();
            if (!$org) return null;
            $dbName = str_replace('`', '``', $org->database_name);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("SELECT id, name, email FROM `{$dbName}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
            $stmt->execute();
            return $stmt->fetch(\PDO::FETCH_OBJ) ?: null;
        } catch (\Throwable $e) {
            \Log::error("Failed to get super admin user: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get TechXaro tenant database name.
     */
    private function getTechxaroDbName(): ?string
    {
        try {
            $org = Organization::where('slug', 'techxaro')->first();
            return $org?->database_name;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Get paginated notifications for the super admin.
     * Only shows organization-related notifications (subscription, org status, etc.)
     */
    public function notifications(Request $request): JsonResponse
    {
        $admin = $this->getSuperAdminUser();
        if (!$admin) {
            return response()->json(['success' => false, 'message' => 'Super admin not found'], 404);
        }

        $dbName = $this->getTechxaroDbName();
        if (!$dbName) {
            return response()->json(['success' => false, 'message' => 'TechXaro database not found'], 404);
        }

        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();

            // Only organization-related notification types for super admin
            $orgTypes = [
                'subscription_renewed',
                'organization_created',
                'organization_updated',
                'organization_suspended',
                'organization_activated',
                'organization_deleted',
                'organization_restored',
                'plan_changed',
                'trial_activated',
                'trial_expired',
            ];
            $placeholders = implode(',', array_fill(0, count($orgTypes), '?'));

            $where = "WHERE `user_id` = ? AND `type` IN ({$placeholders})";
            $params = array_merge([$admin->id], $orgTypes);

            // Exclude self-triggered
            $where .= " AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)";
            $params[] = $admin->id;

            if ($request->filled('search')) {
                $search = $request->input('search');
                $where .= " AND (`title` LIKE ? OR `message` LIKE ?)";
                $params[] = "%{$search}%";
                $params[] = "%{$search}%";
            }

            if ($request->filled('type')) {
                $where .= " AND `type` = ?";
                $params[] = $request->input('type');
            }

            if ($request->filled('filter')) {
                $filter = $request->input('filter');
                if ($filter === 'unread') {
                    $where .= " AND `is_read` = 0";
                } elseif ($filter === 'read') {
                    $where .= " AND `is_read` = 1";
                }
            }

            // Count total
            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$escaped}`.`notifications` {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            // Paginate
            $page = max(1, (int) $request->input('page', 1));
            $perPage = 20;
            $offset = ($page - 1) * $perPage;

            $sql = "SELECT `id`, `user_id`, `sender_user_id`, `type`, `related_module`, `related_id`, `title`, `message`, `link`, `is_read`, `created_at`
                    FROM `{$escaped}`.`notifications` {$where}
                    ORDER BY `created_at` DESC
                    LIMIT {$perPage} OFFSET {$offset}";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $notifications = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return response()->json([
                'success'     => true,
                'data'        => $notifications,
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $perPage,
                'last_page'   => (int) ceil($total / $perPage),
            ]);
        } catch (\Throwable $e) {
            \Log::error("Failed to fetch super admin notifications: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch notifications'], 500);
        }
    }

    /**
     * Get unread notification count for the super admin.
     */
    public function notificationUnreadCount(): JsonResponse
    {
        $admin = $this->getSuperAdminUser();
        if (!$admin) {
            return response()->json(['unread_count' => 0]);
        }

        $dbName = $this->getTechxaroDbName();
        if (!$dbName) {
            return response()->json(['unread_count' => 0]);
        }

        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $orgTypes = ['subscription_renewed','organization_created','organization_updated','organization_suspended','organization_activated','organization_deleted','organization_restored','plan_changed','trial_activated','trial_expired'];
            $placeholders = implode(',', array_fill(0, count($orgTypes), '?'));
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$escaped}`.`notifications` WHERE `user_id` = ? AND `type` IN ({$placeholders}) AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)");
            $stmt->execute(array_merge([$admin->id], $orgTypes, [$admin->id]));
            $count = (int) $stmt->fetchColumn();

            return response()->json(['unread_count' => $count]);
        } catch (\Throwable $e) {
            \Log::error("Failed to get super admin unread count: " . $e->getMessage());
            return response()->json(['unread_count' => 0]);
        }
    }

    /**
     * Get latest unread notifications for desktop notification display.
     */
    public function notificationLatest(Request $request): JsonResponse
    {
        $admin = $this->getSuperAdminUser();
        if (!$admin) {
            return response()->json(['notifications' => []]);
        }

        $dbName = $this->getTechxaroDbName();
        if (!$dbName) {
            return response()->json(['notifications' => []]);
        }

        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();

            $orgTypes = ['subscription_renewed','organization_created','organization_updated','organization_suspended','organization_activated','organization_deleted','organization_restored','plan_changed','trial_activated','trial_expired'];
            $placeholders = implode(',', array_fill(0, count($orgTypes), '?'));

            $where = "WHERE `user_id` = ? AND `type` IN ({$placeholders}) AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)";
            $params = array_merge([$admin->id], $orgTypes, [$admin->id]);

            if ($request->filled('after_id')) {
                $where .= " AND `id` > ?";
                $params[] = (int) $request->input('after_id');
            }

            $stmt = $pdo->prepare("SELECT `id`, `type`, `title`, `message`, `link`, `related_module`, `related_id`, `sender_user_id`, `created_at` FROM `{$escaped}`.`notifications` {$where} ORDER BY `created_at` DESC LIMIT 5");
            $stmt->execute($params);
            $notifications = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Attach sender name
            foreach ($notifications as &$n) {
                if ($n['sender_user_id']) {
                    $senderStmt = $pdo->prepare("SELECT `id`, `name` FROM `{$escaped}`.`users` WHERE `id` = ?");
                    $senderStmt->execute([$n['sender_user_id']]);
                    $n['sender'] = $senderStmt->fetch(\PDO::FETCH_ASSOC) ?: null;
                } else {
                    $n['sender'] = null;
                }
                unset($n['sender_user_id']);
            }

            return response()->json(['notifications' => $notifications]);
        } catch (\Throwable $e) {
            \Log::error("Failed to get super admin latest notifications: " . $e->getMessage());
            return response()->json(['notifications' => []]);
        }
    }

    /**
     * Mark a single notification as read.
     */
    public function notificationMarkAsRead(Request $request, int $id): JsonResponse
    {
        $admin = $this->getSuperAdminUser();
        if (!$admin) {
            return response()->json(['success' => false, 'message' => 'Super admin not found'], 404);
        }

        $dbName = $this->getTechxaroDbName();
        if (!$dbName) {
            return response()->json(['success' => false, 'message' => 'Database not found'], 404);
        }

        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();

            // Verify ownership
            $stmt = $pdo->prepare("SELECT `id` FROM `{$escaped}`.`notifications` WHERE `id` = ? AND `user_id` = ?");
            $stmt->execute([$id, $admin->id]);
            if (!$stmt->fetch()) {
                return response()->json(['success' => false, 'message' => 'Notification not found'], 404);
            }

            $stmt = $pdo->prepare("UPDATE `{$escaped}`.`notifications` SET `is_read` = 1, `updated_at` = NOW() WHERE `id` = ?");
            $stmt->execute([$id]);

            return response()->json(['success' => true, 'message' => 'Notification marked as read']);
        } catch (\Throwable $e) {
            \Log::error("Failed to mark super admin notification as read: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to mark as read'], 500);
        }
    }

    /**
     * Mark all notifications as read for the super admin.
     */
    public function notificationMarkAllAsRead(): JsonResponse
    {
        $admin = $this->getSuperAdminUser();
        if (!$admin) {
            return response()->json(['success' => false, 'message' => 'Super admin not found'], 404);
        }

        $dbName = $this->getTechxaroDbName();
        if (!$dbName) {
            return response()->json(['success' => false, 'message' => 'Database not found'], 404);
        }

        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("UPDATE `{$escaped}`.`notifications` SET `is_read` = 1, `updated_at` = NOW() WHERE `user_id` = ? AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)");
            $stmt->execute([$admin->id, $admin->id]);

            return response()->json(['success' => true, 'message' => 'All notifications marked as read']);
        } catch (\Throwable $e) {
            \Log::error("Failed to mark all super admin notifications as read: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to mark all as read'], 500);
        }
    }
}
