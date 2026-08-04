<?php

namespace App\Http\Controllers;

use App\Mail\PasswordChangedMail;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\UserChange;
use App\Services\ActivityService;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
            $user = User::where('professional_email', $request->email)
                ->orWhere('email', $request->email)
                ->orWhere('personal_email', $request->email)
                ->first();

            if (! $user || ! Hash::check($request->password, $user->password)) {
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

                return response()->json([
                    'success' => false,
                    'message' => 'Invalid Email or Password',
                ], 401);
            }

            // Successful login — reset rate limiter counter to 0
            RateLimiter::clear($throttleKey);

            // logged in user

            if ($user->active === false && ! $user->must_change_password) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your account has been resigned. You no longer have access to the system. Please contact your administrator.',
                ], 403);
            }

            // New users (inactive + must_change_password) login allowed

            // Handle remember_me flag (24 hours / 1 day if true, 3 hours default if false)
            $rememberMe = $request->boolean('remember_me');
            $expiresAt = $rememberMe ? now()->addDays(1) : now()->addHours(3);

            // generate Sanctum token with explicit expiration
            $tokenResult = $user->createToken('auth_token', ['*'], $expiresAt);
            $token = $tokenResult->plainTextToken;

            // Track last login
            $user->update(['last_login_at' => now()]);

            // Normalize role (teamlead → team_lead)
            $role = $user->role === 'teamlead' ? 'team_lead' : $user->role;

            return response()->json([
                'success' => true,
                'message' => 'Login successful',
                'token' => $token,
                'role' => $role,
                'must_change_password' => $user->must_change_password,
                'remember_me' => $rememberMe,
                'expires_at' => $expiresAt->toISOString(),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'avatar' => $user->avatar,
                    'email' => $user->professional_email,
                    'role' => $role,
                    'active' => $user->active,
                    'must_change_password' => $user->must_change_password,
                ],
            ]);
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

            $user = $request->user();

            if (Hash::check($request->new_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password must be different from your temporary password.',
                ], 422);
            }

            $user->password = bcrypt($request->new_password);
            $user->must_change_password = false;
            $user->active = true;
            $user->password_changed_by = $user->id;
            $user->password_changed_at = now();
            $user->save();

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

            return response()->json([
                'success' => true,
                'message' => 'Password changed successfully. Please login with your new password.',
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
                'email' => $user->email,
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
                'status' => ! $user->active ? 'Resigned' : ($user->must_change_password ? 'Inactive' : 'Active'),
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
            'gross_salary' => 'nullable|string|max:255',
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
                $disk = Storage::disk('public');
                if ($oldAvatar && $disk->exists($oldAvatar)) {
                    $disk->delete($oldAvatar);
                }
                if (!$disk->exists('avatars/' . $user->id)) {
                    $disk->makeDirectory('avatars/' . $user->id);
                }
                $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
                $avatarPath = $file->storeAs('avatars/' . $user->id, $filename, 'public');
                if ($avatarPath && $disk->exists($avatarPath)) {
                    $user->avatar = $avatarPath;
                } else {
                    \Log::error('Auth profile avatar upload failed', [
                        'user_id' => $user->id,
                        'returned_path' => $avatarPath,
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

        $disk = \Storage::disk('public');
        if (!$disk->exists('user_documents/' . $user->id)) {
            $disk->makeDirectory('user_documents/' . $user->id);
        }

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
                            $filename = $field . '_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                            $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

                            if ($path && $disk->exists($path)) {
                                $customName = isset($names[$index]) ? $names[$index] : $file->getClientOriginalName();
                                $customName = preg_replace('/\.[^.]+$/', '', $customName);
                                $newDocs[] = ['path' => $path, 'name' => $customName];
                            } else {
                                \Log::error('Auth profile other_document upload failed', [
                                    'user_id' => $user->id,
                                    'returned_path' => $path,
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

                if ($user->$field && $disk->exists($user->$field)) {
                    $disk->delete($user->$field);
                }

                $filename = $field.'_'.time().'_'.$file->getClientOriginalName();
                $path = $file->storeAs('user_documents/'.$user->id, $filename, 'public');

                if ($path && $disk->exists($path)) {
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
                    \Log::error('Auth profile document upload failed - file not on disk', [
                        'user_id' => $user->id,
                        'field' => $field,
                        'returned_path' => $path,
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

            // Send confirmation email to professional email
            if ($user->professional_email) {
                try {
                    Mail::to($user->professional_email)->queue(new PasswordChangedMail($user));
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
}
