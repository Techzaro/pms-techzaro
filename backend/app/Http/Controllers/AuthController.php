<?php

namespace App\Http\Controllers;

use App\Mail\PasswordChangedMail;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\UserChange;
use App\Services\ActivityService;
use App\Models\Master\Organization as MasterOrganization;
use App\Services\AuditService;
use App\Services\Saas\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Controller responsible for authentication actions.
 * Handles user login, logout, first-time password changes, password updates,
 * and authenticated user profile retrieval/update.
 */
class AuthController extends Controller
{
    public function __construct(
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /**
     * Authenticate a user and return a Sanctum API token.
     *
     * Validates credentials, checks account active status, generates a token,
     * tracks last login time, and normalizes the role format.
     * Enforces brute-force protection (5 failed attempts = 15 min lockout).
     *
     * @param  Request  $request  Input: email (required), password (required).
     * @return JsonResponse JSON response with token, role, and user data on success.
     */
    public function login(Request $request)
    {
        try {
            // validation
            $request->validate([
                'email' => 'required|email',
                'password' => 'required',
            ]);

            // Note: personal email restriction removed — allow authentication
            // any additional organization-level email policy is enforced elsewhere.

            // Rate limiting key per normalized email & IP
            $throttleKey = Str::lower(trim($request->email)) . '|' . $request->ip();

            // Check if account is locked out (max 5 failed attempts)
            if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
                $seconds = RateLimiter::availableIn($throttleKey);
                $minutes = max(1, (int) ceil($seconds / 60));
                $unit = $minutes === 1 ? 'minute' : 'minutes';

                return response()->json([
                    'success' => false,
                    'message' => "Too many failed login attempts. Please try again in {$minutes} {$unit}.",
                ], 429);
            }

            // Look up user by email — guests use personal_email, employees use professional_email
            $dbNotFound = false;
            $crossTenantResult = null;
            try {
                $user = User::where('professional_email', $request->email)
                    ->orWhere('email', $request->email)
                    ->orWhere('personal_email', $request->email)
                    ->first();
            } catch (\Throwable $e) {
                // Database may not exist (org deleted). Mark it and try cross-tenant.
                $user = null;
                if (str_contains($e->getMessage(), 'Unknown database') || str_contains($e->getMessage(), '1049')) {
                    $dbNotFound = true;
                }
            }

            if (! $user || ! Hash::check($request->password, $user->password ?? '')) {
                // Track failed attempt with 15-minute decay window (900 seconds)
                RateLimiter::hit($throttleKey, 900);

                if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
                    $seconds = RateLimiter::availableIn($throttleKey);
                    $minutes = max(1, (int) ceil($seconds / 60));
                    $unit = $minutes === 1 ? 'minute' : 'minutes';

                    return response()->json([
                        'success' => false,
                        'message' => "Too many failed login attempts. Please try again in {$minutes} {$unit}.",
                    ], 429);
                }

                // Try cross-tenant lookup
                // Reset mysql connection to default before searching across tenants
                if ($dbNotFound) {
                    config()->set('database.connections.mysql.database', config('database.connections.mysql_master.database'));
                    DB::purge('mysql');
                    DB::reconnect('mysql');
                }
                $defaultDb = config('database.connections.mysql.database');
                $result = $this->findUserAcrossTenants($request->email, $defaultDb, $request->password);
                $crossTenantResult = $result;
                if (! $result) {
                    // Also check soft-deleted orgs — their DB may have been dropped
                    $deletedOrgWithUser = $this->findUserInDeletedOrgs($request->email);
                    $errorMsg = $deletedOrgWithUser
                        ? 'Organization does not exist. Please contact administration.'
                        : 'Invalid Email or Password';
                    return response()->json([
                        'success' => false,
                        'message' => $errorMsg,
                    ], 401);
                }
            }

            // Successful login — reset rate limiter counter to 0
            RateLimiter::clear($throttleKey);

            // logged in user

            $email = $request->email;
            $organization = $request->attributes->get('currentOrganization');
            $tenantSlug = $organization?->slug;

            // If we already found the user via cross-tenant search, use that slug
            if (!$tenantSlug && $crossTenantResult) {
                $tenantSlug = $crossTenantResult['slug'] ?? null;
                $organization = $crossTenantResult['organization'] ?? null;
            }

            // Step 1: Look up in current tenant DB (default or resolved tenant)
            try {
                $tenantUser = User::where('professional_email', $email)
                    ->orWhere('email', $email)
                    ->orWhere('personal_email', $email)
                    ->first();
            } catch (\Throwable $e) {
                // Reset connection before cross-tenant search
                config()->set('database.connections.mysql.database', config('database.connections.mysql_master.database', 'saas_master'));
                DB::purge('mysql');
                DB::reconnect('mysql');
                $tenantUser = null;
            }

            if ($tenantUser) {
                $user = $tenantUser;
                // If still no slug from cross-tenant, do a targeted search
                if (!$tenantSlug) {
                    $defaultDb = config('database.connections.mysql.database');
                    $result = $this->findUserAcrossTenants($email, $defaultDb, $request->password);
                    if ($result) {
                        $tenantSlug = $result['slug'];
                        $organization = $result['organization'];
                    }
                }
            } else {
                // Step 2: Verify password — if user not found or password wrong, search across all tenant DBs
                $defaultDb = config('database.connections.mysql.database');
                $result = $this->findUserAcrossTenants($email, $defaultDb, $request->password);
                if ($result) {
                    $user = $result['user'];
                    $tenantSlug = $result['slug'];
                    $organization = $result['organization'];
                }
            }

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Organization does not exist. Please contact administration.',
                ], 404);
            }

            if ($user->active === false && ! $user->must_change_password) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your account has been resigned. You no longer have access to the system. Please contact your administrator.',
                ], 403);
            }

            // ── Organization status & subscription check ──────────────────────
            $masterOrg = null;
            if ($organization && isset($organization->id)) {
                $masterOrg = MasterOrganization::find($organization->id);
            } elseif ($tenantSlug) {
                $masterOrg = MasterOrganization::where('slug', $tenantSlug)->first();
            }

            if ($masterOrg) {
                if (in_array($masterOrg->status, ['suspended', 'archived'])) {
                    $statusMessages = [
                        'suspended' => 'Your organization has been suspended. Please contact TechXaro support team for assistance.',
                        'archived'  => 'Your organization has been archived. Please contact TechXaro support team for assistance.',
                    ];
                    return response()->json([
                        'success' => false,
                        'message' => $statusMessages[$masterOrg->status] ?? 'Your organization is not active. Please contact TechXaro support team.',
                    ], 403);
                }

                $subscriptionService = app(SubscriptionService::class);
                $subscriptionService->renewExpiredSubscription($masterOrg);
            }

            // Handle remember_me flag (24 hours / 1 day if true, 3 hours default if false)
            $rememberMe = $request->boolean('remember_me');
            $expiresAt = $rememberMe ? now()->addDays(1) : now()->addHours(3);

            // generate Sanctum token with explicit expiration
            $tokenResult = $user->createToken('auth_token', ['*'], $expiresAt);
            $token = $tokenResult->plainTextToken;

            // Store token mapping in saas_master so ResolveTenantDatabase can resolve
            // the tenant from the bearer token when no subdomain/header is present.
            // The slug is encoded in the token name: "pms_token|{tenant_slug}"
            try {
                $tokenHash = hash('sha256', $token);
                DB::connection('mysql_master')->table('personal_access_tokens')->insert([
                    'tokenable_type' => 'App\\Models\\User',
                    'tokenable_id'   => $user->id,
                    'name'           => 'pms_token|' . ($finalTenantSlug ?? ''),
                    'token'          => $tokenHash,
                    'abilities'      => json_encode(['*']),
                    'expires_at'     => $expiresAt,
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
            } catch (\Throwable $e) {
                \Log::warning('Failed to store token mapping in master DB', ['error' => $e->getMessage()]);
            }

            // Track last login
            $user->update(['last_login_at' => now()]);

            // Log activity
            $this->activityService->log($user->id, 'auth_login', 'Logged in to system', 'auth', $user->id, 'login');

            try {
                $this->auditService->log(
                    module: 'auth',
                    action: 'login',
                    description: 'User logged in successfully',
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit on login', ['error' => $e->getMessage()]);
            }

            // Normalize role (teamlead → team_lead)
            $role = $user->role === 'teamlead' ? 'team_lead' : $user->role;

            // Determine tenant slug: explicit resolution > org relationship > env default
            $finalTenantSlug = $tenantSlug;
            if (!$finalTenantSlug && $organization) {
                $finalTenantSlug = $organization->slug;
            }
            if (!$finalTenantSlug) {
                $org = $user->organization ?? $user->organizationName ?? null;
                if ($org) {
                    $finalTenantSlug = $org->slug ?? $org->name ?? null;
                }
            }
            if (!$finalTenantSlug) {
                $finalTenantSlug = config('tenancy.domain', 'techxaro');
            }

            $response = [
                'success' => true,
                'message' => 'Login successful',
                'token' => $token,
                'role' => $role,
                'must_change_password' => (bool) $user->must_change_password,
                'remember_me' => $rememberMe,
                'expires_at' => $expiresAt->toISOString(),
                'tenant_slug' => $finalTenantSlug,
                'app_url' => \App\Helpers\UrlHelper::getOrgAppUrl(),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'avatar' => $user->avatar ?? null,
                    'email' => $user->login_email ?: $user->email ?: $user->professional_email ?: $user->personal_email ?: $email,
                    'role' => $role,
                    'active' => (bool) $user->active,
                    'must_change_password' => (bool) $user->must_change_password,
                    'language' => $user->language ?? 'English',
                    'timezone' => $user->timezone ?? 'UTC',
                    'date_format' => $user->date_format ?? 'DD/MM/YYYY',
                    'time_format' => $user->time_format ?? '12-hour',
                    'working_hours' => $user->working_hours,
                ],
            ];

            return response()->json($response);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Server Error',
            ], 500);
        }
    }

    /**
     * Log out the authenticated user by revoking the current access token.
     *
     * @param  Request  $request  The incoming HTTP request with the authenticated user.
     * @return JsonResponse JSON response confirming logout.
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        $user->currentAccessToken()->delete();

        // Also remove the token mapping from saas_master
        try {
            $token = $request->bearerToken();
            \Log::info('firstTimeChangePassword called', ['has_bearer' => $token ? true : false]);
            if ($token) {
                $tokenHash = hash('sha256', $token);
                DB::connection('mysql_master')->table('personal_access_tokens')
                    ->where('token', $tokenHash)
                    ->where('name', 'LIKE', 'pms_token|%')
                    ->delete();
            }
        } catch (\Throwable $e) {
            // Silent — token cleanup failure is non-critical
        }

        try {
            $this->auditService->log(
                module: 'auth',
                action: 'logout',
                description: "User {$user->name} logged out",
                user: $user,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Logout successful',
        ]);
    }

    /**
     * Handle first-time password change (no old password required).
     *
     * Used when a newly created user must set their password on first login.
     * Clears the must_change_password flag after successful update.
     *
     * @param  Request  $request  Input: new_password (required, min 6 chars).
     * @return JsonResponse JSON response confirming password change.
     */
    public function firstTimeChangePassword(Request $request)
    {
        try {
            $request->validate([
                'new_password' => [
                    'required',
                    'string',
                    'min:8',
                    'regex:/[A-Z]/',
                    'regex:/[a-z]/',
                    'regex:/[0-9]/',
                    'regex:/[@$!%*?&#]/',
                ],
            ]);

            $token = $request->bearerToken();
            if (! $token) {
                return response()->json(['success' => false, 'message' => 'Unauthorized.'], 401);
            }

            $hashedToken = hash('sha256', $token);

            $organization = $request->attributes->get('currentOrganization');
            $user = null;
            $dsn = null;
            $dbUsername = null;
            $dbPassword = null;

            if ($organization) {
                $dsn = sprintf(
                    'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                    $organization->database_host,
                    (int) $organization->database_port,
                    $organization->database_name
                );
                $dbUsername = $organization->database_username;
                $dbPassword = $organization->database_password ?? '';

                $pdo = new \PDO($dsn, $dbUsername, $dbPassword, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_OBJ,
                ]);

                // Try full token hash first (current format), then stripped prefix (old format)
                $candidateHashes = [$hashedToken];
                if (str_contains($token, '|')) {
                    $candidateHashes[] = hash('sha256', substr($token, strpos($token, '|') + 1));
                }
                $tokenRow = null;
                foreach ($candidateHashes as $ch) {
                    $stmt = $pdo->prepare('SELECT tokenable_id FROM `personal_access_tokens` WHERE token = ? LIMIT 1');
                    $stmt->execute([$ch]);
                    $tokenRow = $stmt->fetch();
                    if ($tokenRow) break;
                }

                if ($tokenRow) {
                    \Log::info('firstTimeChangePassword: token row found in tenant DB', ['tokenable_id' => $tokenRow->tokenable_id]);
                    config()->set('database.connections.first_time_tenant', [
                        'driver'   => 'mysql',
                        'host'     => $organization->database_host,
                        'port'     => $organization->database_port,
                        'database' => $organization->database_name,
                        'username' => $organization->database_username,
                        'password' => $organization->database_password ?? '',
                        'charset'  => 'utf8mb4',
                        'collation'=> 'utf8mb4_unicode_ci',
                    ]);
                    DB::purge('first_time_tenant');
                    DB::reconnect('first_time_tenant');

                    $user = User::on('first_time_tenant')->where('id', $tokenRow->tokenable_id)->first();
                }

                $pdo = null;
            } else {
                $pdo = new \PDO(
                    'mysql:host=' . config('database.connections.mysql.host')
                        . ';port=' . config('database.connections.mysql.port')
                        . ';dbname=' . config('database.connections.mysql.database')
                        . ';charset=utf8mb4',
                    config('database.connections.mysql.username'),
                    config('database.connections.mysql.password') ?? '',
                    [
                        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                        \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_OBJ,
                    ]
                );

                $candidateHashes = [$hashedToken];
                if (str_contains($token, '|')) {
                    $candidateHashes[] = hash('sha256', substr($token, strpos($token, '|') + 1));
                }
                $tokenRow = null;
                foreach ($candidateHashes as $ch) {
                    $stmt = $pdo->prepare('SELECT tokenable_id FROM `personal_access_tokens` WHERE token = ? LIMIT 1');
                    $stmt->execute([$ch]);
                    $tokenRow = $stmt->fetch();
                    if ($tokenRow) break;
                }

                if ($tokenRow) {
                    \Log::info('firstTimeChangePassword: token row found in default DB', ['tokenable_id' => $tokenRow->tokenable_id]);
                    $user = User::on('mysql')->where('id', $tokenRow->tokenable_id)->first();
                }

                $pdo = null;
            }

            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthorized.'], 401);
            }

            if (Hash::check($request->new_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password must be different from your temporary password.',
                ], 422);
            }

            $user->password = bcrypt($request->new_password);
            $user->must_change_password = false;
            $user->active = true;
            $user->status = 'Active';
            $user->password_changed_by = $user->id;
            $user->password_changed_at = now();
            $user->save();

            // Revoke the temporary token used for this request so user must re-login.
            // Do NOT issue a new token — force the user to log in again with their new password.
            try {
                $oldTokenRaw = $request->bearerToken() ?: '';
                $candidateHashes = [];
                if ($oldTokenRaw !== '') {
                    $candidateHashes[] = hash('sha256', $oldTokenRaw);
                    $tokenValue = str_contains($oldTokenRaw, '|') ? substr($oldTokenRaw, strpos($oldTokenRaw, '|') + 1) : $oldTokenRaw;
                    $candidateHashes[] = hash('sha256', $tokenValue);
                }

                if (! empty($candidateHashes)) {
                    if ($dsn) {
                        $revokePdo = new \PDO($dsn, $dbUsername, $dbPassword, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
                        $placeholders = rtrim(str_repeat('?,', count($candidateHashes)), ',');
                        $revokeStmt = $revokePdo->prepare("DELETE FROM `personal_access_tokens` WHERE token IN ($placeholders)");
                        $revokeStmt->execute($candidateHashes);
                        $revokePdo = null;
                    } else {
                        $pdo = new \PDO(
                            'mysql:host=' . config('database.connections.mysql.host')
                                . ';port=' . config('database.connections.mysql.port')
                                . ';dbname=' . config('database.connections.mysql.database')
                                . ';charset=utf8mb4',
                            config('database.connections.mysql.username'),
                            config('database.connections.mysql.password') ?? '',
                            [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]
                        );
                        $placeholders = rtrim(str_repeat('?,', count($candidateHashes)), ',');
                        $revokeStmt = $pdo->prepare("DELETE FROM `personal_access_tokens` WHERE token IN ($placeholders)");
                        $revokeStmt->execute($candidateHashes);
                        $pdo = null;
                    }
                }
            } catch (\Throwable $e) {
                \Log::warning('Failed to revoke token after first-time password change', ['error' => $e->getMessage()]);
            }

            try {
                $this->auditService->log(
                    module: 'auth',
                    action: 'password_changed',
                    description: "User {$user->name} changed password (first time)",
                    user: $user,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
            }

            $responseData = [
                'success' => true,
                'message' => 'Password changed successfully.',
            ];
            if ($organization) {
                $responseData['tenant_slug'] = $organization->slug;
            }

            return response()->json($responseData);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&#).',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Server Error',
            ], 500);
        }
    }

    /**
     * Get the authenticated user's full profile with task/project stats and login history.
     *
     * Returns all profile fields, document references, task statistics (assigned/completed/pending),
     * total projects created, account metadata, and last login information.
     *
     * @param  Request  $request  The incoming HTTP request with the authenticated user.
     * @return JsonResponse JSON response with full user profile, stats, and account info.
     */
    public function myProfile(Request $request)
    {
        $user = $request->user();

        if ($user->role === 'guest') {
            $taskStats = Task::whereHas('project', fn ($q) => $q->whereJsonContains('guest_ids', $user->id))
                ->selectRaw('COUNT(*) as total_assigned')
                ->selectRaw("COUNT(CASE WHEN status IN ('completed','done','approved') THEN 1 END) as completed")
                ->selectRaw("COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pending")
                ->first();
        } else {
            $taskStats = Task::where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
            })
                ->selectRaw('COUNT(*) as total_assigned')
                ->selectRaw("COUNT(CASE WHEN status IN ('completed','done','approved') THEN 1 END) as completed")
                ->selectRaw("COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pending")
                ->first();
        }

        $taskStats = $taskStats ?? (object) ['total_assigned' => 0, 'completed' => 0, 'pending' => 0];

        if ($user->role === 'guest') {
            $totalProjects = Project::whereJsonContains('guest_ids', $user->id)->count();
        } else {
            $totalProjects = Project::where('created_by', $user->id)->count();
        }

        $loginHistory = [];
        if ($user->last_login_at) {
            $loginHistory[] = [
                'login_at' => $user->last_login_at->toDateTimeString(),
                'ip_address' => null,
            ];
        }

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'avatar' => $user->avatar,
                'email' => $user->login_email,
                'role' => $user->role,
                'active' => $user->active,
                'contact_no' => $user->contact_no,
                'phone_number' => $user->phone_number,
                'company_name' => $user->company_name,
                'address' => $user->address,
                'department' => $user->department,
                'designation' => $user->designation,
                'employee_code' => $user->employee_code,
                'father_name' => $user->father_name,
                'id_card_number' => $user->id_card_number,
                'present_address' => $user->present_address,
                'permanent_address' => $user->permanent_address,
                'emergency_contact_name' => $user->emergency_contact_name,
                'emergency_contact_relation' => $user->emergency_contact_relation,
                'emergency_contact_phone' => $user->emergency_contact_phone,
                'personal_email' => $user->personal_email,
                'professional_email' => $user->professional_email,
                'recovery_email' => $user->recovery_email,
                'login_email' => $user->login_email,
                'notification_email' => $user->notification_email,
                'hired_for' => $user->hired_for,
                'job_started_date' => $user->job_started_date,
                'job_ended_date' => $user->job_ended_date,
                'applied_via' => $user->applied_via,
                'gross_salary' => $user->gross_salary,
                'bank_name' => $user->bank_name,
                'bank_account_number' => $user->bank_account_number,
                'bank_account_title' => $user->bank_account_title,
                'employment_contract' => $user->employment_contract,
                'offer_letter' => $user->offer_letter,
                'techxaro_regulations' => $user->techxaro_regulations,
                'other_document' => $user->other_document,
                'last_login_at' => $user->last_login_at?->toDateTimeString(),
                'created_at' => $user->created_at->toDateTimeString(),
                'updated_at' => $user->updated_at->toDateTimeString(),
                'must_change_password' => $user->must_change_password,
                'language' => $user->language ?? 'English',
                'timezone' => $user->timezone ?? 'UTC',
                'date_format' => $user->date_format ?? 'DD/MM/YYYY',
                'time_format' => $user->time_format ?? '12-hour',
                'working_hours' => $user->working_hours,
            ],
            'stats' => [
                'total_assigned_tasks' => (int) $taskStats->total_assigned,
                'completed_tasks' => (int) $taskStats->completed,
                'pending_tasks' => (int) $taskStats->pending,
                'total_projects' => $totalProjects,
            ],
            'login_history' => $loginHistory,
            'account' => [
                'account_age' => $user->created_at->diffForHumans(),
                'days_since_creation' => $user->created_at->diffInDays(now()),
                'status' => $user->status ?: ($user->active ? 'Active' : 'Inactive'),
                'last_login' => $user->last_login_at?->toDateTimeString() ?? 'Never logged in',
            ],
            'activity_max_id' => (int) UserChange::where('user_id', $user->id)->max('id'),
        ]);
    }

    public function myChanges(Request $request)
    {
        $user = $request->user();
        $changes = UserChange::with('modifiedBy:id,name')
            ->where('user_id', $user->id)
            ->latest()
            ->get();

        return response()->json(['success' => true, 'changes' => $changes]);
    }

    /**
     * Update the authenticated user's own profile.
     *
     * Supports updating personal info, contact details, employment info, and document uploads.
     * Empty strings are converted to null for proper nullable field handling.
     * Legacy fields (phone_number, present_address) are synced to their modern equivalents.
     *
     * @param  Request  $request  Input: various profile fields and optional file uploads.
     * @return JsonResponse JSON response with the updated user profile.
     */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        foreach ($request->input() as $key => $value) {
            if (is_string($value) && $value === '') {
                $request->merge([$key => null]);
            }
        }

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|email|max:255',
            'role' => ['sometimes', 'required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member', 'guest'])],
            'father_name' => 'nullable|string|max:255',
            'id_card_number' => 'nullable|string|max:32',
            'phone_number' => 'nullable|string|max:32',
            'contact_no' => 'nullable|string|max:32',
            'present_address' => 'nullable|string|max:500',
            'permanent_address' => 'nullable|string|max:500',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_relation' => 'nullable|string|max:255',
            'emergency_contact_phone' => 'nullable|string|max:32',
            'personal_email' => 'nullable|email|max:255',
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'nullable|string|max:255',
            'designation' => 'nullable|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'nullable|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date',
            'gross_salary' => 'nullable|string|max:1000',
            'applied_via' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:64',
            'bank_account_title' => 'nullable|string|max:255',
            'employment_contract' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:10240',
            'offer_letter' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:10240',
            'techxaro_regulations' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:10240',
            'other_document' => 'nullable|array',
            'other_document.*' => 'file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:10240',
            'other_document_names' => 'nullable|array',
            'other_document_names.*' => 'nullable|string|max:255',
            'avatar' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);

        $fields = [
            'name', 'email', 'role',
            'father_name', 'id_card_number',
            'phone_number', 'present_address', 'permanent_address',
            'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
            'personal_email', 'professional_email', 'recovery_email',
            'department', 'designation', 'hired_for', 'employee_code',
            'job_started_date', 'job_ended_date',
            'gross_salary', 'applied_via',
            'bank_name', 'bank_account_number', 'bank_account_title',
        ];

        $oldValues = [];
        $oldPasswordValue = null;
        foreach ($fields as $field) {
            if ($request->has($field)) {
                $oldValues[$field] = $user->$field;
            }
        }

        if ($request->has('professional_email_password') && $request->input('professional_email_password')) {
            $oldPasswordValue = $user->professional_email_password;
        }

        foreach ($fields as $field) {
            if ($request->has($field)) {
                $user->$field = $request->input($field);
            }
        }

        if ($request->has('professional_email_password') && $request->input('professional_email_password')) {
            $user->professional_email_password = $request->input('professional_email_password');
        }

        if ($request->has('phone_number')) {
            $user->contact_no = $request->input('phone_number');
        }
        if ($request->has('present_address')) {
            $user->address = $request->input('present_address');
        }

        if ($user->role === 'teamlead') {
            $user->role = 'team_lead';
        }

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $oldAvatar = $user->avatar;
            $file = $request->file('avatar');
            if ($file->isValid()) {
                $org = $request->attributes->get('currentOrganization');
                $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
                $diskInstance = Storage::disk($disk);

                if ($oldAvatar) {
                    $cleanPath = ltrim($oldAvatar, '/');
                    if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                    try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
                }

                $category = 'avatars/' . $user->id;
                if ($org) {
                    $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
                    $avatarPath = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
                } else {
                    if (!$diskInstance->exists($category)) {
                        $diskInstance->makeDirectory($category);
                    }
                    $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
                    $avatarPath = $file->storeAs($category, $filename, 'public');
                }

                if ($avatarPath) {
                    $user->avatar = $avatarPath;
                } else {
                    \Log::error('Auth profile avatar upload failed', [
                        'user_id' => $user->id,
                    ]);
                }
            }
        }

        $user->save();

        if (! empty($oldValues)) {
            $changeRecords = [];
            foreach ($oldValues as $field => $oldVal) {
                $newVal = $user->$field;
                $oldStr = $oldVal === null ? '' : (string) $oldVal;
                $newStr = $newVal === null ? '' : (string) $newVal;
                if ($oldStr !== $newStr) {
                    $changeRecords[] = [
                        'user_id' => $user->id,
                        'field_name' => $field,
                        'old_value' => $oldStr ?: null,
                        'new_value' => $newStr ?: null,
                        'modified_by' => $user->id,
                    ];
                }
            }
            if (! empty($changeRecords)) {
                UserChange::insert($changeRecords);
            }
        }

        if ($oldPasswordValue !== null) {
            $newPw = $request->input('professional_email_password') ?? '';
            if ((string) $oldPasswordValue !== (string) $newPw) {
                UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => 'professional_email_password',
                    'old_value' => '(hidden)',
                    'new_value' => '(updated)',
                    'modified_by' => $user->id,
                ]);
            }
        }

        $documentFields = [
            'employment_contract', 'offer_letter', 'techxaro_regulations',
            'other_document',
        ];

        // Resolve disk: S3 if org has it configured, else local public
        $org = $request->attributes->get('currentOrganization');
        if (!$org && $user->company_name) {
            try {
                $org = \App\Models\Master\Organization::on('mysql_master')->where('slug', $user->company_name)
                    ->orWhere('name', $user->company_name)->first();
            } catch (\Throwable $e) {}
        }
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = \Storage::disk($disk);
        $category = 'user_documents/' . $user->id;

        $hasFileUploads = false;
        foreach ($documentFields as $field) {
            if ($field === 'other_document' && $request->hasFile('other_document')) {
                $files = $request->file('other_document');
                $names = $request->input('other_document_names', []);

                if (is_array($files)) {
                    $existingDocs = $this->parseOtherDocumentPaths($user->other_document);

                    $newDocs = [];
                    foreach ($files as $index => $file) {
                        if ($file->isValid()) {
                            if ($org) {
                                $filename = $field . '_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                                $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
                            } else {
                                $filename = $field . '_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                                $path = $file->storeAs($category, $filename, 'public');
                            }

                            if ($path) {
                                $customName = isset($names[$index]) ? $names[$index] : $file->getClientOriginalName();
                                $customName = preg_replace('/\.[^.]+$/', '', $customName);
                                $newDocs[] = ['path' => $path, 'name' => $customName];
                            } else {
                                \Log::error('Auth profile other_document upload failed', [
                                    'user_id' => $user->id,
                                ]);
                            }
                        }
                    }

                    $allDocs = array_merge($existingDocs, $newDocs);
                    $user->other_document = !empty($allDocs) ? json_encode($allDocs) : null;
                    $hasFileUploads = true;

                    UserChange::create([
                        'user_id' => $user->id,
                        'field_name' => $field,
                        'old_value' => count($existingDocs) . ' file(s)',
                        'new_value' => count($allDocs) . ' file(s) uploaded',
                        'modified_by' => $user->id,
                    ]);
                }
            } elseif ($request->hasFile($field)) {
                $file = $request->file($field);
                if (!$file->isValid()) {
                    \Log::warning('Auth profile document upload invalid', [
                        'user_id' => $user->id,
                        'field' => $field,
                        'error' => $file->getError(),
                    ]);
                    continue;
                }

                // Delete old file if exists
                if ($user->$field) {
                    $oldPath = ltrim($user->$field, '/');
                    if (str_starts_with($oldPath, 'storage/')) {
                        $oldPath = substr($oldPath, 8);
                    }
                    try {
                        if ($diskInstance->exists($oldPath)) {
                            $diskInstance->delete($oldPath);
                        }
                    } catch (\Exception $e) {
                        \Log::warning('Could not delete old profile document', ['path' => $user->$field, 'error' => $e->getMessage()]);
                    }
                }

                // Store file using StorageDiskResolver (S3 or local)
                if ($org) {
                    $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                    $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
                } else {
                    $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                    $path = $file->storeAs($category, $filename, 'public');
                }

                if ($path) {
                    $user->$field = $path;
                    $hasFileUploads = true;

                    UserChange::create([
                        'user_id' => $user->id,
                        'field_name' => $field,
                        'old_value' => null,
                        'new_value' => $file->getClientOriginalName(),
                        'modified_by' => $user->id,
                    ]);
                } else {
                    \Log::error('Auth profile document upload failed', [
                        'user_id' => $user->id,
                        'field' => $field,
                    ]);
                }
            }
        }

        if ($hasFileUploads) {
            $user->save();
        }

        try {
            $changedFields = array_keys($oldValues);
            $this->auditService->log(
                module: 'auth',
                action: 'profile_updated',
                description: "User {$user->name} updated their profile",
                user: $user,
                entityType: 'User',
                entityId: $user->id,
                oldValues: !empty($oldValues) ? $oldValues : null,
                newValues: collect($changedFields)->mapWithKeys(fn($f) => [$f => $user->$f])->toArray(),
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        Cache::forget("user_profile_{$user->id}");
        Cache::forget('all_users_list');

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully',
            'user' => $user,
        ]);
    }

    /**
     * Change the authenticated user's password after verifying the current password.
     *
     * Revokes all other tokens on password change for security.
     *
     * @param  Request  $request  Input: old_password (required), new_password (required, min 6 chars).
     * @return JsonResponse JSON response confirming password change.
     */
    public function changePassword(Request $request)
    {
        try {
            $request->validate([
                'old_password' => 'required',
                'new_password' => [
                    'required',
                    'string',
                    'min:8',
                    'regex:/[A-Z]/',
                    'regex:/[a-z]/',
                    'regex:/[0-9]/',
                    'regex:/[@$!%*?&#]/',
                ],
            ]);

            $user = $request->user();
            $errors = [];

            if (! Hash::check($request->old_password, $user->password)) {
                $errors['old_password'] = 'Current password is incorrect.';
            }

            $confirmPw = $request->input('confirm_password') ?? $request->input('password_confirmation');
            if ($confirmPw !== null && $request->input('new_password') !== $confirmPw) {
                $errors['confirm_password'] = 'Password confirmation does not match';
            }

            if (! empty($errors)) {
                return response()->json([
                    'success' => false,
                    'message' => reset($errors),
                    'errors' => $errors,
                ], 422);
            }

            if (Hash::check($request->new_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password must be different from your current password.',
                ], 422);
            }

            $user->password = bcrypt($request->new_password);
            $user->password_changed_by = $user->id;
            $user->password_changed_at = now();
            $user->password_version = ($user->password_version ?? 1) + 1;
            $user->save();

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => 'password',
                'old_value' => '(hidden)',
                'new_value' => '(changed)',
                'modified_by' => $user->id,
            ]);

            // Revoke all other tokens on password change for security
            $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete();

            // Send confirmation email to notification email
            $notifEmail = $user->notification_email;
            if ($notifEmail) {
                try {
                    Mail::to($notifEmail)->queue(new PasswordChangedMail($user));
                } catch (\Throwable $e) {
                    \Log::error('Failed to send password changed email', ['user_id' => $user->id, 'error' => $e->getMessage()]);
                }
            }

            try {
                $this->auditService->log(
                    module: 'auth',
                    action: 'password_changed',
                    description: "User {$user->name} changed their password",
                    user: $user,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
            }

            // Log activity
            try {
                $this->activityService->log(
                    userId: $user->id,
                    activityType: 'profile',
                    description: 'Password changed successfully',
                    module: 'profile',
                    action: 'updated',
                    entityName: 'Password'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log password change activity', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Password changed successfully',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&#).',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Server Error',
            ], 500);
        }
    }

    /**
     * Parse other_document value which may be a JSON array of paths/objects or a single path.
     * Returns array of ['path' => ..., 'name' => ...] objects.
     */
    private function parseOtherDocumentPaths($value): array
    {
        if (empty($value)) {
            return [];
        }

        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            $result = [];
            foreach ($decoded as $item) {
                if (is_string($item)) {
                    $result[] = ['path' => $item, 'name' => null];
                } elseif (is_array($item) && isset($item['path'])) {
                    $result[] = $item;
                }
            }
            return $result;
        }

        // Legacy single file path
        return [['path' => $value, 'name' => null]];
    }

    /**
     * AUTH_025: Check if an email address belongs to a public personal email provider.
     */
    private function isPersonalEmail(string $email): bool
    {
        $parts = explode('@', strtolower(trim($email)));
        if (count($parts) < 2) {
            return false;
        }
        $domain = end($parts);

        $personalDomains = [
            'gmail.com', 'googlemail.com',
            'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
            'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'live.com', 'live.co.uk', 'msn.com',
            'outlook.com', 'outlook.co.uk',
            'icloud.com', 'me.com', 'mac.com',
            'aol.com', 'aim.com',
            'protonmail.com', 'proton.me', 'pm.me',
            'zoho.com', 'zohomail.com',
            'yandex.com', 'yandex.ru',
            'mail.com', 'email.com',
            'gmx.com', 'gmx.net',
            'rediffmail.com', 'inbox.com', 'fastmail.com', 'hushmail.com'
        ];

        if (in_array($domain, $personalDomains, true)) {
            return true;
        }

        // Regex check for common personal domain patterns (e.g. yahoo.*, hotmail.*, gmx.*)
        if (preg_match('/^(gmail|yahoo|hotmail|outlook|live|icloud|aol|protonmail|proton|yandex|mail|gmx|rediffmail)\./i', $domain)) {
            return true;
        }

        return false;
    }

    /**
     * Search for a user across all tenant databases.
     * Returns ['user' => User, 'slug' => string, 'organization' => Organization] or null.
     */
    private function findUserAcrossTenants(string $email, ?string $skipDbName = null, ?string $plainPassword = null): ?array
    {
        $orgs = MasterOrganization::where('status', '!=', 'deleted')
            ->whereNotIn('status', ['suspended', 'archived'])
            ->get();

        foreach ($orgs as $org) {
            try {
                $dbName = $org->database_name;

                if ($skipDbName && $dbName === $skipDbName) {
                    continue;
                }

                $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
                $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
                $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
                $pdo = new \PDO($dsn, $username, $dbPassword, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_TIMEOUT => 2,
                ]);

                $stmt = $pdo->prepare(
                    "SELECT id, password FROM `users` WHERE professional_email = ? OR email = ? OR personal_email = ? LIMIT 1"
                );
                $stmt->execute([$email, $email, $email]);
                $foundUserRow = $stmt->fetch(\PDO::FETCH_OBJ);

                if (! $foundUserRow) {
                    $pdo = null;
                    continue;
                }

                if ($plainPassword !== null && !\Hash::check($plainPassword, $foundUserRow->password)) {
                    $pdo = null;
                    continue;
                }

                $pdo = null;

                config()->set('database.connections.mysql.host', $host);
                config()->set('database.connections.mysql.port', $port);
                config()->set('database.connections.mysql.database', $dbName);
                config()->set('database.connections.mysql.username', $username);
                config()->set('database.connections.mysql.password', $dbPassword);
                DB::purge('mysql');
                DB::reconnect('mysql');

                $user = \App\Models\User::on('mysql')
                    ->where('professional_email', $email)
                    ->orWhere('email', $email)
                    ->orWhere('personal_email', $email)
                    ->first();

                if ($user) {
                    return ['user' => $user, 'slug' => $org->slug, 'organization' => $org];
                }
            } catch (\Throwable $e) {
                \Log::warning("Tenant search failed for {$org->slug}: " . $e->getMessage());
                continue;
            }
        }

        return null;
    }

    /**
     * Check if a user email exists in a soft-deleted organization's database.
     * Returns true if the org existed but was deleted (DB dropped).
     */
    private function findUserInDeletedOrgs(string $email): bool
    {
        // First: check admin_email stored on org record (fast, no DB connection needed)
        $deletedOrgByEmail = MasterOrganization::withTrashed()
            ->where('admin_email', $email)
            ->where('deleted_at', '!=', null)
            ->first();

        if ($deletedOrgByEmail) {
            return true;
        }

        // Fallback: try connecting to deleted orgs' databases (in case they still exist)
        $deletedOrgs = MasterOrganization::withTrashed()
            ->where('deleted_at', '!=', null)
            ->get();

        foreach ($deletedOrgs as $org) {
            try {
                $dbName = $org->database_name;
                $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
                $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
                $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
                $pdo = new \PDO($dsn, $username, $dbPassword, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_TIMEOUT => 1,
                ]);

                $stmt = $pdo->prepare(
                    "SELECT id FROM `users` WHERE professional_email = ? OR email = ? OR personal_email = ? LIMIT 1"
                );
                $stmt->execute([$email, $email, $email]);
                $found = $stmt->fetch(\PDO::FETCH_OBJ);
                $pdo = null;

                if ($found) {
                    return true;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return false;
    }
}
