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
        protected DatabaseProvisionService $dbService,
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

    public function changeOrgAdminPassword(Request $request, int $id): JsonResponse
    {
        $org = Organization::find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found'], 404);
        }

        $validated = $request->validate([
            'new_password' => [
                'required', 'string', 'min:8',
                'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[@$!%*?&#]/',
            ],
            'force_logout'    => 'sometimes|boolean',
            'disable_recovery' => 'sometimes|boolean',
        ]);

        $forceLogout = $request->boolean('force_logout', true);
        $disableRecovery = $request->boolean('disable_recovery', true);

        try {
            $dbName = $org->database_name;
            $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
            $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
            $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
            $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
            $pdo = new \PDO($dsn, $username, $dbPassword, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_TIMEOUT => 5,
            ]);

            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

            // Find admin user
            $stmt = $pdo->prepare("SELECT id, name, email FROM `users` WHERE `role` = 'admin' LIMIT 1");
            $stmt->execute();
            $adminUser = $stmt->fetch(\PDO::FETCH_OBJ);

            if (!$adminUser) {
                return response()->json(['success' => false, 'message' => 'Admin user not found in this organization'], 404);
            }

            // Update password
            $newHash = Hash::make($validated['new_password']);
            $sets = ['`password` = ?', '`updated_at` = NOW()'];
            $bindings = [$newHash];

            if ($disableRecovery) {
                $sets[] = '`password_reset_locked` = ?';
                $bindings[] = 1;
            }

            $sets[] = '`credentials_managed_by_admin` = ?';
            $bindings[] = 1;

            $sets[] = '`password_changed_by` = ?';
            $bindings[] = 'super_admin';

            $sets[] = '`password_changed_at` = ?';
            $bindings[] = now()->toDateTimeString();

            $stmt = $pdo->prepare("UPDATE `users` SET " . implode(', ', $sets) . " WHERE `id` = ?");
            $bindings[] = $adminUser->id;
            $stmt->execute($bindings);

            // Force logout: revoke all tokens if using Sanctum tokens table in tenant DB
            if ($forceLogout) {
                try {
                    $pdo->exec("DELETE FROM `personal_access_tokens` WHERE `tokenable_type` = 'App\\\\Models\\\\User' AND `tokenable_id` = {$adminUser['id']}");
                } catch (\Throwable $e) {
                    // Token table may not exist or be named differently — ignore
                }
                try {
                    $stmt = $pdo->prepare("UPDATE `users` SET `remember_token` = NULL WHERE `id` = ?");
                    $stmt->execute([$adminUser['id']]);
                } catch (\Throwable $e) {
                    // ignore
                }
            }

            // Activity log
            ActivityLog::create([
                'user'   => $request->header('X-Admin-Name', 'Super Admin'),
                'action' => 'Changed admin password for organization',
                'target' => $org->name,
                'ip'     => $request->ip(),
                'status' => 'success',
            ]);

            return response()->json([
                'success' => true,
                'message' => "Password updated successfully for {$adminUser->name}.",
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to change admin password: ' . $e->getMessage(),
            ], 500);
        }
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
            'email'        => 'required|email',
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
        $domain = \App\Helpers\UrlHelper::getOrganizationUrl($slug);

        try {
            // Step 1: Drop + Create database (clean slate)
            $this->dbService->dropDatabase($dbName);
            $this->dbService->createDatabase($dbName);

            // Step 2: Import tenant schema (fast — bypasses 134 individual migrations)
            $this->importTenantSchema($dbName);

            // Step 3: Create organization record
            $masterConfig = config('database.connections.mysql_master');
            $trialPlan = OrganizationPlan::where('slug', 'trial')->first();
            $trialMinutes = $trialPlan ? $trialPlan->getTrialMinutes() : 14 * 24 * 60;

            $org = Organization::create([
                'name'            => $validated['name'],
                'slug'            => $slug,
                'admin_name'      => $validated['name'],
                'admin_email'     => $email,
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
            $loginUrl = \App\Helpers\UrlHelper::getLoginUrl();
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
                    'password'     => $plainPassword,
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
                  ->orWhere('slug', 'like', "%{$search}%")
                  ->orWhere('id', '=', $search);
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

        $orgs = $query->orderBy('id', 'desc')->get();

        $orgs->transform(function ($org) {
            $org->users_count = $this->getOrgUserCount($org);
            $org->projects_count = $this->getOrgProjectCount($org);
            $org->trial_config = $this->trialResolver->resolve($org);
            if ($org->subscription) {
                $org->effective_plan = $org->subscription->getEffectivePlanDetails();
            }
            if (!$org->admin_name && !$org->admin_email) {
                try {
                    $escaped = str_replace('`', '``', $org->database_name);
                    $pdo = DB::connection('mysql_master')->getPdo();
                    $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
                    $stmt = $pdo->prepare("SELECT name, email FROM `{$escaped}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
                    $stmt->execute();
                    $admin = $stmt->fetch(\PDO::FETCH_OBJ);
                    if ($admin) {
                        $org->admin_name = $admin->name;
                        $org->admin_email = $admin->email;
                    }
                } catch (\Throwable $e) {
                    // silent fallback
                }
            }
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

        // Attach effective plan details (custom overrides or plan defaults)
        if ($org->subscription) {
            $org->effective_plan = $org->subscription->getEffectivePlanDetails();
        }

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
            'slug'           => 'nullable|string|max:255',
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
            'is_custom'            => 'nullable|boolean',
            'custom_price_monthly' => 'nullable|numeric|min:0',
            'custom_price_yearly'  => 'nullable|numeric|min:0',
            'custom_max_users'     => 'nullable|integer|min:1',
            'custom_max_projects'  => 'nullable|integer|min:1',
            'custom_max_storage_gb'=> 'nullable|integer|min:1',
            'password_type'        => 'nullable|string|in:auto,manual',
            'password'             => 'nullable|string|min:6|max:255',
        ]);

        // Use custom slug or auto-generate from name
        $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);
        $originalSlug = $slug;
        $counter = 1;
        while (Organization::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $originalSlug . '-' . $counter;
            $counter++;
        }

        $dbName = config('tenancy.database_prefix', 'pms_tenant_') . $slug;
        $domain = \App\Helpers\UrlHelper::getOrganizationUrl($slug);

        try {
            // Step 1: Drop + Create database (clean slate)
            $this->dbService->dropDatabase($dbName);
            $this->dbService->createDatabase($dbName);

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
                'admin_name'      => $validated['admin_name'],
                'admin_email'     => $validated['admin_email'],
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
            $passwordType = $validated['password_type'] ?? 'auto';
            if ($passwordType === 'manual' && !empty($validated['password'])) {
                $plainPassword = $validated['password'];
            } else {
                $plainPassword = Str::random(10) . '@' . Str::random(2);
            }
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

            // Build custom overrides if provided
            $customOverrides = [];
            if (!empty($validated['is_custom'])) {
                $customOverrides = [
                    'custom_price_monthly'  => $validated['custom_price_monthly'] ?? $plan->price_monthly,
                    'custom_price_yearly'   => $validated['custom_price_yearly'] ?? $plan->price_yearly,
                    'custom_max_users'      => $validated['custom_max_users'] ?? $plan->max_users,
                    'custom_max_projects'   => $validated['custom_max_projects'] ?? $plan->max_projects,
                    'custom_max_storage_gb' => $validated['custom_max_storage_gb'] ?? $plan->max_storage_gb,
                ];
            }

            $isCustom = !empty($customOverrides);
            $amount = $isCustom
                ? ($billingPeriod === 'yearly' ? ($customOverrides['custom_price_yearly'] ?? 0) : ($customOverrides['custom_price_monthly'] ?? 0))
                : ($isTrial ? 0 : ($billingPeriod === 'monthly' ? $plan->price_monthly : $plan->price_yearly));

            OrganizationSubscription::create([
                'organization_id'       => $org->id,
                'plan_id'               => $plan->id,
                'billing_period'        => $billingPeriod,
                'status'                => $isTrial ? 'trial' : 'active',
                'amount'                => $amount,
                'currency'              => 'USD',
                'is_custom'             => $isCustom,
                'custom_price_monthly'  => $customOverrides['custom_price_monthly'] ?? null,
                'custom_price_yearly'   => $customOverrides['custom_price_yearly'] ?? null,
                'custom_max_users'      => $customOverrides['custom_max_users'] ?? null,
                'custom_max_projects'   => $customOverrides['custom_max_projects'] ?? null,
                'custom_max_storage_gb' => $customOverrides['custom_max_storage_gb'] ?? null,
                'starts_at'             => now(),
                'ends_at'               => $isTrial ? now()->addMinutes($trialMinutes) : ($billingPeriod === 'yearly' ? now()->addYear() : now()->addMonth()),
                'trial_ends_at'         => $isTrial ? now()->addMinutes($trialMinutes) : null,
            ]);

            // Update org status to trial if trial plan selected
            if ($isTrial) {
                $org->update(['status' => 'trial', 'trial_ends_at' => now()->addMinutes($trialMinutes)]);
            }

            // Record subscription history
            $subscription = $org->subscription;
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
            $loginUrl = \App\Helpers\UrlHelper::getLoginUrl();
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
            'type'            => 'sometimes|string|in:standard',
            'plan_id'         => 'sometimes|integer|exists:mysql_master.organization_plans,id',
            'billing_period'  => 'sometimes|string|in:monthly,yearly',
            'admin_name'      => 'sometimes|string|max:255',
            'admin_phone'     => 'nullable|string|max:50',
            'country_code'    => 'nullable|string|max:5',
            'is_custom'            => 'nullable|boolean',
            'custom_price_monthly' => 'nullable|numeric|min:0',
            'custom_price_yearly'  => 'nullable|numeric|min:0',
            'custom_max_users'     => 'nullable|integer|min:1',
            'custom_max_projects'  => 'nullable|integer|min:1',
            'custom_max_storage_gb'=> 'nullable|integer|min:1',
            'customize_trial'      => 'nullable|boolean',
            'trial_duration'       => 'nullable|integer|min:1',
            'trial_duration_unit'  => 'nullable|string|in:minutes,hours,days',
            'trial_max_users'      => 'nullable|integer|min:1',
            'trial_max_projects'   => 'nullable|integer|min:1',
            'trial_max_storage_gb' => 'nullable|integer|min:1',
            'password_type'        => 'nullable|string|in:auto,manual',
            'password'             => 'nullable|string|min:6|max:255',
        ]);

        $planId = $validated['plan_id'] ?? null;
        $billingPeriod = $validated['billing_period'] ?? null;
        $adminName = $validated['admin_name'] ?? null;
        $adminPhone = $validated['admin_phone'] ?? null;
        $passwordType = $validated['password_type'] ?? null;
        $newPassword = $validated['password'] ?? null;
        unset($validated['plan_id'], $validated['billing_period'], $validated['admin_name'], $validated['admin_phone'], $validated['password_type'], $validated['password']);

        if (!empty($validated)) {
            $org->update($validated);
        }

        if ($adminName || $adminPhone || ($passwordType === 'manual' && $newPassword)) {
            try {
                $dbName = $org->database_name;
                $sets = [];
                $bindings = [];
                if ($adminName) { $sets[] = '`name` = ?'; $bindings[] = $adminName; }
                if ($adminPhone !== null) { $sets[] = '`phone_number` = ?'; $bindings[] = $adminPhone; }
                if ($passwordType === 'manual' && $newPassword) {
                    $sets[] = '`password` = ?'; $bindings[] = \Hash::make($newPassword);
                    $sets[] = '`must_change_password` = ?'; $bindings[] = 1;
                }
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

                // Build custom overrides if provided
                $customOverrides = [];
                if (!empty($validated['is_custom'])) {
                    $customOverrides = [
                        'custom_price_monthly'  => $validated['custom_price_monthly'] ?? $plan->price_monthly,
                        'custom_price_yearly'   => $validated['custom_price_yearly'] ?? $plan->price_yearly,
                        'custom_max_users'      => $validated['custom_max_users'] ?? $plan->max_users,
                        'custom_max_projects'   => $validated['custom_max_projects'] ?? $plan->max_projects,
                        'custom_max_storage_gb' => $validated['custom_max_storage_gb'] ?? $plan->max_storage_gb,
                    ];
                }

                $isCustom = !empty($customOverrides);
                $bp = $billingPeriod ?? 'monthly';
                $amount = $isCustom
                    ? ($bp === 'yearly' ? ($customOverrides['custom_price_yearly'] ?? 0) : ($customOverrides['custom_price_monthly'] ?? 0))
                    : $plan->getPrice($bp);

                $isTrial = $plan->slug === 'trial';
                if ($isTrial && !empty($validated['customize_trial'])) {
                    $trialMinutes = $this->trialResolver->resolveTrialMinutes(
                        $validated['trial_duration'] ?? $plan->trial_duration,
                        $validated['trial_duration_unit'] ?? $plan->trial_duration_unit
                    );
                } else {
                    $trialMinutes = $isTrial ? $plan->getTrialMinutes() : 0;
                }

                $newSub = \App\Models\Master\OrganizationSubscription::create([
                    'organization_id'       => $org->id,
                    'plan_id'               => $plan->id,
                    'billing_period'        => $bp,
                    'status'                => $isTrial ? 'trial' : 'active',
                    'amount'                => $amount,
                    'currency'              => 'USD',
                    'is_custom'             => $isCustom,
                    'custom_price_monthly'  => $customOverrides['custom_price_monthly'] ?? null,
                    'custom_price_yearly'   => $customOverrides['custom_price_yearly'] ?? null,
                    'custom_max_users'      => $customOverrides['custom_max_users'] ?? null,
                    'custom_max_projects'   => $customOverrides['custom_max_projects'] ?? null,
                    'custom_max_storage_gb' => $customOverrides['custom_max_storage_gb'] ?? null,
                    'starts_at'             => now(),
                    'ends_at'               => $isTrial ? now()->addMinutes($trialMinutes) : ($bp === 'yearly' ? now()->addYear() : now()->addMonth()),
                    'trial_ends_at'         => $isTrial ? now()->addMinutes($trialMinutes) : null,
                ]);

                if ($isTrial) {
                    $org->update(['status' => 'trial', 'trial_ends_at' => now()->addMinutes($trialMinutes)]);
                    if (!empty($validated['customize_trial'])) {
                        $this->trialResolver->setOverride($org, [
                            'trial_duration'      => $validated['trial_duration'] ?? $plan->trial_duration,
                            'trial_duration_unit' => $validated['trial_duration_unit'] ?? $plan->trial_duration_unit,
                            'max_users'           => $validated['trial_max_users'] ?? $plan->max_users,
                            'max_projects'        => $validated['trial_max_projects'] ?? $plan->max_projects,
                            'max_storage_gb'      => $validated['trial_max_storage_gb'] ?? $plan->max_storage_gb,
                        ]);
                    }
                }

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

                // Notify org if storage limit changed
                $oldStorageGb = $currentSub?->getEffectiveMaxStorageGb();
                $newStorageGb = $newSub->getEffectiveMaxStorageGb();
                if ($oldStorageGb !== null && $oldStorageGb !== $newStorageGb) {
                    $action = $newStorageGb > $oldStorageGb ? 'increased' : 'decreased';
                    $adminUser = $request->user();
                    \App\Services\StorageNotificationService::notifyLimitChanged(
                        $org,
                        $action,
                        $oldStorageGb,
                        $newStorageGb,
                        $adminUser?->name
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
        $domains = OrganizationDomain::with(['organization.subscription.plan'])->get();

        $domains->each(function ($domain) {
            if ($domain->organization) {
                $domain->organization->users_count = $this->getOrgUserCount($domain->organization);
            }
        });

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
            // Fallback: run Laravel migrations instead of importing SQL
            app(\App\Services\Saas\DatabaseProvisionService::class)->runMigrations($dbName);
            return;
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
            $subscription->trial_ends_at = $subscription->ends_at;
            $subscription->save();
            $org->update(['trial_ends_at' => $subscription->ends_at]);
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
     * Get the authenticated super admin user from master DB.
     */
    private function getSuperAdminUser(): ?object
    {
        try {
            $requestUser = request()->user();
            if ($requestUser && isset($requestUser->id)) {
                return (object) [
                    'id'    => $requestUser->id,
                    'name'  => $requestUser->name ?? '',
                    'email' => $requestUser->email ?? '',
                ];
            }
            return null;
        } catch (\Throwable $e) {
            \Log::error("Failed to get super admin user: " . $e->getMessage());
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

        try {
            $pdo = DB::connection('mysql_master')->getPdo();

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

            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `notifications` {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $page = max(1, (int) $request->input('page', 1));
            $perPage = 20;
            $offset = ($page - 1) * $perPage;

            $sql = "SELECT `id`, `user_id`, `sender_user_id`, `type`, `related_module`, `related_id`, `title`, `message`, `link`, `is_read`, `created_at`
                    FROM `notifications` {$where}
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

        try {
            $pdo = DB::connection('mysql_master')->getPdo();
            $orgTypes = ['subscription_renewed','organization_created','organization_updated','organization_suspended','organization_activated','organization_deleted','organization_restored','plan_changed','trial_activated','trial_expired'];
            $placeholders = implode(',', array_fill(0, count($orgTypes), '?'));
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `notifications` WHERE `user_id` = ? AND `type` IN ({$placeholders}) AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)");
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

        try {
            $pdo = DB::connection('mysql_master')->getPdo();

            $orgTypes = ['subscription_renewed','organization_created','organization_updated','organization_suspended','organization_activated','organization_deleted','organization_restored','plan_changed','trial_activated','trial_expired'];
            $placeholders = implode(',', array_fill(0, count($orgTypes), '?'));

            $where = "WHERE `user_id` = ? AND `type` IN ({$placeholders}) AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)";
            $params = array_merge([$admin->id], $orgTypes, [$admin->id]);

            if ($request->filled('after_id')) {
                $where .= " AND `id` > ?";
                $params[] = (int) $request->input('after_id');
            }

            $stmt = $pdo->prepare("SELECT `id`, `type`, `title`, `message`, `link`, `related_module`, `related_id`, `sender_user_id`, `created_at` FROM `notifications` {$where} ORDER BY `created_at` DESC LIMIT 5");
            $stmt->execute($params);
            $notifications = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            foreach ($notifications as &$n) {
                if ($n['sender_user_id']) {
                    $senderStmt = $pdo->prepare("SELECT `id`, `name` FROM `super_admin_users` WHERE `id` = ?");
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

        try {
            $pdo = DB::connection('mysql_master')->getPdo();

            $stmt = $pdo->prepare("SELECT `id` FROM `notifications` WHERE `id` = ? AND `user_id` = ?");
            $stmt->execute([$id, $admin->id]);
            if (!$stmt->fetch()) {
                return response()->json(['success' => false, 'message' => 'Notification not found'], 404);
            }

            $stmt = $pdo->prepare("UPDATE `notifications` SET `is_read` = 1, `updated_at` = NOW() WHERE `id` = ?");
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

        try {
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("UPDATE `notifications` SET `is_read` = 1, `updated_at` = NOW() WHERE `user_id` = ? AND `is_read` = 0 AND (`sender_user_id` IS NULL OR `sender_user_id` != ?)");
            $stmt->execute([$admin->id, $admin->id]);

            return response()->json(['success' => true, 'message' => 'All notifications marked as read']);
        } catch (\Throwable $e) {
            \Log::error("Failed to mark all super admin notifications as read: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to mark all as read'], 500);
        }
    }

    // ─── TechXaro's Own Subscription (for super admin subscription page) ──

    public function mySubscription(Request $request): JsonResponse
    {
        try {
            $techxaro = Organization::on('mysql_master')->where('slug', 'techxaro')->first();
            if (!$techxaro) {
                return response()->json(['success' => false, 'message' => 'TechXaro organization not found'], 404);
            }

            $subscription = OrganizationSubscription::on('mysql_master')
                ->where('organization_id', $techxaro->id)
                ->with('plan')
                ->latest()
                ->first();

            if (!$subscription || !$subscription->plan) {
                return response()->json(['success' => true, 'data' => null]);
            }

            $effective = $subscription->getEffectivePlanDetails();

            $planObj = (clone $subscription->plan)->toArray();
            $planObj['max_users'] = $effective['max_users'];
            $planObj['max_projects'] = $effective['max_projects'];
            $planObj['max_storage_gb'] = $effective['max_storage_gb'];
            $planObj['price_monthly'] = $effective['price_monthly'];
            $planObj['price_yearly'] = $effective['price_yearly'];

            $modules = $this->moduleService->getEnabled($techxaro);
            $allModules = $subscription->plan->modules->sortBy('sort_order')->values();
            $enabledSlugs = $modules->pluck('slug')->toArray();
            $enabledModules = $allModules->filter(fn($m) => in_array($m->slug, $enabledSlugs))->values();
            $disabledModules = $allModules->filter(fn($m) => !in_array($m->slug, $enabledSlugs))->values();

            $usage = [
                'users'    => $techxaro->users()->count(),
                'projects' => $techxaro->projects()->count(),
            ];

            $history = $this->historyService->getHistory($techxaro, 10);

            return response()->json([
                'success' => true,
                'subscription' => [
                    'id'             => $subscription->id,
                    'status'         => $subscription->status,
                    'billing_period' => $subscription->billing_period,
                    'amount'         => $subscription->amount,
                    'currency'       => $subscription->currency,
                    'starts_at'      => $subscription->starts_at,
                    'ends_at'        => $subscription->ends_at,
                    'is_custom'      => $subscription->is_custom,
                ],
                'plan'         => $planObj,
                'modules'      => [
                    'enabled'      => $enabledModules->values(),
                    'disabled'     => $disabledModules->values(),
                    'total_enabled' => $enabledModules->count(),
                ],
                'organization' => [
                    'id'   => $techxaro->id,
                    'name' => $techxaro->name,
                    'slug' => $techxaro->slug,
                ],
                'usage'        => $usage,
                'history'      => $history,
            ]);
        } catch (\Throwable $e) {
            \Log::error("Failed to load TechXaro subscription: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to load subscription'], 500);
        }
    }

    public function changeMyPlan(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'plan_id'        => 'required|integer|exists:mysql_master.organization_plans,id',
            'billing_period' => 'nullable|string|in:monthly,yearly',
        ]);

        $techxaro = Organization::on('mysql_master')->where('slug', 'techxaro')->first();
        if (!$techxaro) {
            return response()->json(['success' => false, 'message' => 'TechXaro organization not found'], 404);
        }

        $plan = OrganizationPlan::find($validated['plan_id']);
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Plan not found'], 404);
        }

        $currentSub = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $techxaro->id)
            ->latest()
            ->first();

        if ($currentSub && $currentSub->isActive()) {
            $currentSub->update(['status' => 'replaced']);
        }

        $bp = $validated['billing_period'] ?? 'monthly';
        $amount = $plan->getPrice($bp);

        $newSub = OrganizationSubscription::create([
            'organization_id'  => $techxaro->id,
            'plan_id'          => $plan->id,
            'billing_period'   => $bp,
            'status'           => 'active',
            'amount'           => $amount,
            'currency'         => 'USD',
            'is_custom'        => false,
            'starts_at'        => now(),
            'ends_at'          => $bp === 'yearly' ? now()->addYear() : now()->addMonth(),
        ]);

        $this->historyService->record(
            organization: $techxaro,
            eventType: 'plan_changed',
            plan: $plan,
            subscription: $newSub,
            changedBy: $request->header('X-Admin-Name', 'Super Admin'),
            previousPlan: $currentSub?->plan,
            status: 'active',
        );

        return response()->json([
            'success' => true,
            'message' => 'Plan changed successfully',
        ]);
    }

    // ─── Available Plans (for plan selection) ─────────────────────

    public function availablePlans(): JsonResponse
    {
        try {
            $plans = OrganizationPlan::orderBy('price_monthly')->get()->map(fn($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'slug' => $p->slug,
                'description' => $p->description,
                'price_monthly' => $p->price_monthly,
                'price_yearly' => $p->price_yearly,
                'max_users' => $p->max_users,
                'max_projects' => $p->max_projects,
                'max_storage_gb' => $p->max_storage_gb,
                'modules' => json_decode($p->modules ?? '[]', true),
            ]);

            return response()->json(['success' => true, 'plans' => $plans]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Failed to load plans'], 500);
        }
    }

    // ─── Organization Storage Usage ─────────────────────────────

    public function orgStorageUsage(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;

        $storageFiles = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalMb = round($totalBytes / (1024 * 1024), 2);
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);

        $byCategory = $storageFiles->groupBy('category')->map(function ($files, $category) {
            $bytes = $files->sum('file_size_bytes');
            return [
                'category'    => $category,
                'file_count'  => $files->count(),
                'total_bytes' => $bytes,
                'total_mb'    => round($bytes / (1024 * 1024), 2),
                'total_gb'    => round($bytes / (1024 * 1024 * 1024), 4),
            ];
        })->values();

        $recentFiles = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get()
            ->map(function ($file) {
                return [
                    'id'         => $file->id,
                    'file_name'  => $file->file_name,
                    'category'   => $file->category,
                    'mime_type'  => $file->mime_type,
                    'file_size'  => $file->file_size_bytes,
                    'file_size_mb' => round($file->file_size_bytes / (1024 * 1024), 2),
                    'uploaded_by'=> $file->uploaded_by_name,
                    'created_at' => $file->created_at?->toISOString(),
                ];
            });

        return response()->json([
            'success' => true,
            'storage' => [
                'total_bytes'      => $totalBytes,
                'total_mb'         => $totalMb,
                'total_gb'         => $totalGb,
                'max_storage_gb'   => $maxStorageGb,
                'usage_percent'    => $maxStorageGb > 0 ? round(($totalGb / $maxStorageGb) * 100, 1) : 0,
                'remaining_gb'     => max(0, round($maxStorageGb - $totalGb, 4)),
                'by_category'      => $byCategory,
                'recent_files'     => $recentFiles,
                'total_files'      => $storageFiles->count(),
            ],
        ]);
    }

    public function deleteOrgStorageRecord(Request $request, string $orgId, string $recordId): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($orgId);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageFileService::deleteFile($org, (int) $recordId);

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Record not found.'], 404);
        }

        return response()->json(['success' => true, 'message' => 'File deleted from storage and database.']);
    }

    public function deleteOrgStorageBulk(Request $request, string $orgId): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($orgId);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $type = $request->input('type');
        $months = $request->input('months');
        $minSizeGb = $request->input('min_size_gb');

        if ($type === 'old' && $months) {
            $result = \App\Services\StorageFileService::deleteOldFiles($org, (int) $months);
            return response()->json([
                'success' => true,
                'message' => "{$result['deleted_count']} old files deleted from storage.",
                'deleted_count' => $result['deleted_count'],
                'freed_mb' => $result['freed_mb'],
            ]);
        }

        if ($type === 'large' && $minSizeGb) {
            $result = \App\Services\StorageFileService::deleteLargeFiles($org, (float) $minSizeGb);
            return response()->json([
                'success' => true,
                'message' => "{$result['deleted_count']} large files deleted from storage.",
                'deleted_count' => $result['deleted_count'],
                'freed_mb' => $result['freed_mb'],
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid parameters.'], 422);
    }

    public function orgStorageSummary(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;

        $storageFiles = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);
        $usagePercent = $maxStorageGb > 0 ? round(($totalGb / $maxStorageGb) * 100, 1) : 0;

        $old3 = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(3))->count();
        $old3Size = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(3))->sum('file_size_bytes');
        $old6 = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(6))->count();
        $old6Size = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(6))->sum('file_size_bytes');
        $old12 = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(12))->count();
        $old12Size = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('created_at', '<', now()->subMonths(12))->sum('file_size_bytes');
        $large1 = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('file_size_bytes', '>=', 1024*1024*1024)->count();
        $large1Size = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('file_size_bytes', '>=', 1024*1024*1024)->sum('file_size_bytes');
        $large2 = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('file_size_bytes', '>=', 2*1024*1024*1024)->count();
        $large2Size = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')->where('organization_id', $org->id)->where('file_size_bytes', '>=', 2*1024*1024*1024)->sum('file_size_bytes');

        return response()->json([
            'success' => true,
            'summary' => [
                'org_name' => $org->name,
                'plan_name' => $subscription?->plan?->name ?? 'Unknown',
                'total_bytes' => $totalBytes,
                'total_gb' => $totalGb,
                'max_storage_gb' => $maxStorageGb,
                'usage_percent' => $usagePercent,
                'remaining_gb' => max(0, round($maxStorageGb - $totalGb, 4)),
                'total_files' => $storageFiles->count(),
                'old_files' => [
                    '3_months' => ['count' => $old3, 'size_mb' => round($old3Size / (1024*1024), 2)],
                    '6_months' => ['count' => $old6, 'size_mb' => round($old6Size / (1024*1024), 2)],
                    '12_months' => ['count' => $old12, 'size_mb' => round($old12Size / (1024*1024), 2)],
                ],
                'large_files' => [
                    'over_1gb' => ['count' => $large1, 'size_mb' => round($large1Size / (1024*1024), 2)],
                    'over_2gb' => ['count' => $large2, 'size_mb' => round($large2Size / (1024*1024), 2)],
                ],
            ],
        ]);
    }

    // ─── Organization Storage Notifications (Super Admin) ────────

    public function orgStorageNotifications(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $notifications = \App\Services\StorageNotificationService::getActiveNotifications($org->id);
        $pinned = \App\Services\StorageNotificationService::getPinnedNotifications($org->id);

        return response()->json([
            'success' => true,
            'notifications' => $notifications->map(fn($n) => [
                'id'         => $n->id,
                'type'       => $n->type,
                'severity'   => $n->severity,
                'title'      => $n->title,
                'message'    => $n->message,
                'metadata'   => $n->metadata,
                'is_read'    => $n->is_read,
                'email_sent' => $n->email_sent,
                'created_at' => $n->created_at?->toISOString(),
            ]),
            'pinned' => $pinned->map(fn($n) => [
                'id'         => $n->id,
                'type'       => $n->type,
                'severity'   => $n->severity,
                'title'      => $n->title,
                'message'    => $n->message,
                'metadata'   => $n->metadata,
                'created_at' => $n->created_at?->toISOString(),
            ]),
            'unread_count' => $notifications->where('is_read', false)->count(),
        ]);
    }

    public function orgStorageNotificationsDismiss(Request $request, string $id, string $notifId): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageNotificationService::dismiss($org->id, $notifId);
        return response()->json(['success' => $result]);
    }

    public function orgStorageNotificationsDismissAll(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $count = \App\Services\StorageNotificationService::dismissAll($org->id);
        return response()->json(['success' => true, 'dismissed_count' => $count]);
    }

    // ─── Organization Storage Preferences (Super Admin) ──────────

    public function orgStoragePreferences(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'preferences' => [
                'storage_driver'              => $org->storage_driver ?? 'local',
                's3_bucket'                   => $org->storage_s3_bucket ?? '',
                's3_region'                   => $org->storage_s3_region ?? 'us-east-1',
                's3_prefix'                   => $org->storage_s3_prefix ?? "org-{$org->id}",
                's3_access_key'               => $org->storage_s3_access_key ? true : false,
                's3_secret_key'               => $org->storage_s3_secret_key ? true : false,
                'cleanup_months'              => $org->storage_cleanup_months ?? 6,
                'large_file_threshold_mb'     => $org->storage_large_file_threshold_mb ?? 500,
                'auto_cleanup_enabled'        => $org->storage_auto_cleanup ?? true,
                'warning_threshold_percent'   => $org->storage_warn_threshold ?? 80,
                'critical_threshold_percent'  => $org->storage_critical_threshold ?? 95,
                'auto_delete_enabled'         => $org->storage_auto_delete ?? false,
                'custom_max_storage_gb'       => $org->custom_max_storage_gb ?? null,
            ],
        ]);
    }

    public function orgStoragePreferencesUpdate(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'storage_driver'             => 'nullable|string|in:local,s3',
            's3_bucket'                  => 'nullable|string|max:255',
            's3_region'                  => 'nullable|string|max:50',
            's3_prefix'                  => 'nullable|string|max:100',
            's3_access_key'              => 'nullable|string|max:255',
            's3_secret_key'              => 'nullable|string|max:255',
            'cleanup_months'             => 'nullable|integer|min:1|max:60',
            'large_file_threshold_mb'    => 'nullable|integer|min:10|max:50000',
            'auto_cleanup_enabled'       => 'nullable|boolean',
            'warning_threshold_percent'  => 'nullable|integer|min:50|max:95',
            'critical_threshold_percent' => 'nullable|integer|min:60|max:100',
            'auto_delete_enabled'        => 'nullable|boolean',
            'custom_max_storage_gb'      => 'nullable|integer|min:1|max:9999',
        ]);

        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $fields = [
            'storage_driver'                 => $request->input('storage_driver'),
            'storage_s3_bucket'              => $request->input('s3_bucket'),
            'storage_s3_region'              => $request->input('s3_region'),
            'storage_s3_prefix'              => $request->input('s3_prefix'),
            'storage_s3_access_key'          => $request->input('s3_access_key') !== '••••••••' ? $request->input('s3_access_key') : null,
            'storage_s3_secret_key'          => $request->input('s3_secret_key') !== '••••••••' ? $request->input('s3_secret_key') : null,
            'storage_cleanup_months'         => $request->input('cleanup_months'),
            'storage_large_file_threshold_mb'=> $request->input('large_file_threshold_mb'),
            'storage_auto_cleanup'           => $request->boolean('auto_cleanup_enabled'),
            'storage_warn_threshold'         => $request->input('warning_threshold_percent'),
            'storage_critical_threshold'     => $request->input('critical_threshold_percent'),
            'storage_auto_delete'            => $request->boolean('auto_delete_enabled'),
            'custom_max_storage_gb'          => $request->input('custom_max_storage_gb'),
        ];

        $org->update(array_filter($fields, fn($v) => $v !== null));

        return response()->json([
            'success' => true,
            'message' => 'Storage preferences updated.',
            'preferences' => [
                'storage_driver'              => $org->storage_driver,
                's3_bucket'                   => $org->storage_s3_bucket,
                's3_region'                   => $org->storage_s3_region,
                's3_prefix'                   => $org->storage_s3_prefix,
                'cleanup_months'              => $org->storage_cleanup_months,
                'large_file_threshold_mb'     => $org->storage_large_file_threshold_mb,
                'auto_cleanup_enabled'        => $org->storage_auto_cleanup,
                'warning_threshold_percent'   => $org->storage_warn_threshold,
                'critical_threshold_percent'  => $org->storage_critical_threshold,
                'auto_delete_enabled'         => $org->storage_auto_delete,
                'custom_max_storage_gb'       => $org->custom_max_storage_gb,
            ],
        ]);
    }

    // ─── Organization Billing ───────────────────────────────────

    public function orgBillingInvoices(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $query = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan:id,name,slug');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $invoices = $query->orderBy('created_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($invoice) {
                return [
                    'id'                 => $invoice->id,
                    'invoice_number'     => $invoice->invoice_number,
                    'status'             => $invoice->status,
                    'amount'             => $invoice->amount,
                    'tax_amount'         => $invoice->tax_amount,
                    'total_amount'       => $invoice->total_amount,
                    'currency'           => $invoice->currency,
                    'billing_period'     => $invoice->billing_period,
                    'billing_period_start' => $invoice->billing_period_start?->toISOString(),
                    'billing_period_end' => $invoice->billing_period_end?->toISOString(),
                    'payment_method'     => $invoice->payment_method,
                    'description'        => $invoice->description,
                    'notes'              => $invoice->notes,
                    'rejection_reason'   => $invoice->rejection_reason,
                    'renewal_reference'  => $invoice->renewal_reference,
                    'paid_at'            => $invoice->paid_at?->toISOString(),
                    'due_at'             => $invoice->due_at?->toISOString(),
                    'approved_at'        => $invoice->approved_at?->toISOString(),
                    'approved_by'        => $invoice->approved_by,
                    'plan'               => $invoice->plan ? [
                        'id'   => $invoice->plan->id,
                        'name' => $invoice->plan->name,
                        'slug' => $invoice->plan->slug,
                    ] : null,
                    'created_at'         => $invoice->created_at?->toISOString(),
                ];
            });

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $totalPaid = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->whereIn('status', ['paid', 'approved'])
            ->sum('total_amount');

        $totalPending = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('status', 'pending')
            ->sum('total_amount');

        return response()->json([
            'success' => true,
            'invoices' => $invoices,
            'summary' => [
                'total_paid'     => round($totalPaid, 2),
                'total_pending'  => round($totalPending, 2),
                'total_invoices' => $invoices->count(),
                'current_plan'   => $subscription?->plan ? [
                    'name'           => $subscription->plan->name,
                    'price_monthly'  => $subscription->getEffectivePriceMonthly(),
                    'price_yearly'   => $subscription->getEffectivePriceYearly(),
                    'billing_period' => $subscription->billing_period,
                ] : null,
            ],
        ]);
    }

    /**
     * Approve a pending payment invoice.
     */
    public function approvePayment(Request $request, string $invoiceId): JsonResponse
    {
        $invoice = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')->find($invoiceId);
        if (!$invoice) {
            return response()->json(['success' => false, 'message' => 'Invoice not found.'], 404);
        }

        if (!in_array($invoice->status, ['pending'])) {
            return response()->json(['success' => false, 'message' => 'Only pending invoices can be approved. Current status: ' . $invoice->status], 422);
        }

        $approvedBy = $request->header('X-Admin-Name', 'Super Admin');

        try {
            $paymentService = app(\App\Services\Saas\PaymentApprovalService::class);
            $invoice = $paymentService->approve($invoice, $approvedBy, $request->input('notes'));
            return response()->json(['success' => true, 'message' => 'Payment approved successfully.', 'invoice' => $invoice]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Reject a pending payment invoice.
     */
    public function rejectPayment(Request $request, string $invoiceId): JsonResponse
    {
        $invoice = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')->find($invoiceId);
        if (!$invoice) {
            return response()->json(['success' => false, 'message' => 'Invoice not found.'], 404);
        }

        if (!in_array($invoice->status, ['pending', 'approved'])) {
            return response()->json(['success' => false, 'message' => 'Cannot reject invoice with status: ' . $invoice->status], 422);
        }

        $rejectedBy = $request->header('X-Admin-Name', 'Super Admin');

        try {
            $paymentService = app(\App\Services\Saas\PaymentApprovalService::class);
            $invoice = $paymentService->reject($invoice, $rejectedBy, $request->input('reason'));
            return response()->json(['success' => true, 'message' => 'Payment rejected.', 'invoice' => $invoice]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Download invoice as HTML file.
     */
    public function downloadInvoice(string $invoiceId)
    {
        $invoice = \App\Models\Master\OrganizationBillingInvoice::on('mysql_master')
            ->with(['plan', 'organization'])
            ->find($invoiceId);

        if (!$invoice) {
            return response()->json(['success' => false, 'message' => 'Invoice not found.'], 404);
        }

        $org = $invoice->organization ?? \App\Models\Master\Organization::on('mysql_master')->find($invoice->organization_id);
        $plan = $invoice->plan ?? \App\Models\Master\Plan::on('mysql_master')->find($invoice->plan_id);

        $statusColors = [
            'pending'  => '#d97706',
            'approved' => '#059669',
            'paid'     => '#059669',
            'rejected' => '#dc2626',
        ];
        $statusColor = $statusColors[$invoice->status] ?? '#6b7280';

        $html = '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ' . e($invoice->invoice_number) . '</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; background: #f3f4f6; padding: 40px; color: #1f2937; }
  .invoice { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px 40px; color: #fff; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header p { font-size: 12px; opacity: 0.8; margin-top: 2px; }
  .badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); color: #fff; }
  .content { padding: 30px 40px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .col { flex: 1; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; font-weight: 600; margin-bottom: 4px; }
  .value { font-size: 14px; font-weight: 600; color: #1f2937; }
  .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .total-box { background: #f0f0ff; border: 1px solid #e0e0ff; border-radius: 8px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
  .total-label { font-size: 14px; font-weight: 600; color: #4b5563; }
  .total-value { font-size: 24px; font-weight: 800; color: #6366f1; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; font-weight: 600; padding: 8px 0; border-bottom: 2px solid #e5e7eb; }
  td { padding: 10px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  .footer { padding: 20px 40px; background: #f9fafb; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  @media print { body { background: #fff; padding: 0; } .invoice { box-shadow: none; } }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div>
      <h1>TechXaro</h1>
      <p>SaaS Platform - Invoice</p>
    </div>
    <span class="badge" style="background:' . $statusColor . ';">' . e(ucfirst($invoice->status)) . '</span>
  </div>
  <div class="content">
    <div class="row">
      <div class="col">
        <div class="label">Invoice Number</div>
        <div class="value">' . e($invoice->invoice_number) . '</div>
      </div>
      <div class="col" style="text-align:right;">
        <div class="label">Date</div>
        <div class="value">' . $invoice->created_at->format('M d, Y') . '</div>
      </div>
    </div>
    <div class="row">
      <div class="col">
        <div class="label">Bill To</div>
        <div class="value">' . e($org?->name ?? 'Organization') . '</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">' . e(\App\Helpers\UrlHelper::getOrganizationUrl($org?->slug ?? '')) . '</div>
      </div>
      <div class="col" style="text-align:right;">
        <div class="label">Status</div>
        <div class="value" style="color:' . $statusColor . ';">' . e(ucfirst($invoice->status)) . '</div>' .

        ($invoice->approved_at ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">Approved: ' . $invoice->approved_at->format('M d, Y h:i A') . '</div>' : '') .

        ($invoice->paid_at ? '<div style="font-size:11px;color:#6b7280;margin-top:4px;">Paid: ' . $invoice->paid_at->format('M d, Y h:i A') . '</div>' : '') .

      '</div>
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Plan</th>
          <th>Period</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>' . e($invoice->description ?? ucfirst($invoice->billing_period ?? 'monthly') . ' subscription - ' . ($plan->name ?? 'Unknown')) . '</td>
          <td>' . e($plan->name ?? 'N/A') . '</td>
          <td>' . e(ucfirst($invoice->billing_period ?? 'monthly')) . '</td>
          <td style="text-align:right;">' . e($invoice->currency ?? 'USD') . ' ' . number_format($invoice->amount ?? 0, 2) . '</td>
        </tr>
      </tbody>
    </table>

    <div class="total-box">
      <div>
        <div class="total-label">Tax (10%)</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">' . e($invoice->currency ?? 'USD') . ' ' . number_format($invoice->tax_amount ?? 0, 2) . '</div>
      </div>
      <div style="text-align:right;">
        <div class="total-label">Total Amount</div>
        <div class="total-value">' . e($invoice->currency ?? 'USD') . ' ' . number_format($invoice->total_amount ?? 0, 2) . '</div>
      </div>
    </div>' .

    ($invoice->renewal_reference ? '<div style="font-size:12px;color:#6b7280;text-align:right;">Reference: ' . e($invoice->renewal_reference) . '</div>' : '') .

  '</div>
  <div class="footer">
    <p>TechXaro SaaS Platform &bull; This is a system-generated invoice.</p>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},500);}</script>
</body>
</html>';

        $filename = 'invoice-' . $invoice->invoice_number . '.html';

        return response($html, 200)
            ->header('Content-Type', 'text/html')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }

    /**
     * Get global billing summary across all organizations.
     */
    public function billingSummary(): JsonResponse
    {
        try {
            $paymentService = app(\App\Services\Saas\PaymentApprovalService::class);
            $summary = $paymentService->getBillingSummary();
            return response()->json(['success' => true, 'summary' => $summary]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Failed to load billing summary'], 500);
        }
    }

    // ─── Organization Support Tickets ───────────────────────────

    public function orgSupportTickets(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $status = $request->query('status');
        $query = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('user:id,name,email');

        if ($status) {
            $query->where('status', $status);
        }

        $tickets = $query->orderBy('created_at', 'desc')->get()->map(function ($ticket) {
            $lastMessage = $ticket->messages()->orderBy('created_at', 'desc')->first();
            return [
                'id'              => $ticket->id,
                'ticket_number'   => $ticket->ticket_number,
                'subject'         => $ticket->subject,
                'message'         => $ticket->message,
                'status'          => $ticket->status,
                'priority'        => $ticket->priority,
                'category'        => $ticket->category,
                'assigned_to'     => $ticket->assigned_to_name,
                'user'            => $ticket->user ? [
                    'id'    => $ticket->user->id,
                    'name'  => $ticket->user->name,
                    'email' => $ticket->user->email,
                ] : null,
                'last_message'    => $lastMessage ? [
                    'message'     => \Illuminate\Support\Str::limit($lastMessage->message, 100),
                    'sender_type' => $lastMessage->sender_type,
                    'created_at'  => $lastMessage->created_at?->toISOString(),
                ] : null,
                'created_at'      => $ticket->created_at?->toISOString(),
            ];
        });

        $counts = [
            'open'    => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'open')->count(),
            'pending' => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'pending')->count(),
            'resolved'=> \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'resolved')->count(),
            'closed'  => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'closed')->count(),
        ];

        return response()->json(['success' => true, 'tickets' => $tickets, 'counts' => $counts]);
    }

    public function orgSupportTicketDetail(Request $request, string $id, string $ticketId): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('user:id,name,email')
            ->with('messages.user:id,name,email')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        \App\Models\Master\OrganizationSupportMessage::on('mysql_master')
            ->where('ticket_id', $ticket->id)
            ->where('sender_type', 'organization')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        $messages = $ticket->messages->map(function ($msg) {
            return [
                'id'          => $msg->id,
                'message'     => $msg->message,
                'sender_type' => $msg->sender_type,
                'is_read'     => $msg->is_read,
                'user'        => $msg->user ? [
                    'id'    => $msg->user->id,
                    'name'  => $msg->user->name,
                    'email' => $msg->user->email,
                ] : null,
                'created_at'  => $msg->created_at?->toISOString(),
            ];
        });

        return response()->json([
            'success'  => true,
            'ticket'   => [
                'id'            => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject'       => $ticket->subject,
                'message'       => $ticket->message,
                'status'        => $ticket->status,
                'priority'      => $ticket->priority,
                'category'      => $ticket->category,
                'assigned_to'   => $ticket->assigned_to_name,
                'user'          => $ticket->user ? [
                    'id'    => $ticket->user->id,
                    'name'  => $ticket->user->name,
                    'email' => $ticket->user->email,
                ] : null,
                'created_at'    => $ticket->created_at?->toISOString(),
            ],
            'messages' => $messages,
        ]);
    }

    public function orgSupportReply(Request $request, string $id, string $ticketId): JsonResponse
    {
        $request->validate(['message' => 'required|string']);

        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        if ($ticket->status === 'closed') {
            return response()->json(['success' => false, 'message' => 'Cannot reply to a closed ticket.'], 400);
        }

        $msg = \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id'    => $ticket->id,
            'user_id'      => null,
            'message'      => $request->message,
            'sender_type'  => 'support',
        ]);

        if ($ticket->status === 'open') {
            $ticket->update(['status' => 'pending']);
        }

        return response()->json(['success' => true, 'reply' => $msg]);
    }

    public function orgSupportClose(Request $request, string $id, string $ticketId): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        $ticket->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Ticket closed.']);
    }
}
