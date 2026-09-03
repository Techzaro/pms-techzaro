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
use Illuminate\Validation\Rule;

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

            $sets[] = '`password_changed_by` = NULL';

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

    /**
     * Check if an email is available globally across all tenant databases.
     * Used by the Create Organization form to validate before proceeding.
     */
    public function checkEmailAvailability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $normalizedEmail = strtolower(trim($validated['email']));

        // Validate email domain has valid MX records (prevent fake/dummy emails)
        $domain = strtolower(trim(substr(strrchr($normalizedEmail, '@'), 1)));
        if ($domain && !self::isValidEmailDomain($domain)) {
            return response()->json([
                'available' => false,
                'message' => "The email domain '{$domain}' is not valid or does not exist.",
            ]);
        }

        $existingOrgs = Organization::where('status', '!=', 'deleted')->get();

        foreach ($existingOrgs as $org) {
            try {
                $dbName = $org->database_name;
                if (!$dbName) continue;
                $result = DB::connection('mysql_master')->select(
                    "SELECT id FROM `{$dbName}`.`users` WHERE LOWER(email) = ? OR LOWER(personal_email) = ? OR LOWER(professional_email) = ? LIMIT 1",
                    [$normalizedEmail, $normalizedEmail, $normalizedEmail]
                );
                if (!empty($result)) {
                    return response()->json([
                        'available' => false,
                        'message' => 'This email is already registered in organization "' . $org->name . '".',
                    ]);
                }
                try {
                    $identityResult = DB::connection('mysql_master')->select(
                        "SELECT id FROM `{$dbName}`.`email_identities` WHERE normalized_email = ? LIMIT 1",
                        [$normalizedEmail]
                    );
                    if (!empty($identityResult)) {
                        return response()->json([
                            'available' => false,
                            'message' => 'This email is already registered in organization "' . $org->name . '".',
                        ]);
                    }
                } catch (\Throwable $e) {
                    // email_identities table may not exist in older tenants
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return response()->json(['available' => true]);
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
            'name'         => 'required|string|max:255',
            'email'        => 'required|email',
            'phone'        => 'nullable|string|max:50',
        ]);

        // Check if email already exists in ANY tenant DB (email, personal_email, or professional_email)
        $email = $validated['email'];
        $normalizedEmail = strtolower(trim($email));
        $existingOrgs = Organization::where('status', '!=', 'deleted')->get();
        foreach ($existingOrgs as $org) {
            try {
                $dbName = $org->database_name;
                if (!$dbName) continue;
                // Check users table directly (cross-database query via mysql_master)
                $result = DB::connection('mysql_master')->select(
                    "SELECT id FROM `{$dbName}`.`users` WHERE LOWER(email) = ? OR LOWER(personal_email) = ? OR LOWER(professional_email) = ? LIMIT 1",
                    [$normalizedEmail, $normalizedEmail, $normalizedEmail]
                );
                if (!empty($result)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This email is already registered. Please use a different email or contact support.',
                    ], 422);
                }
                // Also check email_identities table for global uniqueness
                try {
                    $identityResult = DB::connection('mysql_master')->select(
                        "SELECT id FROM `{$dbName}`.`email_identities` WHERE normalized_email = ? LIMIT 1",
                        [$normalizedEmail]
                    );
                    if (!empty($identityResult)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'This email is already registered. Please use a different email or contact support.',
                        ], 422);
                    }
                } catch (\Throwable $e) {
                    // email_identities table may not exist in older tenants
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

            // Step 2b: Fix any missing columns/tables that schema import might have missed
            try {
                \App\Console\Commands\FixTenantColumns::fixDatabaseProgrammatic($dbName);
            } catch (\Throwable $e) {
                \Log::warning('FixTenantColumns failed during register', ['db' => $dbName, 'error' => $e->getMessage()]);
            }

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
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $stmt = $pdo->prepare("INSERT INTO `{$escaped}`.`users` (name, email, personal_email, professional_email, phone_number, contact_no, password, role, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())");
            $stmt->execute([$validated['name'], $email, $email, $email, $phone, $phone, $hashedPassword]);
            $foundingAdminId = $pdo->lastInsertId();

            // Save founding admin ID to org record
            $org->update(['founding_admin_id' => $foundingAdminId]);

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
            'plan_id'        => 'required|integer|exists:mysql_master.organization_plans,id',
            'billing_period' => 'nullable|string|in:monthly,yearly',
            'customize_trial' => 'nullable|boolean',
            'trial_duration'       => 'nullable|integer|min:1',
            'trial_duration_unit'  => 'nullable|string|in:minutes,hours,days',
            'trial_max_users'      => 'nullable|integer|min:1',
            'trial_max_projects'   => 'nullable|integer|min:1',
            'trial_max_storage_gb' => 'nullable|numeric|min:0.001',
            'trial_storage_unit'   => 'nullable|string|in:KB,MB,GB',
            'is_custom'            => 'nullable|boolean',
            'custom_price_monthly' => 'nullable|numeric|min:0',
            'custom_price_yearly'  => 'nullable|numeric|min:0',
            'custom_max_users'     => 'nullable|integer|min:1',
            'custom_max_projects'  => 'nullable|integer|min:1',
            'custom_max_storage_gb'=> 'nullable|numeric|min:0.001',
            'custom_storage_unit'  => 'nullable|string|in:KB,MB,GB',
            'password_type'        => 'nullable|string|in:auto,manual',
            'password'             => 'nullable|string|min:6|max:255',
        ]);

        // Use custom slug or auto-generate from name
        $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

        // Global email uniqueness check: admin_email cannot be used in ANY tenant
        $normalizedEmail = strtolower(trim($validated['admin_email']));
        $existingOrgs = Organization::where('status', '!=', 'deleted')->get();
        foreach ($existingOrgs as $org) {
            try {
                $chkDb = $org->database_name;
                if (!$chkDb) continue;
                $result = DB::connection('mysql_master')->select(
                    "SELECT id FROM `{$chkDb}`.`users` WHERE LOWER(email) = ? OR LOWER(personal_email) = ? OR LOWER(professional_email) = ? LIMIT 1",
                    [$normalizedEmail, $normalizedEmail, $normalizedEmail]
                );
                if (!empty($result)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This email is already registered. Please use a different email or contact support.',
                    ], 422);
                }
                try {
                    $identityResult = DB::connection('mysql_master')->select(
                        "SELECT id FROM `{$chkDb}`.`email_identities` WHERE normalized_email = ? LIMIT 1",
                        [$normalizedEmail]
                    );
                    if (!empty($identityResult)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'This email is already registered. Please use a different email or contact support.',
                        ], 422);
                    }
                } catch (\Throwable $e) {
                    // email_identities table may not exist in older tenants
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

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

            // Step 2b: Fix any missing columns/tables that schema import might have missed
            try {
                \App\Console\Commands\FixTenantColumns::fixDatabaseProgrammatic($dbName);
            } catch (\Throwable $e) {
                \Log::warning('FixTenantColumns failed during storeOrganization', ['db' => $dbName, 'error' => $e->getMessage()]);
            }

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
            $foundingAdminId = $pdo->lastInsertId();

            // Save founding admin ID to org record
            $org->update(['founding_admin_id' => $foundingAdminId]);

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
                    'storage_unit'          => $validated['custom_storage_unit'] ?? $plan->storage_unit ?? 'GB',
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
                'storage_unit'          => $customOverrides['storage_unit'] ?? null,
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
                    'storage_unit'        => $validated['trial_storage_unit'] ?? $plan->storage_unit ?? 'GB',
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
            'custom_max_storage_gb'=> 'nullable|numeric|min:0.001',
            'custom_storage_unit'  => 'nullable|string|in:KB,MB,GB',
            'customize_trial'      => 'nullable|boolean',
            'trial_duration'       => 'nullable|integer|min:1',
            'trial_duration_unit'  => 'nullable|string|in:minutes,hours,days',
            'trial_max_users'      => 'nullable|integer|min:1',
            'trial_max_projects'   => 'nullable|integer|min:1',
            'trial_max_storage_gb' => 'nullable|numeric|min:0.001',
            'trial_storage_unit'   => 'nullable|string|in:KB,MB,GB',
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
                        'storage_unit'          => $validated['custom_storage_unit'] ?? $plan->storage_unit ?? 'GB',
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
                    'storage_unit'          => $customOverrides['storage_unit'] ?? null,
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
                            'storage_unit'        => $validated['trial_storage_unit'] ?? $plan->storage_unit ?? 'GB',
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
            'max_storage_gb'       => ['sometimes', 'numeric', 'min:0.001'],
            'storage_unit'         => ['sometimes', 'string', 'in:KB,MB,GB'],
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

        if ($action = $request->input('action')) {
            $query->where('action', 'like', "%{$action}%");
        }

        if ($target = $request->input('target')) {
            $query->where('target', 'like', "%{$target}%");
        }

        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');
        if ($dateFrom || $dateTo) {
            $query->dateRange($dateFrom, $dateTo);
        }

        $logs = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json(['success' => true, 'data' => $logs]);
    }

    public function activityLogActions(): JsonResponse
    {
        $actions = ActivityLog::select('action')->distinct()->orderBy('action')->pluck('action')->toArray();
        return response()->json(['data' => $actions]);
    }

    public function allOrgAuditLogs(Request $request): JsonResponse
    {
        try {
            $orgs = Organization::on('mysql_master')->where('status', '!=', 'deleted')->get();
            $allLogs = [];

            foreach ($orgs as $org) {
                try {
                    $pdo = $this->getTenantPdo($org);
                    $this->ensureAuditLogUserNameColumn($pdo);

                    $where = [];
                    $bindings = [];

                    if ($request->filled('search')) {
                        $where[] = '(al.description LIKE ? OR al.module LIKE ? OR al.action LIKE ? OR al.ip_address LIKE ? OR COALESCE(u.name, al.user_name) LIKE ?)';
                        $search = '%' . $request->input('search') . '%';
                        $bindings[] = $search;
                        $bindings[] = $search;
                        $bindings[] = $search;
                        $bindings[] = $search;
                        $bindings[] = $search;
                    }
                    if ($request->filled('module')) {
                        $where[] = 'al.module = ?';
                        $bindings[] = $request->input('module');
                    }
                    if ($request->filled('action')) {
                        $where[] = 'al.action = ?';
                        $bindings[] = $request->input('action');
                    }
                    if ($request->filled('status')) {
                        $where[] = 'al.status = ?';
                        $bindings[] = $request->input('status');
                    }
                    if ($request->filled('date_from')) {
                        $where[] = 'al.created_at >= ?';
                        $bindings[] = $request->input('date_from') . ' 00:00:00';
                    }
                    if ($request->filled('date_to')) {
                        $where[] = 'al.created_at <= ?';
                        $bindings[] = $request->input('date_to') . ' 23:59:59';
                    }

                    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

                    $sql = "SELECT al.*, COALESCE(u.name, al.user_name) AS user_name, u.email AS user_email, u.role AS user_role
                            FROM audit_logs al
                            LEFT JOIN users u ON al.user_id = u.id
                            {$whereClause}
                            ORDER BY al.created_at DESC
                            LIMIT 500";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($bindings);
                    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                    foreach ($rows as $row) {
                        $allLogs[] = [
                            'id' => (int) $row['id'],
                            'org_id' => $org->id,
                            'org_name' => $org->name,
                            'org_slug' => $org->slug,
                            'user_name' => $row['user_name'] ?? 'System',
                            'user_email' => $row['user_email'] ?? null,
                            'user_role' => $row['user_role'] ?? null,
                            'module' => $row['module'],
                            'action' => $row['action'],
                            'description' => $row['description'],
                            'status' => $row['status'],
                            'ip_address' => $row['ip_address'],
                            'browser' => $row['browser'],
                            'os' => $row['os'],
                            'device' => $row['device'],
                            'created_at' => $row['created_at'],
                        ];
                    }

                    $pdo = null;
                } catch (\Throwable $e) {
                    \Log::warning("Failed to fetch audit logs for org {$org->id}: " . $e->getMessage());
                    continue;
                }
            }

            // Sort all logs by created_at descending
            usort($allLogs, function ($a, $b) {
                return strtotime($b['created_at']) - strtotime($a['created_at']);
            });

            // Paginate manually
            $perPage = (int) $request->input('per_page', 25);
            $page = (int) $request->input('page', 1);
            $total = count($allLogs);
            $lastPage = max(1, (int) ceil($total / $perPage));
            $offset = ($page - 1) * $perPage;
            $paginatedLogs = array_slice($allLogs, $offset, $perPage);

            return response()->json([
                'success' => true,
                'data' => $paginatedLogs,
                'meta' => [
                    'current_page' => $page,
                    'last_page' => $lastPage,
                    'per_page' => $perPage,
                    'total' => $total,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch application logs: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function allOrgAuditLogModules(): JsonResponse
    {
        try {
            $orgs = Organization::on('mysql_master')->where('status', '!=', 'deleted')->get();
            $allModules = [];

            foreach ($orgs as $org) {
                try {
                    $pdo = $this->getTenantPdo($org);
                    $stmt = $pdo->query("SELECT DISTINCT module FROM audit_logs ORDER BY module");
                    $modules = $stmt->fetchAll(\PDO::FETCH_COLUMN);
                    $allModules = array_merge($allModules, $modules);
                    $pdo = null;
                } catch (\Throwable $e) {
                    continue;
                }
            }

            return response()->json(['data' => array_values(array_unique($allModules))]);
        } catch (\Throwable $e) {
            return response()->json(['data' => []]);
        }
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
            $result = DB::connection('mysql')->select("SELECT COUNT(*) as c FROM `{$dbName}`.`users` WHERE `active` = 1");
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

        // Strip -- comment lines (MariaDB dump header comments)
        $sql = preg_replace('/^--.*$/m', '', $sql);

        // Execute in large batches (much faster than line-by-line)
        $statements = array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== '' && $s !== '--');
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
            'max_storage_gb'      => 'required|numeric|min:0.001',
            'storage_unit'        => 'required|string|in:KB,MB,GB',
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

        $maxStorageGb = $subscription?->getEffectiveMaxStorageValue() ?? 10;
        $storageUnit = $subscription?->getEffectiveStorageUnit() ?? 'GB';

        // Org-level storage override (highest priority)
        if ($org->custom_max_storage_gb !== null) {
            $maxStorageGb = $org->custom_max_storage_gb;
            $storageUnit = $org->storage_unit ?? $storageUnit;
        }

        $storageFiles = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalMb = round($totalBytes / (1024 * 1024), 2);
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);

        $maxBytes = \App\Models\Master\OrganizationSubscription::convertToBytes($maxStorageGb, $storageUnit);
        $remainingBytes = max(0, $maxBytes - $totalBytes);
        $remainingGb = round($remainingBytes / (1024 * 1024 * 1024), 4);

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
                'storage_unit'     => $storageUnit,
                'usage_percent'    => $maxBytes > 0 ? round(($totalBytes / $maxBytes) * 100, 1) : 0,
                'remaining_bytes'  => $remainingBytes,
                'remaining_gb'     => $remainingGb,
                'by_category'      => $byCategory,
                'recent_files'     => $recentFiles,
                'total_files'      => $storageFiles->count(),
            ],
        ]);
    }

    public function deleteOrgStorageRecord(Request $request, string $orgId, string $recordId): JsonResponse
    {
        \Log::info("deleteOrgStorageRecord called", ['orgId' => $orgId, 'recordId' => $recordId]);

        $org = Organization::on('mysql_master')->find($orgId);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        // Fetch file details before deletion for audit log
        $fileRecord = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('id', $recordId)
            ->first();

        $fileName = $fileRecord?->file_name ?? 'Unknown';
        $fileSizeMb = $fileRecord?->file_size_bytes ? round($fileRecord->file_size_bytes / (1024 * 1024), 2) : 0;
        $fileCategory = $fileRecord?->category ?? 'Unknown';

        $result = \App\Services\StorageFileService::deleteFile($org, (int) $recordId);
        \Log::info("deleteFile result", ['result' => $result, 'orgId' => $orgId, 'recordId' => $recordId]);

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Record not found.'], 404);
        }

        // Write audit log to tenant DB
        $this->writeTenantAuditLog($org, [
            'module'     => 'storage',
            'action'     => 'delete',
            'description'=> "Deleted file \"{$fileName}\" ({$fileSizeMb} MB) from {$fileCategory}",
            'entity_type'=> 'storage_file',
            'entity_id'  => (int) $recordId,
            'old_values' => json_encode(['file_name' => $fileName, 'file_size_mb' => $fileSizeMb, 'category' => $fileCategory]),
            'new_values' => null,
            'status'     => 'success',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Also log to super admin activity logs
        ActivityLog::create([
            'user'   => $request->header('X-Admin-Name', 'Super Admin'),
            'action' => "Deleted file \"{$fileName}\" ({$fileSizeMb} MB) from organization",
            'target' => $org->name,
            'ip'     => $request->ip(),
            'status' => 'success',
        ]);

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

            if ($result['deleted_count'] > 0) {
                $this->writeTenantAuditLog($org, [
                    'module'     => 'storage',
                    'action'     => 'bulk_delete',
                    'description'=> "Bulk deleted {$result['deleted_count']} files older than {$months} months (freed {$result['freed_mb']} MB)",
                    'entity_type'=> 'storage_bulk',
                    'entity_id'  => null,
                    'old_values' => json_encode(['type' => 'old', 'months' => $months, 'deleted_count' => $result['deleted_count'], 'freed_mb' => $result['freed_mb']]),
                    'new_values' => null,
                    'status'     => 'success',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);

                ActivityLog::create([
                    'user'   => $request->header('X-Admin-Name', 'Super Admin'),
                    'action' => "Bulk deleted {$result['deleted_count']} old files ({$months}+ months) from organization",
                    'target' => $org->name,
                    'ip'     => $request->ip(),
                    'status' => 'success',
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => "{$result['deleted_count']} old files deleted from storage.",
                'deleted_count' => $result['deleted_count'],
                'freed_mb' => $result['freed_mb'],
            ]);
        }

        if ($type === 'large' && $minSizeGb) {
            $result = \App\Services\StorageFileService::deleteLargeFiles($org, (float) $minSizeGb);

            if ($result['deleted_count'] > 0) {
                $this->writeTenantAuditLog($org, [
                    'module'     => 'storage',
                    'action'     => 'bulk_delete',
                    'description'=> "Bulk deleted {$result['deleted_count']} files larger than {$minSizeGb} GB (freed {$result['freed_mb']} MB)",
                    'entity_type'=> 'storage_bulk',
                    'entity_id'  => null,
                    'old_values' => json_encode(['type' => 'large', 'min_size_gb' => $minSizeGb, 'deleted_count' => $result['deleted_count'], 'freed_mb' => $result['freed_mb']]),
                    'new_values' => null,
                    'status'     => 'success',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);

                ActivityLog::create([
                    'user'   => $request->header('X-Admin-Name', 'Super Admin'),
                    'action' => "Bulk deleted {$result['deleted_count']} large files (> {$minSizeGb} GB) from organization",
                    'target' => $org->name,
                    'ip'     => $request->ip(),
                    'status' => 'success',
                ]);
            }

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

        $maxStorageGb = $subscription?->getEffectiveMaxStorageValue() ?? 10;
        $storageUnit = $subscription?->getEffectiveStorageUnit() ?? 'GB';

        // Org-level storage override (highest priority)
        if ($org->custom_max_storage_gb !== null) {
            $maxStorageGb = $org->custom_max_storage_gb;
            $storageUnit = $org->storage_unit ?? $storageUnit;
        }

        $storageFiles = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);

        $maxBytes = \App\Models\Master\OrganizationSubscription::convertToBytes($maxStorageGb, $storageUnit);
        $remainingBytes = max(0, $maxBytes - $totalBytes);
        $remainingGb = round($remainingBytes / (1024 * 1024 * 1024), 4);
        $usagePercent = $maxBytes > 0 ? round(($totalBytes / $maxBytes) * 100, 1) : 0;

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
                'storage_unit' => $storageUnit,
                'usage_percent' => $usagePercent,
                'remaining_bytes'=> $remainingBytes,
                'remaining_gb' => $remainingGb,
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
                's3_access_key'               => $org->storage_s3_access_key ?? '',
                's3_secret_key'               => $org->storage_s3_secret_key ?? '',
                's3_endpoint'                 => $org->storage_s3_endpoint ?? '',
                'cleanup_months'              => $org->storage_cleanup_months ?? 6,
                'large_file_threshold_mb'     => $org->storage_large_file_threshold_mb ?? 500,
                'auto_cleanup_enabled'        => $org->storage_auto_cleanup ?? true,
                'warning_threshold_percent'   => $org->storage_warn_threshold ?? 80,
                'critical_threshold_percent'  => $org->storage_critical_threshold ?? 95,
                'auto_delete_enabled'         => $org->storage_auto_delete ?? false,
                'custom_max_storage_gb'       => $org->custom_max_storage_gb ?? null,
                'storage_unit'                => $org->storage_unit ?? 'GB',
            ],
        ]);
    }

    public function orgStoragePreferencesUpdate(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'storage_driver'             => 'nullable|string|in:local,s3',
            's3_bucket'                  => 'nullable|string|max:255',
            's3_region'                  => ['nullable','string','max:50'],
            's3_prefix'                  => 'nullable|string|max:100',
            's3_access_key'              => 'nullable|string|max:255',
            's3_secret_key'              => 'nullable|string|max:255',
            's3_endpoint'                => 'nullable|string|max:500',
            'cleanup_months'             => 'nullable|integer|min:1|max:60',
            'large_file_threshold_mb'    => 'nullable|integer|min:10|max:50000',
            'auto_cleanup_enabled'       => 'nullable|boolean',
            'warning_threshold_percent'  => 'nullable|integer|min:50|max:95',
            'critical_threshold_percent' => 'nullable|integer|min:60|max:100',
            'auto_delete_enabled'        => 'nullable|boolean',
            'custom_max_storage_gb'      => 'nullable|numeric|min:0.001|max:9999',
            'custom_storage_unit'        => 'nullable|string|in:KB,MB,GB',
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
            'storage_s3_endpoint'            => $request->input('s3_endpoint') !== '••••••••' ? $request->input('s3_endpoint') : null,
            'storage_cleanup_months'         => $request->input('cleanup_months'),
            'storage_large_file_threshold_mb'=> $request->input('large_file_threshold_mb'),
            'storage_auto_cleanup'           => $request->boolean('auto_cleanup_enabled'),
            'storage_warn_threshold'         => $request->input('warning_threshold_percent'),
            'storage_critical_threshold'     => $request->input('critical_threshold_percent'),
            'storage_auto_delete'            => $request->boolean('auto_delete_enabled'),
            'custom_max_storage_gb'          => $request->input('custom_max_storage_gb'),
            'storage_unit'                   => $request->has('custom_storage_unit') ? ($request->input('custom_storage_unit') ?: 'GB') : null,
        ];

        $org->update(array_filter($fields, fn($v) => $v !== null));

        // Dismiss old storage notifications so new ones with correct unit get created
        \App\Models\Master\OrganizationStorageNotification::on('mysql_master')
            ->where('organization_id', $org->id)
            ->update(['is_dismissed' => true]);

        // Trigger fresh notification check with new limits
        \App\Services\StorageNotificationService::checkAndNotify($org);

        return response()->json([
            'success' => true,
            'message' => 'Storage preferences updated.',
            'preferences' => [
                'storage_driver'              => $org->storage_driver,
                's3_bucket'                   => $org->storage_s3_bucket,
                's3_region'                   => $org->storage_s3_region,
                's3_prefix'                   => $org->storage_s3_prefix,
                's3_endpoint'                 => $org->storage_s3_endpoint,
                'cleanup_months'              => $org->storage_cleanup_months,
                'large_file_threshold_mb'     => $org->storage_large_file_threshold_mb,
                'auto_cleanup_enabled'        => $org->storage_auto_cleanup,
                'warning_threshold_percent'   => $org->storage_warn_threshold,
                'critical_threshold_percent'  => $org->storage_critical_threshold,
                'auto_delete_enabled'         => $org->storage_auto_delete,
                'custom_max_storage_gb'       => $org->custom_max_storage_gb,
                'storage_unit'                => $org->storage_unit,
            ],
        ]);
    }

    public function orgTestS3Connection(Request $request, string $id): JsonResponse
    {
        $request->validate([
            's3_bucket'       => 'required|string|max:255',
            's3_region'       => 'nullable|string|max:50',
            's3_access_key'   => 'required|string|max:255',
            's3_secret_key'   => 'required|string|max:255',
            's3_prefix'       => 'nullable|string|max:100',
            's3_endpoint'     => 'nullable|string|max:500',
        ]);

        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        try {
            $diskConfig = [
                'driver'                  => 's3',
                'key'                     => $request->input('s3_access_key'),
                'secret'                  => $request->input('s3_secret_key'),
                'region'                  => $request->input('s3_region') ?: 'us-east-1',
                'bucket'                  => $request->input('s3_bucket'),
                'use_path_style_endpoint' => false,
            ];

            // S3-compatible provider (Cloudflare R2, DigitalOcean Spaces, Wasabi, MinIO etc.)
            $endpoint = $request->input('s3_endpoint');
            if (!empty($endpoint)) {
                $diskConfig['endpoint'] = $endpoint;
                $diskConfig['use_path_style_endpoint'] = true;
            }

            config(['filesystems.disks.s3_test' => $diskConfig]);

            $disk = Storage::disk('s3_test');
            $prefix = rtrim($request->input('s3_prefix', ''), '/');
            $disk->files($prefix ? $prefix.'/' : '', 1);

            $provider = !empty($endpoint) ? 'S3-compatible provider' : 'AWS S3';
            return response()->json([
                'success' => true,
                'message' => "{$provider} connection successful. Bucket is accessible.",
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Connection failed: ' . $e->getMessage(),
            ]);
        }
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
            ->where('source', '!=', 'feedback')
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

        $ticketModel = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id);

        $supportCounts = [
            'open'    => (clone $ticketModel)->where('source', '!=', 'feedback')->where('status', 'open')->count(),
            'pending' => (clone $ticketModel)->where('source', '!=', 'feedback')->where('status', 'pending')->count(),
            'resolved'=> (clone $ticketModel)->where('source', '!=', 'feedback')->where('status', 'resolved')->count(),
            'closed'  => (clone $ticketModel)->where('source', '!=', 'feedback')->where('status', 'closed')->count(),
        ];

        $feedbackCounts = [
            'open'    => (clone $ticketModel)->where('source', 'feedback')->where('status', 'open')->count(),
            'pending' => (clone $ticketModel)->where('source', 'feedback')->where('status', 'pending')->count(),
            'resolved'=> (clone $ticketModel)->where('source', 'feedback')->where('status', 'resolved')->count(),
            'closed'  => (clone $ticketModel)->where('source', 'feedback')->where('status', 'closed')->count(),
        ];

        $counts = [
            'open'    => $supportCounts['open'] + $feedbackCounts['open'],
            'pending' => $supportCounts['pending'] + $feedbackCounts['pending'],
            'resolved'=> $supportCounts['resolved'] + $feedbackCounts['resolved'],
            'closed'  => $supportCounts['closed'] + $feedbackCounts['closed'],
            'support' => $supportCounts,
            'feedback'=> $feedbackCounts,
            'total'   => array_sum($supportCounts) + array_sum($feedbackCounts),
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
            ->where('source', '!=', 'feedback')
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
                'source'        => $ticket->source ?? 'manual',
                'assigned_to'   => $ticket->assigned_to_name,
                'feedback_metadata' => $ticket->feedback_metadata,
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
            ->where('source', '!=', 'feedback')
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
            ->where('source', '!=', 'feedback')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        $ticket->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Ticket closed.']);
    }

    // ─── Organization Feedback Tickets ───────────────────────────

    /**
     * Get all feedback-based support tickets across all organizations.
     */
    public function allFeedbackTickets(Request $request): JsonResponse
    {
        $query = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->with('organization:id,name,slug')
            ->with('user:id,name,email');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }

        if ($orgId = $request->query('organization_id')) {
            $query->where('organization_id', $orgId);
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('subject', 'like', "%{$search}%")
                  ->orWhere('feedback_reference_number', 'like', "%{$search}%")
                  ->orWhere('feedback_metadata->user_name', 'like', "%{$search}%")
                  ->orWhereHas('organization', function ($q2) use ($search) {
                      $q2->where('name', 'like', "%{$search}%");
                  });
            });
        }

        if ($feedbackType = $request->query('feedback_type')) {
            $query->whereJsonContains('feedback_metadata->feedback_type', $feedbackType);
        }

        if ($priority = $request->query('priority')) {
            $query->where('priority', strtolower($priority));
        }

        if ($dateStart = $request->query('date_start')) {
            $query->where('created_at', '>=', $dateStart);
        }

        if ($dateEnd = $request->query('date_end')) {
            $query->where('created_at', '<=', $dateEnd . ' 23:59:59');
        }

        $tickets = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        $counts = [
            'open'          => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'open')->count(),
            'under_review'  => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'under_review')->count(),
            'accepted'      => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'accepted')->count(),
            'planned'       => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'planned')->count(),
            'in_development'=> \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'in_development')->count(),
            'testing'       => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'testing')->count(),
            'resolved'      => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'resolved')->count(),
            'closed'        => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'closed')->count(),
            'rejected'      => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->where('status', 'rejected')->count(),
            'total'         => \App\Models\Master\OrganizationSupportTicket::on('mysql_master')->where('source', 'feedback')->count(),
        ];

        // Per-org feedback counts for card display
        $orgCounts = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->selectRaw('organization_id, status, COUNT(*) as cnt')
            ->groupBy('organization_id', 'status')
            ->get()
            ->groupBy('organization_id')
            ->map(function ($rows) {
                $counts = ['open' => 0, 'under_review' => 0, 'accepted' => 0, 'planned' => 0, 'in_development' => 0, 'testing' => 0, 'resolved' => 0, 'closed' => 0, 'rejected' => 0, 'total' => 0];
                foreach ($rows as $row) {
                    $counts[$row->status] = $row->cnt;
                    $counts['total'] += $row->cnt;
                }
                return $counts;
            });

        return response()->json([
            'success' => true,
            'data' => $tickets->items(),
            'counts' => $counts,
            'org_counts' => $orgCounts,
            'total' => $tickets->total(),
            'page' => $tickets->currentPage(),
            'per_page' => $tickets->perPage(),
            'last_page' => $tickets->lastPage(),
        ]);
    }

    /**
     * Get detail of a feedback-based support ticket.
     */
    public function feedbackTicketDetail(Request $request, string $ticketId): JsonResponse
    {
        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->with('organization:id,name,slug,storage_driver,storage_s3_prefix,storage_s3_bucket,storage_s3_region,storage_s3_access_key,storage_s3_secret_key,storage_s3_endpoint')
            ->with('user:id,name,email')
            ->with('messages.user:id,name,email')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Feedback ticket not found.'], 404);
        }

        // Mark org messages as read
        \App\Models\Master\OrganizationSupportMessage::on('mysql_master')
            ->where('ticket_id', $ticket->id)
            ->where('sender_type', 'organization')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        $messages = $ticket->messages->filter(function ($msg) use ($ticket) {
            return $msg->message !== $ticket->message;
        })->values()->map(function ($msg) {
            return [
                'id' => $msg->id,
                'message' => $msg->message,
                'sender_type' => $msg->sender_type,
                'is_read' => $msg->is_read,
                'user' => $msg->user ? [
                    'id' => $msg->user->id,
                    'name' => $msg->user->name,
                    'email' => $msg->user->email,
                ] : null,
                'created_at' => $msg->created_at?->toISOString(),
            ];
        });

        $metadata = $ticket->feedback_metadata ?? [];
        $feedbackDescription = $metadata['description'] ?? null;

        // Resolve file URLs for attachments (S3 pre-signed or local /storage/ paths)
        $org = $ticket->organization;
        if ($org) {
            if (!empty($metadata['screenshot_path'])) {
                $metadata['screenshot_url'] = \App\Services\StorageDiskResolver::getUrl($org, $metadata['screenshot_path']);
            }
            if (!empty($metadata['recording_path'])) {
                $metadata['recording_url'] = \App\Services\StorageDiskResolver::getUrl($org, $metadata['recording_path']);
            }
            if (!empty($metadata['attachment_path'])) {
                $metadata['attachment_url'] = \App\Services\StorageDiskResolver::getUrl($org, $metadata['attachment_path']);
            }
        }

        if (!$feedbackDescription && $ticket->tenant_feedback_id && $ticket->organization) {
            try {
                $pdo = $this->getTenantPdo($ticket->organization);
                $stmt = $pdo->prepare("SELECT description FROM feedback WHERE id = ?");
                $stmt->execute([$ticket->tenant_feedback_id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && !empty($row['description'])) {
                    $feedbackDescription = $row['description'];
                }
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to fetch feedback description from tenant DB: " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'ticket' => [
                'id' => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject' => $ticket->subject,
                'message' => $ticket->message,
                'description' => $feedbackDescription,
                'status' => $ticket->status,
                'priority' => $ticket->priority,
                'category' => $ticket->category,
                'source' => $ticket->source,
                'feedback_reference_number' => $ticket->feedback_reference_number,
                'feedback_metadata' => $metadata,
                'organization' => $ticket->organization ? [
                    'id' => $ticket->organization->id,
                    'name' => $ticket->organization->name,
                    'slug' => $ticket->organization->slug,
                ] : null,
                'user' => $ticket->user ? [
                    'id' => $ticket->user->id,
                    'name' => $ticket->user->name,
                    'email' => $ticket->user->email,
                ] : null,
                'created_at' => $ticket->created_at?->toISOString(),
                'updated_at' => $ticket->updated_at?->toISOString(),
            ],
            'messages' => $messages,
        ]);
    }

    /**
     * Reply to a feedback-based support ticket.
     * Also creates FeedbackNote in tenant DB so user sees it in FeedbackCenter.
     */
    public function feedbackTicketReply(Request $request, string $ticketId): JsonResponse
    {
        $request->validate(['message' => 'required|string']);

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->with('organization')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Feedback ticket not found.'], 404);
        }

        if ($ticket->status === 'closed') {
            return response()->json(['success' => false, 'message' => 'Cannot reply to a closed ticket.'], 400);
        }

        // 1. Save reply in master DB support messages
        $msg = \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id' => $ticket->id,
            'user_id' => null,
            'message' => $request->message,
            'sender_type' => 'support',
        ]);

        if ($ticket->status === 'open') {
            $ticket->update(['status' => 'pending']);
            \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
                'ticket_id' => $ticket->id,
                'user_id' => null,
                'message' => "Status changed from \"Open\" to \"Under Review\"",
                'sender_type' => 'support',
            ]);
        }

        $adminName = $request->header('X-Admin-Name', 'Super Admin');
        $feedbackId = $ticket->tenant_feedback_id ?? null;
        $org = $ticket->organization;

        // 2. Write FeedbackNote in tenant DB so user can see reply in FeedbackCenter
        if ($feedbackId && $org) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare(
                    "INSERT INTO feedback_notes (feedback_id, user_id, note, created_at, updated_at) VALUES (?, NULL, ?, NOW(), NOW())"
                );
                $stmt->execute([$feedbackId, "[Super Admin Reply] {$request->message}"]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to write FeedbackNote to tenant DB: " . $e->getMessage(), [
                    'ticket_id' => $ticket->id,
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 3. Log to ActivityLog (master DB)
        ActivityLog::create([
            'user' => $adminName,
            'action' => "Replied to feedback ticket {$ticket->ticket_number}" . ($feedbackId ? " (Feedback #{$feedbackId})" : ''),
            'target' => $ticket->subject,
            'ip' => $request->ip(),
            'status' => 'success',
        ]);

        // 4. Log to tenant AuditLog
        if ($org) {
            $this->writeTenantAuditLog($org, [
                'module' => 'Feedback',
                'action' => 'Super Admin Reply',
                'entity_type' => 'Feedback',
                'entity_id' => $feedbackId,
                'description' => "{$adminName} replied to feedback ticket {$ticket->ticket_number}: " . \Illuminate\Support\Str::limit($request->message, 200),
                'new_values' => json_encode(['message' => $request->message, 'ticket_number' => $ticket->ticket_number]),
                'status' => 'success',
            ]);
        }

        // 5. Log to FeedbackActivityLog in tenant DB
        if ($feedbackId && $org) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare(
                    "INSERT INTO feedback_activity_logs (feedback_id, user_id, action, details, created_at, updated_at) VALUES (?, NULL, ?, ?, NOW(), NOW())"
                );
                $stmt->execute([$feedbackId, 'super_admin_replied', "{$adminName} replied: " . \Illuminate\Support\Str::limit($request->message, 500)]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to write FeedbackActivityLog to tenant DB: " . $e->getMessage(), [
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 6. Log to Laravel application log
        \Log::info("Super Admin replied to feedback ticket", [
            'admin' => $adminName,
            'ticket_number' => $ticket->ticket_number,
            'feedback_id' => $feedbackId,
            'organization_id' => $ticket->organization_id,
            'message_preview' => \Illuminate\Support\Str::limit($request->message, 100),
        ]);

        return response()->json(['success' => true, 'reply' => $msg]);
    }

    /**
     * Close a feedback-based support ticket.
     * Also updates Feedback status in tenant DB.
     */
    public function feedbackTicketClose(Request $request, string $ticketId): JsonResponse
    {
        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->with('organization')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Feedback ticket not found.'], 404);
        }

        $oldStatus = $ticket->status;
        $ticket->update(['status' => 'closed', 'closed_at' => now()]);

        $adminName = $request->header('X-Admin-Name', 'Super Admin');
        $feedbackId = $ticket->tenant_feedback_id ?? null;
        $org = $ticket->organization;

        // Insert status change message for timeline
        $statusLabels = [
            'open' => 'Open', 'under_review' => 'Under Review', 'accepted' => 'Accepted',
            'planned' => 'Planned', 'in_development' => 'In Development', 'testing' => 'Testing',
            'resolved' => 'Resolved', 'closed' => 'Closed', 'rejected' => 'Rejected',
        ];
        $oldLabel = $statusLabels[$oldStatus] ?? $oldStatus;
        \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id' => $ticket->id,
            'user_id' => null,
            'message' => "Status changed from \"{$oldLabel}\" to \"Closed\" by {$adminName}",
            'sender_type' => 'support',
        ]);

        // 1. Update Feedback status in tenant DB
        if ($feedbackId && $org) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare("UPDATE feedback SET status = 'Closed', updated_at = NOW() WHERE id = ?");
                $stmt->execute([$feedbackId]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to update Feedback status in tenant DB: " . $e->getMessage(), [
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 2. Log to ActivityLog (master DB)
        ActivityLog::create([
            'user' => $adminName,
            'action' => "Closed feedback ticket {$ticket->ticket_number}" . ($feedbackId ? " (Feedback #{$feedbackId})" : ''),
            'target' => $ticket->subject,
            'ip' => $request->ip(),
            'status' => 'success',
        ]);

        // 3. Log to tenant AuditLog
        if ($org) {
            $this->writeTenantAuditLog($org, [
                'module' => 'Feedback',
                'action' => 'Super Admin Closed',
                'entity_type' => 'Feedback',
                'entity_id' => $feedbackId,
                'description' => "{$adminName} closed feedback ticket {$ticket->ticket_number} (was: {$oldStatus})",
                'old_values' => json_encode(['status' => $oldStatus]),
                'new_values' => json_encode(['status' => 'closed']),
                'status' => 'success',
            ]);
        }

        // 4. Log to FeedbackActivityLog in tenant DB
        if ($feedbackId && $org) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare(
                    "INSERT INTO feedback_activity_logs (feedback_id, user_id, action, details, created_at, updated_at) VALUES (?, NULL, ?, ?, NOW(), NOW())"
                );
                $stmt->execute([$feedbackId, 'super_admin_closed', "{$adminName} closed this feedback ticket"]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to write FeedbackActivityLog to tenant DB: " . $e->getMessage(), [
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 5. Log to Laravel application log
        \Log::info("Super Admin closed feedback ticket", [
            'admin' => $adminName,
            'ticket_number' => $ticket->ticket_number,
            'feedback_id' => $feedbackId,
            'organization_id' => $ticket->organization_id,
            'old_status' => $oldStatus,
        ]);

        return response()->json(['success' => true, 'message' => 'Feedback ticket closed.']);
    }

    /**
     * Update status of a feedback-based support ticket.
     * Also updates Feedback status in tenant DB.
     */
    public function feedbackTicketUpdateStatus(Request $request, string $ticketId): JsonResponse
    {
        $request->validate([
            'status' => 'required|string|in:open,under_review,accepted,planned,in_development,testing,resolved,closed,rejected',
        ]);

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->with('organization')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Feedback ticket not found.'], 404);
        }

        $oldStatus = $ticket->status;
        $newStatus = $request->status;

        $updates = ['status' => $newStatus];
        if ($newStatus === 'resolved' && $oldStatus !== 'resolved') {
            $updates['resolved_at'] = now();
        }
        if ($newStatus === 'closed' && $oldStatus !== 'closed') {
            $updates['closed_at'] = now();
        }

        $ticket->update($updates);

        $adminName = $request->header('X-Admin-Name', 'Super Admin');
        $feedbackId = $ticket->tenant_feedback_id ?? null;
        $org = $ticket->organization;

        // Format status labels for display
        $statusLabels = [
            'open' => 'Open',
            'under_review' => 'Under Review',
            'accepted' => 'Accepted',
            'planned' => 'Planned',
            'in_development' => 'In Development',
            'testing' => 'Testing',
            'resolved' => 'Resolved',
            'closed' => 'Closed',
            'rejected' => 'Rejected',
        ];
        $oldLabel = $statusLabels[$oldStatus] ?? $oldStatus;
        $newLabel = $statusLabels[$newStatus] ?? $newStatus;

        // Map support status to feedback status (for tenant DB feedback table)
        $feedbackStatusMap = [
            'open' => 'New',
            'under_review' => 'Under Review',
            'accepted' => 'Accepted',
            'planned' => 'Planned',
            'in_development' => 'In Development',
            'testing' => 'Testing',
            'resolved' => 'Resolved',
            'closed' => 'Closed',
            'rejected' => 'Rejected',
        ];

        // 0. Insert status change message into OrganizationSupportMessage (for admin timeline)
        \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id' => $ticket->id,
            'user_id' => null,
            'message' => "Status changed from \"{$oldLabel}\" to \"{$newLabel}\" by {$adminName}",
            'sender_type' => 'support',
        ]);

        // 1. Update Feedback status in tenant DB
        if ($feedbackId && $org && isset($feedbackStatusMap[$newStatus])) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare("UPDATE feedback SET status = ?, updated_at = NOW() WHERE id = ?");
                $stmt->execute([$feedbackStatusMap[$newStatus], $feedbackId]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to update Feedback status in tenant DB: " . $e->getMessage(), [
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 2. Log to ActivityLog (master DB)
        ActivityLog::create([
            'user' => $adminName,
            'action' => "Feedback ticket {$ticket->ticket_number} status changed from '{$oldStatus}' to '{$newStatus}'" . ($feedbackId ? " (Feedback #{$feedbackId})" : ''),
            'target' => $ticket->subject,
            'ip' => $request->ip(),
            'status' => 'success',
        ]);

        // 3. Log to tenant AuditLog
        if ($org) {
            $this->writeTenantAuditLog($org, [
                'module' => 'Feedback',
                'action' => 'Status Changed',
                'entity_type' => 'Feedback',
                'entity_id' => $feedbackId,
                'description' => "{$adminName} changed feedback ticket {$ticket->ticket_number} status from '{$oldStatus}' to '{$newStatus}'",
                'old_values' => json_encode(['status' => $oldStatus]),
                'new_values' => json_encode(['status' => $newStatus]),
                'status' => 'success',
            ]);
        }

        // 4. Log to FeedbackActivityLog in tenant DB
        if ($feedbackId && $org) {
            try {
                $pdo = $this->getTenantPdo($org);
                $stmt = $pdo->prepare(
                    "INSERT INTO feedback_activity_logs (feedback_id, user_id, action, details, created_at, updated_at) VALUES (?, NULL, ?, ?, NOW(), NOW())"
                );
                $stmt->execute([$feedbackId, 'status_changed', "{$adminName} changed status from '{$oldStatus}' to '{$newStatus}'"]);
                $pdo = null;
            } catch (\Throwable $e) {
                \Log::error("Failed to write FeedbackActivityLog to tenant DB: " . $e->getMessage(), [
                    'feedback_id' => $feedbackId,
                    'org_id' => $org->id,
                ]);
            }
        }

        // 5. Log to Laravel application log
        \Log::info("Super Admin updated feedback ticket status", [
            'admin' => $adminName,
            'ticket_number' => $ticket->ticket_number,
            'feedback_id' => $feedbackId,
            'organization_id' => $ticket->organization_id,
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
        ]);

        return response()->json(['success' => true, 'message' => 'Status updated.']);
    }

    // ─── Organization Audit Logs (reads from tenant DB) ───────────

    private function getTenantPdo(Organization $org): \PDO
    {
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
        return $pdo;
    }

    private function writeTenantAuditLog(Organization $org, array $data): void
    {
        try {
            $pdo = $this->getTenantPdo($org);
            $request = request();

            // Ensure user_name column exists
            $this->ensureAuditLogUserNameColumn($pdo);

            // Parse user agent for browser, OS, device
            $ua = $this->parseUserAgent($request->userAgent());

            // Get authenticated super admin info
            $userId = null;
            $userName = null;
            $adminUser = $this->getSuperAdminUser();
            if ($adminUser) {
                $userName = $adminUser->name ?? null;
                if (!empty($adminUser->email)) {
                    $findUser = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
                    $findUser->execute([$adminUser->email]);
                    $tenantUser = $findUser->fetch(\PDO::FETCH_ASSOC);
                    if ($tenantUser) {
                        $userId = (int) $tenantUser['id'];
                    }
                }
            }

            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (user_id, user_name, module, action, entity_type, entity_id, description, old_values, new_values, status, ip_address, user_agent, browser, os, device, request_method, request_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ");
            $stmt->execute([
                $userId,
                $userName,
                $data['module'] ?? null,
                $data['action'] ?? null,
                $data['entity_type'] ?? null,
                $data['entity_id'] ?? null,
                $data['description'] ?? null,
                $data['old_values'] ?? null,
                $data['new_values'] ?? null,
                $data['status'] ?? 'success',
                $data['ip_address'] ?? $request->ip(),
                $data['user_agent'] ?? $request->userAgent(),
                $ua['browser'],
                $ua['os'],
                $ua['device'],
                $request->method(),
                $data['request_url'] ?? $request->fullUrl(),
            ]);

            $pdo = null;
        } catch (\Throwable $e) {
            \Log::warning("Failed to write tenant audit log for org {$org->id}: " . $e->getMessage());
        }
    }

    private function ensureAuditLogUserNameColumn(\PDO $pdo): void
    {
        try {
            $stmt = $pdo->prepare("SHOW COLUMNS FROM audit_logs LIKE 'user_name'");
            $stmt->execute();
            if ($stmt->fetch() === false) {
                $pdo->exec("ALTER TABLE audit_logs ADD COLUMN user_name VARCHAR(255) NULL AFTER user_id");
            }
        } catch (\Throwable $e) {
            // Column may already exist or table may not exist yet
        }
    }

    private function parseUserAgent(?string $ua): array
    {
        $result = ['browser' => 'Unknown', 'os' => 'Unknown', 'device' => 'Desktop'];

        if (!$ua) {
            return $result;
        }

        $ua = mb_strtolower($ua);

        if (str_contains($ua, 'edg')) {
            $result['browser'] = 'Edge';
        } elseif (str_contains($ua, 'chrome')) {
            $result['browser'] = 'Chrome';
        } elseif (str_contains($ua, 'safari') && !str_contains($ua, 'chrome')) {
            $result['browser'] = 'Safari';
        } elseif (str_contains($ua, 'firefox')) {
            $result['browser'] = 'Firefox';
        } elseif (str_contains($ua, 'opera') || str_contains($ua, 'opr')) {
            $result['browser'] = 'Opera';
        } elseif (str_contains($ua, 'msie') || str_contains($ua, 'trident')) {
            $result['browser'] = 'Internet Explorer';
        }

        if (str_contains($ua, 'windows')) {
            $result['os'] = 'Windows';
        } elseif (str_contains($ua, 'mac os') || str_contains($ua, 'macintosh')) {
            $result['os'] = 'macOS';
        } elseif (str_contains($ua, 'linux') && !str_contains($ua, 'android')) {
            $result['os'] = 'Linux';
        } elseif (str_contains($ua, 'android')) {
            $result['os'] = 'Android';
        } elseif (str_contains($ua, 'ios') || str_contains($ua, 'iphone') || str_contains($ua, 'ipad')) {
            $result['os'] = 'iOS';
        }

        if (str_contains($ua, 'mobile') || str_contains($ua, 'iphone') || str_contains($ua, 'android')) {
            $result['device'] = 'Mobile';
        } elseif (str_contains($ua, 'tablet') || str_contains($ua, 'ipad')) {
            $result['device'] = 'Tablet';
        } elseif (str_contains($ua, 'bot') || str_contains($ua, 'crawl')) {
            $result['device'] = 'Bot';
        }

        return $result;
    }

    /**
     * Validate that an email domain has valid MX records and is not a known throwaway/fake domain.
     * Prevents registration with fake/dummy email addresses.
     */
    private static function isValidEmailDomain(string $domain): bool
    {
        // Allow common dev/test domains
        $allowedDomains = ['localhost', 'test.com', 'example.com', 'mailinator.com'];
        if (in_array($domain, $allowedDomains)) {
            return true;
        }
        // Allow draft emails
        if (str_ends_with($domain, 'draft.local')) {
            return true;
        }

        // Block known fake/throwaway/temporary email domains
        $blockedDomains = [
            'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
            'tempmail.com', 'throwaway.email', 'temp-mail.org', 'fakeinbox.com',
            'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
            'yopmail.com', 'yopmail.fr', 'maildrop.cc', 'trashmail.com',
            'mailnator.com', 'tempr.email', 'discard.email', 'discardmail.com',
            '10minutemail.com', 'getnada.com', 'mohmal.com',
            'test.com', 'example.com', 'localhost',
        ];
        if (in_array($domain, $blockedDomains)) {
            return false;
        }

        // Check MX/A records using dns_get_record (works on Windows + Linux)
        $records = dns_get_record($domain, DNS_MX);
        if (!empty($records)) {
            // Extra check: block domains with suspicious MX records (like root "." only)
            if (count($records) === 1 && trim($records[0]['target'], '.') === '') {
                return false;
            }
            return true;
        }
        // Fallback: check A record
        $aRecords = dns_get_record($domain, DNS_A);
        return !empty($aRecords);
    }

    public function orgAuditLogs(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        try {
            $pdo = $this->getTenantPdo($org);
            $this->ensureAuditLogUserNameColumn($pdo);

            $perPage = (int) $request->input('per_page', 25);
            $page = (int) $request->input('page', 1);
            $offset = ($page - 1) * $perPage;

            $where = [];
            $bindings = [];

            if ($request->filled('module')) {
                $where[] = 'al.module = ?';
                $bindings[] = $request->input('module');
            }
            if ($request->filled('action')) {
                $where[] = 'al.action = ?';
                $bindings[] = $request->input('action');
            }
            if ($request->filled('status')) {
                $where[] = 'al.status = ?';
                $bindings[] = $request->input('status');
            }
            if ($request->filled('user_id')) {
                $where[] = 'al.user_id = ?';
                $bindings[] = (int) $request->input('user_id');
            }
            if ($request->filled('date_from')) {
                $where[] = 'al.created_at >= ?';
                $bindings[] = $request->input('date_from') . ' 00:00:00';
            }
            if ($request->filled('date_to')) {
                $where[] = 'al.created_at <= ?';
                $bindings[] = $request->input('date_to') . ' 23:59:59';
            }
            if ($request->filled('search')) {
                $where[] = '(al.description LIKE ? OR al.module LIKE ? OR al.action LIKE ? OR al.ip_address LIKE ?)';
                $search = '%' . $request->input('search') . '%';
                $bindings[] = $search;
                $bindings[] = $search;
                $bindings[] = $search;
                $bindings[] = $search;
            }

            $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

            $sortField = $request->input('sort_field', 'created_at');
            $sortOrder = $request->input('sort_order', 'desc');
            $allowedSorts = ['created_at', 'module', 'action', 'status'];
            if (!in_array($sortField, $allowedSorts)) {
                $sortField = 'created_at';
            }
            $sortOrder = strtolower($sortOrder) === 'asc' ? 'ASC' : 'DESC';

            // Get total count
            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM audit_logs al {$whereClause}");
            $countStmt->execute($bindings);
            $total = (int) $countStmt->fetchColumn();
            $lastPage = max(1, (int) ceil($total / $perPage));

            // Fetch logs with user join, fallback to user_name column (for super admin entries)
            $sql = "SELECT al.*, u.id AS uid, COALESCE(u.name, al.user_name) AS uname, u.email AS uemail, u.role AS urole
                    FROM audit_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    {$whereClause}
                    ORDER BY al.{$sortField} {$sortOrder}
                    LIMIT {$perPage} OFFSET {$offset}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($bindings);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $data = array_map(function ($row) {
                return [
                    'id' => (int) $row['id'],
                    'user_id' => $row['user_id'] ? (int) $row['user_id'] : null,
                    'module' => $row['module'],
                    'action' => $row['action'],
                    'entity_type' => $row['entity_type'],
                    'entity_id' => $row['entity_id'] ? (int) $row['entity_id'] : null,
                    'description' => $row['description'],
                    'old_values' => $row['old_values'] ? json_decode($row['old_values'], true) : null,
                    'new_values' => $row['new_values'] ? json_decode($row['new_values'], true) : null,
                    'status' => $row['status'],
                    'ip_address' => $row['ip_address'],
                    'browser' => $row['browser'],
                    'os' => $row['os'],
                    'device' => $row['device'],
                    'request_method' => $row['request_method'],
                    'request_url' => $row['request_url'],
                    'created_at' => $row['created_at'],
                    'updated_at' => $row['updated_at'],
                    'user' => $row['uname'] ? [
                        'id' => $row['uid'] ? (int) $row['uid'] : null,
                        'name' => $row['uname'],
                        'email' => $row['uemail'] ?? null,
                        'role' => $row['urole'] ?? 'super_admin',
                    ] : null,
                ];
            }, $rows);

            $pdo = null;

            return response()->json([
                'data' => $data,
                'meta' => [
                    'current_page' => $page,
                    'last_page' => $lastPage,
                    'per_page' => $perPage,
                    'total' => $total,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch audit logs: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function orgAuditLogModules(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        try {
            $pdo = $this->getTenantPdo($org);
            $stmt = $pdo->query("SELECT DISTINCT module FROM audit_logs ORDER BY module");
            $modules = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $pdo = null;
            return response()->json(['data' => $modules]);
        } catch (\Throwable $e) {
            return response()->json(['data' => []]);
        }
    }

    public function orgAuditLogActions(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        try {
            $pdo = $this->getTenantPdo($org);
            $stmt = $pdo->query("SELECT DISTINCT action FROM audit_logs ORDER BY action");
            $actions = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $pdo = null;
            return response()->json(['data' => $actions]);
        } catch (\Throwable $e) {
            return response()->json(['data' => []]);
        }
    }

    public function orgAuditLogUsers(Request $request, string $id): JsonResponse
    {
        $org = Organization::on('mysql_master')->find($id);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        try {
            $pdo = $this->getTenantPdo($org);
            $stmt = $pdo->query("SELECT DISTINCT u.id, u.name, u.email, u.role FROM users u INNER JOIN audit_logs al ON al.user_id = u.id ORDER BY u.name");
            $users = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $pdo = null;
            return response()->json(['data' => array_map(fn($u) => ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role']], $users)]);
        } catch (\Throwable $e) {
            return response()->json(['data' => []]);
        }
    }
}
