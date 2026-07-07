<?php

namespace App\Http\Controllers;

use App\Mail\PasswordChangedMail;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\UserChange;
use App\Services\ActivityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
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
        private ActivityService $activityService
    ) {}

    /**
     * Authenticate a user and return a Sanctum API token.
     *
     * Validates credentials, checks account active status, generates a token,
     * tracks last login time, and normalizes the role format.
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

            // Look up user by professional_email (not personal email)
            $user = User::where('professional_email', $request->email)->first();

            if (! $user || ! Hash::check($request->password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid Email or Password',
                ], 401);
            }

            // logged in user

            if ($user->active === false && ! $user->must_change_password) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your account has been resigned. You no longer have access to the system. Please contact your administrator.',
                ], 403);
            }

            // New users (inactive + must_change_password) login allowed

            // generate token
            $token = $user->createToken('auth_token')->plainTextToken;

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
        $request->user()->currentAccessToken()->delete();

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
            $user->save();

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

        $taskStats = Task::where(function ($q) use ($user) {
            $q->where('assigned_to', $user->id)
                ->orWhereHas('assignees', fn ($aq) => $aq->where('users.id', $user->id));
        })
            ->selectRaw('COUNT(*) as total_assigned')
            ->selectRaw("COUNT(CASE WHEN status IN ('completed','done','approved') THEN 1 END) as completed")
            ->selectRaw("COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pending")
            ->first();

        $taskStats = $taskStats ?? (object) ['total_assigned' => 0, 'completed' => 0, 'pending' => 0];

        $totalProjects = Project::where('created_by', $user->id)->count();

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
            'role' => ['sometimes', 'required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
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
            'other_document' => 'nullable|file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:10240',
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
                if ($oldAvatar && Storage::disk('public')->exists($oldAvatar)) {
                    Storage::disk('public')->delete($oldAvatar);
                }
                $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
                $user->avatar = $file->storeAs('avatars/' . $user->id, $filename, 'public');
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

        $hasFileUploads = false;
        foreach ($documentFields as $field) {
            if ($request->hasFile($field)) {
                if ($user->$field && \Storage::disk('public')->exists($user->$field)) {
                    \Storage::disk('public')->delete($user->$field);
                }
                $file = $request->file($field);
                $filename = $field.'_'.time().'_'.$file->getClientOriginalName();
                $path = $file->storeAs('user_documents/'.$user->id, $filename, 'public');
                $user->$field = $path;
                $hasFileUploads = true;

                UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => $field,
                    'old_value' => null,
                    'new_value' => $file->getClientOriginalName(),
                    'modified_by' => $user->id,
                ]);
            }
        }

        if ($hasFileUploads) {
            $user->save();
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

            if (! Hash::check($request->old_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }

            if (Hash::check($request->new_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password must be different from your current password.',
                ], 422);
            }

            $user->password = bcrypt($request->new_password);
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
                    Mail::to($user->professional_email)->send(new PasswordChangedMail($user));
                } catch (\Throwable $e) {
                    \Log::error('Failed to send password changed email', ['user_id' => $user->id, 'error' => $e->getMessage()]);
                }
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
}
