<?php

/**
 * Controller for administration and user account management.
 */

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Task;
use App\Services\ActivityService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use App\Models\Project;
use App\Jobs\SendUserCreatedEmails;
use App\Mail\UserCreated;
use App\Mail\UserResigned;
use App\Mail\UserProfileUpdated;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * User management controller.
 * Handles listing, creating, updating, resigning, and deleting users.
 * Supports document uploads, profile viewing, and email notifications.
 * Enforces role-based access control (managers cannot modify admin/manager accounts).
 */
class UserController extends Controller
{
    public function __construct(
        private ActivityService $activityService,
        private NotificationService $notificationService
    ) {}

    private array $documentFields = [
        'employment_contract',
        'offer_letter',
        'techxaro_regulations',
        'other_document',
    ];

    /**
     * Return a list of all users with key profile fields.
     *
     * Ordered by sort_order then most recently updated first.
     *
     * @return \Illuminate\Http\JsonResponse  JSON response with the user list.
     */
    public function index()
    {
        $users = Cache::remember('all_users_list', 10, fn () =>
            User::select('id', 'name', 'avatar', 'email', 'role', 'active', 'department', 'designation', 'employee_code', 'contact_no', 'sort_order', 'must_change_password', 'personal_email', 'professional_email')
                ->orderBy('sort_order')->latest('updated_at')
                ->get()
                ->toArray()
        );

        return response()->json([
            'success' => true,
            'users' => $users,
        ]);
    }

    /**
     * Return a single user by ID.
     *
     * @param  \App\Models\User  $user  The user to retrieve.
     * @return \Illuminate\Http\JsonResponse  JSON response with the user.
     */
    public function show(User $user)
    {
        return response()->json([
            'success' => true,
            'user' => $user,
        ]);
    }

    /**
     * Create a new user account with an auto-generated password and optional document uploads.
     *
     * Sends a welcome email with login credentials. Managers cannot create admin/manager accounts.
     * The must_change_password flag is set to true for new users.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input: name, email, role, department, designation, employee_code, and optional profile/document fields.
     * @return \Illuminate\Http\JsonResponse  JSON response with the created user and email status.
     */
    public function store(Request $request)
    {
        $this->normalizeEmptyStrings($request);

        try {
            $request->validate([
                'name' => 'required|string|max:255',
                'email' => 'required|string|email|max:255|unique:users,email',
                'personal_email' => 'nullable|email|max:255',
                'professional_email' => 'nullable|string|max:255',
                'professional_email_password' => 'nullable|string|max:255',
                'role' => ['required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
                'father_name' => 'nullable|string|max:255',
                'id_card_number' => 'nullable|string|max:32',
                'phone_number' => 'nullable|string|max:32',
                'contact_no' => 'nullable|string|max:32',
                'present_address' => 'nullable|string|max:500',
                'permanent_address' => 'nullable|string|max:500',
                'address' => 'nullable|string|max:500',
                'emergency_contact_name' => 'nullable|string|max:255',
                'emergency_contact_relation' => 'nullable|string|max:255',
                'emergency_contact_phone' => 'nullable|string|max:32',
                'recovery_email' => 'nullable|email|max:255',
                'department' => 'required|string|max:255',
                'designation' => 'required|string|max:255',
                'hired_for' => 'nullable|string|max:255',
                'employee_code' => 'required|string|max:64',
                'job_started_date' => 'nullable|date',
                'job_ended_date' => 'nullable|date|after_or_equal:job_started_date',
                'gross_salary' => 'nullable|string|max:255',
                'applied_via' => 'nullable|string|max:255',
                'bank_name' => 'nullable|string|max:255',
                'bank_account_number' => 'nullable|string|max:64',
                'bank_account_title' => 'nullable|string|max:255',
                'employment_contract' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
                'offer_letter' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
                'techxaro_regulations' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
                'other_document' => 'nullable|array',
                'other_document.*' => 'file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:20480',
                'avatar' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('User create validation failed', ['errors' => $e->errors()]);
            throw $e;
        }

        $plainPassword = Str::random(10);
        $role = $request->input('role') === 'teamlead' ? 'team_lead' : $request->input('role');

        $authUser = $request->user();

        if ($authUser->role === 'manager' && in_array($role, ['admin', 'manager'])) {
            return response()->json([
                'success' => false,
                'message' => 'Managers cannot create administrators or other managers.',
            ], 403);
        }

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => Hash::make($plainPassword),
            'role' => $role,
            'active' => false,
            'must_change_password' => true,

            // Contact
            'contact_no' => $request->input('phone_number') ?? $request->input('contact_no'),
            'address' => $request->input('present_address') ?? $request->input('address'),

            // Extended profile
            'father_name' => $request->input('father_name'),
            'id_card_number' => $request->input('id_card_number'),
            'phone_number' => $request->input('phone_number'),
            'present_address' => $request->input('present_address'),
            'permanent_address' => $request->input('permanent_address'),

            // Emergency contact
            'emergency_contact_name' => $request->input('emergency_contact_name'),
            'emergency_contact_relation' => $request->input('emergency_contact_relation'),
            'emergency_contact_phone' => $request->input('emergency_contact_phone'),

            // Emails
            'personal_email' => $request->input('personal_email'),
            'professional_email' => $request->input('professional_email'),
            'professional_email_password' => $request->input('professional_email_password') ?: null,
            'recovery_email' => $request->input('recovery_email'),

            // Employment
            'department' => $request->input('department'),
            'designation' => $request->input('designation'),
            'hired_for' => $request->input('hired_for'),
            'employee_code' => $request->input('employee_code'),
            'job_started_date' => $request->input('job_started_date'),
            'job_ended_date' => $request->input('job_ended_date'),

            // Salary & bank
            'gross_salary' => $request->input('gross_salary'),
            'applied_via' => $request->input('applied_via'),
            'bank_name' => $request->input('bank_name'),
            'bank_account_number' => $request->input('bank_account_number'),
            'bank_account_title' => $request->input('bank_account_title'),
        ]);

        // Handle file uploads
        $this->handleFileUploads($request, $user);

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $user->avatar = $this->handleAvatarUpload($request, $user);
            $user->save();
        }

        // Collect uploaded file paths for email attachments
        $emailAttachments = [];
        foreach ($this->documentFields as $field) {
            if ($field === 'other_document') {
                // other_document may contain multiple files as JSON
                $paths = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($paths as $path) {
                    if (Storage::disk('public')->exists($path)) {
                        $fullPath = Storage::disk('public')->path($path);
                        $emailAttachments[$fullPath] = 'other_document';
                    }
                }
            } elseif ($user->$field && Storage::disk('public')->exists($user->$field)) {
                $fullPath = Storage::disk('public')->path($user->$field);
                $emailAttachments[$fullPath] = $field;
            }
        }

        Cache::forget('all_users_list');
        Cache::forget('admin_manager_ids');

        $this->activityService->log(
            $authUser->id,
            'user_created',
            "You created user {$user->name}",
            'user',
            $user->id,
            'created',
            $user->name,
            $user->id,
        );
        $this->clearDashboardCache($authUser->id);

        $loginUrl = config('app.frontend_url');

        $emailSent = false;
        $emailError = null;

        $profEmail = $request->input('professional_email') ?: $user->professional_email;
        $profPassword = $request->input('professional_email_password') ?: '';
        $personalEmail = $request->input('personal_email');
        $adderEmail = $authUser->professional_email;

        $message = $personalEmail
            ? 'User created successfully. Welcome email will be sent to ' . $personalEmail
            : 'User created successfully.';

        // Dispatch emails to queue — user creation is instant
        SendUserCreatedEmails::dispatch(
            $user, $plainPassword, $profEmail, $profPassword, $loginUrl, $emailAttachments,
            $personalEmail, $adderEmail, $authUser->name
        );

        return response()->json([
            'success' => true,
            'message' => $message,
            'user' => $user,
            'email_sent' => false,
        ], 201);
    }

    /**
     * Update a user's profile details, role, and document uploads.
     *
     * Enforces role-based restrictions: managers cannot modify admin/manager accounts,
     * and users cannot modify their own account via this endpoint.
     * Sends a profile update email notification when changes are detected.
     *
     * @param  \Illuminate\Http\Request  $request  Validated input for updatable fields.
     * @param  \App\Models\User  $user  The user to update.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated user.
     */
    public function update(Request $request, User $user)
    {
        $this->normalizeEmptyStrings($request);

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['sometimes', 'required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
            'active' => ['sometimes', 'boolean'],
            'father_name' => 'nullable|string|max:255',
            'id_card_number' => 'nullable|string|max:32',
            'phone_number' => 'nullable|string|max:32',
            'contact_no' => 'nullable|string|max:32',
            'present_address' => 'nullable|string|max:500',
            'permanent_address' => 'nullable|string|max:500',
            'address' => 'nullable|string|max:500',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_relation' => 'nullable|string|max:255',
            'emergency_contact_phone' => 'nullable|string|max:32',
            'personal_email' => 'nullable|email|max:255',
            'professional_email' => 'nullable|string|max:255',
            'professional_email_password' => 'nullable|string|max:255',
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'sometimes|required|string|max:255',
            'designation' => 'sometimes|required|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'sometimes|required|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date',
            'gross_salary' => 'nullable|string|max:255',
            'applied_via' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:64',
            'bank_account_title' => 'nullable|string|max:255',
            'employment_contract' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
            'offer_letter' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
            'techxaro_regulations' => 'nullable|file|mimes:pdf,jpeg,png,webp|max:20480',
            'other_document' => 'nullable|array',
            'other_document.*' => 'file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:20480',
            'avatar' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);

        $authUser = $request->user();

        if ($authUser->id === $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot modify your own account.',
            ], 403);
        }

        if ($user->active === false && !$user->must_change_password) {
            return response()->json([
                'success' => false,
                'message' => 'Resigned users cannot be modified.',
            ], 403);
        }

        if ($authUser->role === 'manager' && in_array($user->role, ['admin', 'manager'])) {
            return response()->json([
                'success' => false,
                'message' => 'Managers cannot modify administrators or other managers.',
            ], 403);
        }

        if ($authUser->role === 'manager' && $request->has('role') && in_array($request->input('role'), ['admin', 'manager'])) {
            return response()->json([
                'success' => false,
                'message' => 'Managers cannot assign admin or manager roles.',
            ], 403);
        }

        $fields = [
            'name', 'email', 'role', 'active',
            'father_name', 'id_card_number', 'phone_number',
            'present_address', 'permanent_address',
            'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
            'personal_email', 'professional_email',
            'recovery_email',
            'department', 'designation', 'hired_for', 'employee_code',
            'job_started_date', 'job_ended_date',
            'gross_salary', 'applied_via',
            'bank_name', 'bank_account_number', 'bank_account_title',
        ];

        $oldValues = [];
        $oldDateStrings = [];
        $dateFields = ['job_started_date', 'job_ended_date'];
        foreach ($fields as $field) {
            if ($request->exists($field)) {
                $oldValues[$field] = $user->$field;
                if (in_array($field, $dateFields)) {
                    $raw = $user->getRawOriginal($field);
                    $oldDateStrings[$field] = $raw ? substr($raw, 0, 10) : '';
                }
            }
        }

        // Capture old password for change tracking
        $oldPasswordValues = [];
        if ($request->exists('professional_email_password') && $request->input('professional_email_password')) {
            $oldPasswordValues['professional_email_password'] = $user->professional_email_password;
        }

        foreach ($fields as $field) {
            if ($request->exists($field)) {
                $user->$field = $request->input($field);
            }
        }

        // Hash professional email password if provided
        if ($request->exists('professional_email_password') && $request->input('professional_email_password')) {
            $user->professional_email_password = $request->input('professional_email_password');
        }

        // Sync legacy fields
        if ($request->exists('phone_number')) {
            $user->contact_no = $request->input('phone_number');
        }
        if ($request->exists('present_address')) {
            $user->address = $request->input('present_address');
        }

        // Normalize role
        if ($user->role === 'teamlead') {
            $user->role = 'team_lead';
        }

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $user->avatar = $this->handleAvatarUpload($request, $user);
        }

        $user->save();

        $changes = [];

        // Track professional_email_password change separately
        if (array_key_exists('professional_email_password', $oldPasswordValues)) {
            $oldPw = $oldPasswordValues['professional_email_password'] ?? '';
            $newPw = $request->input('professional_email_password') ?? '';
            if ((string) $oldPw !== (string) $newPw) {
                $changes['professional_email_password'] = ['old' => '(hidden)', 'new' => $newPw];
            }
        }

        foreach ($oldValues as $field => $oldVal) {
            $dateFieldsList = ['job_started_date', 'job_ended_date'];
            if (in_array($field, $dateFieldsList)) {
                // Compare request input date against old DB date-only to avoid timezone shifts
                $oldStr = $oldDateStrings[$field] ?? '';
                $newStr = $request->exists($field) ? substr((string) $request->input($field), 0, 10) : '';
            } else {
                $newVal = $user->$field;
                $oldStr = $oldVal === null ? '' : (string) $oldVal;
                $newStr = $newVal === null ? '' : (string) $newVal;
            }

            if ($oldStr !== $newStr) {
                $changes[$field] = ['old' => $oldStr, 'new' => $newStr];
            }
        }

        if (!empty($changes)) {
            $changeRecords = [];
            foreach ($changes as $field => $vals) {
                $changeRecords[] = [
                    'user_id' => $user->id,
                    'field_name' => $field,
                    'old_value' => $vals['old'] ?: null,
                    'new_value' => $vals['new'] ?: null,
                    'modified_by' => $authUser->id,
                ];
            }
            \App\Models\UserChange::insert($changeRecords);
        }

        $emailSent = null;
        $emailError = null;
        if (!empty($changes)) {
            try {
                Mail::to($user->professional_email)->send(new UserProfileUpdated($user, $authUser->name, $changes, $authUser->professional_email, $authUser->name));
                $emailSent = true;
            } catch (\Exception $e) {
                $emailError = $e->getMessage();
                \Illuminate\Support\Facades\Log::error('Failed to send profile update email: ' . $e->getMessage());
                $emailSent = false;
            }

            $this->notificationService->notify(
                $user->id,
                $authUser->id,
                'user_updated',
                'user',
                $user->id,
                'Profile Updated',
                'Your information has been changed. Please check your email for further information.',
                '/manage-users/user-profile/' . $user->id
            );

            $this->notificationService->confirmAction(
                $authUser,
                'user_updated',
                'user',
                $user->name,
                ['message' => "You updated the profile of {$user->name}."]
            );
        }

        // Handle file uploads
        $this->handleFileUploads($request, $user);

        Cache::forget('all_users_list');
        Cache::forget("user_profile_{$user->id}");
        if (in_array($user->role, ['admin', 'manager']) || isset($oldValues['role'])) {
            Cache::forget('admin_manager_ids');
        }

        if (!empty($changes)) {
            $this->activityService->log(
                $authUser->id,
                'user_updated',
                "You updated user {$user->name}",
                'user',
                $user->id,
                'updated',
                $user->name,
                $user->id,
                ['changes' => $changes]
            );
        }

        $message = 'User updated successfully';
        if ($emailSent === true) {
            $message .= '. Notification email sent to ' . $user->email;
        } elseif ($emailSent === false) {
            $message .= '. Failed to send notification email: ' . $emailError;
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'user' => $user,
        ]);
    }

    /**
     * Reorder users by updating their sort_order values in bulk.
     *
     * @param  \Illuminate\Http\Request  $request  Input: items[] with id and sort_order.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming reorder.
     */
    public function reorder(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|integer|exists:users,id',
            'items.*.sort_order' => 'required|integer|min:0',
        ]);

        $ids = []; $bindings = [];
        foreach ($request->items as $item) { $ids[] = (int) $item['id']; $bindings[] = (int) $item['id']; $bindings[] = (int) $item['sort_order']; }
        if (!empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            DB::statement("UPDATE users SET sort_order = CASE id " . implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?')) . " END WHERE id IN ($ph)", [...$bindings, ...$ids]);
        }
        Cache::forget('all_users_list');
        return response()->json(['success' => true, 'message' => 'Users reordered successfully']);
    }

    /**
     * Delete a user from the system along with all associated files.
     *
     * Users cannot delete their own account. Managers cannot delete admin/manager accounts.
     *
     * @param  \App\Models\User  $user  The user to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response confirming deletion.
     */
    public function destroy(User $user)
    {
        $authUser = request()->user();

        if ($authUser->id === $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($authUser->role === 'manager' && in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Delete associated files
        $this->deleteAllFiles($user);

        $user->delete();

        Cache::forget('all_users_list');
        Cache::forget('admin_manager_ids');

        return response()->json([
            'success' => true,
            'message' => 'User deleted successfully',
        ]);
    }

    /**
     * Resign a user by setting their active status to false.
     *
     * Revokes all API tokens and sends a resignation notification email.
     * Managers cannot resign admin/manager accounts. Users cannot resign themselves.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\User  $user  The user to resign.
     * @return \Illuminate\Http\JsonResponse  JSON response with resignation status and email status.
     */
    public function resign(Request $request, User $user)
    {
        try {
            $authUser = $request->user();

            if ($authUser->id === $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'You cannot resign yourself.',
                ], 403);
            }

            if ($user->active === false) {
                return response()->json([
                    'success' => false,
                    'message' => 'This user is already resigned.',
                ], 422);
            }

            if ($authUser->role === 'manager' && in_array($user->role, ['admin', 'manager'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Managers cannot resign administrators or other managers.',
                ], 403);
            }

            $user->active = false;
            $user->must_change_password = false;
            $user->save();

            Cache::forget('all_users_list');
            if (in_array($user->role, ['admin', 'manager'])) {
                Cache::forget('admin_manager_ids');
            }

            Log::info("User {$user->id} ({$user->email}) resigned by {$authUser->id} ({$authUser->email})");

            $this->activityService->log(
                $authUser->id,
                'user_resigned',
                "You resigned user {$user->name}",
                'user',
                $user->id,
                'resigned',
                $user->name,
                $user->id,
            );

            $emailSent = false;
            $emailError = null;

            try {
                Mail::to($user->professional_email)->send(new UserResigned($user, $authUser->name, $authUser->professional_email, $authUser->name));
                $emailSent = true;
                Log::info("Resignation email sent to {$user->professional_email}");
            } catch (\Throwable $e) {
                $emailError = $e->getMessage();
                Log::error("Failed to send resignation email to {$user->email}: " . $e->getMessage(), [
                    'user_id' => $user->id,
                    'exception' => $e->getMessage(),
                ]);
            }

            $message = 'User resigned successfully.';
            if (!$emailSent) {
                $message .= ' Email notification failed: ' . $emailError;
            }

            $this->notificationService->confirmAction($authUser, 'Resigned', 'user', $user->name, [
                'User Email' => $user->professional_email ?? $user->email,
                'Role' => ucfirst($user->role),
            ]);

            return response()->json([
                'success' => true,
                'message' => $message,
                'user' => $user,
                'email_sent' => $emailSent,
            ]);

        } catch (\Throwable $e) {
            Log::error("Resignation failed for user {$user->id}: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to resign user. Please try again.',
            ], 500);
        }
    }

    /**
     * Return a simplified list of active users for team assignment dropdowns.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \Illuminate\Http\JsonResponse  JSON response with active user list (id, name, email, role).
     */
    public function getTeamUsers(Request $request)
    {
        $users = User::select('id', 'name', 'email', 'role')
            ->where('active', true)
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'users' => $users]);
    }

    /**
     * Get a user's full profile with task/project statistics, login history, and account metadata.
     *
     * @param  int  $id  The ID of the user to get the profile for.
     * @return \Illuminate\Http\JsonResponse  JSON response with user profile, stats, projects, and account info.
     */
    public function profile($id)
    {
        $cacheKey = "user_profile_{$id}";
        $data = Cache::remember($cacheKey, 300, function () use ($id) {
            $user = User::findOrFail($id);

            $taskStats = Task::where('assigned_to', $user->id)
                ->selectRaw('COUNT(*) as total_assigned')
                ->selectRaw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed")
                ->selectRaw("COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pending")
                ->first();

            $totalProjects = Project::where('created_by', $user->id)->count();

            $projects = Project::where('created_by', $user->id)
                ->withCount(['tasks as total_tasks' => function ($query) use ($user) {
                    $query->where('assigned_to', $user->id);
                }, 'tasks as completed_tasks' => function ($query) use ($user) {
                    $query->where('assigned_to', $user->id)->where('status', 'completed');
                }])
                ->get()
                ->map(function ($project) {
                    return [
                        'id' => $project->id,
                        'name' => $project->title,
                        'status' => $project->status ?? 'active',
                        'total_tasks' => (int) $project->total_tasks,
                        'completed_tasks' => (int) $project->completed_tasks,
                        'pending_tasks' => (int) $project->total_tasks - (int) $project->completed_tasks,
                    ];
                });

            $loginHistory = [];
            if ($user->last_login_at) {
                $loginHistory[] = [
                    'login_at' => $user->last_login_at->toDateTimeString(),
                    'ip_address' => null,
                ];
            }

            $accountAge = $user->created_at->diffForHumans();
            $daysSinceCreation = $user->created_at->diffInDays(now());

            return [
                'user' => $user->only([
                    'id', 'name', 'avatar', 'email', 'role', 'active',
                    'father_name', 'id_card_number', 'phone_number', 'contact_no',
                    'present_address', 'permanent_address', 'address',
                    'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
                    'personal_email', 'professional_email', 'professional_email_password',
                    'recovery_email',
                    'department', 'designation', 'hired_for', 'employee_code',
                    'job_started_date', 'job_ended_date',
                    'gross_salary', 'applied_via',
                    'bank_name', 'bank_account_number', 'bank_account_title',
                    'employment_contract', 'offer_letter', 'techxaro_regulations',
                    'other_document',
                    'last_login_at', 'created_at', 'updated_at', 'must_change_password',
                ]),
                'stats' => [
                    'total_assigned_tasks' => (int) $taskStats->total_assigned,
                    'completed_tasks' => (int) $taskStats->completed,
                    'pending_tasks' => (int) $taskStats->pending,
                    'total_projects' => $totalProjects,
                ],
                'projects' => $projects,
                'login_history' => $loginHistory,
                'account' => [
                    'account_age' => $accountAge,
                    'days_since_creation' => $daysSinceCreation,
                    'status' => $user->active ? 'Active' : ($user->must_change_password ? 'Inactive' : 'Resigned'),
                    'last_login' => $user->last_login_at?->toDateTimeString() ?? 'Never logged in',
                ],
                'activity_max_id' => (int) \App\Models\UserChange::where('user_id', $id)->max('id'),
            ];
        });

        return response()->json(['success' => true] + $data);
    }

    public function changes($id)
    {
        $changes = \App\Models\UserChange::with('modifiedBy:id,name')
            ->where('user_id', $id)
            ->latest()
            ->get();

        return response()->json(['success' => true, 'changes' => $changes]);
    }

    /**
     * Serve a user document file for viewing or downloading.
     *
     * Supports both direct file viewing and forced download via 'action=download' query param.
     * Authenticates via Bearer token or query parameter token.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request with optional token and action params.
     * @param  \App\Models\User  $user  The user whose document to retrieve.
     * @param  string  $document  The document field name (e.g., 'cv', 'employment_contract').
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\JsonResponse  File response or error.
     */
    public function downloadDocument(Request $request, User $user, string $document)
    {
        if (!$this->resolveAuth($request)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (!in_array($document, $this->documentFields)) {
            return response()->json(['success' => false, 'message' => 'Invalid document field.'], 404);
        }

        $path = $user->$document;

        if (!$path) {
            return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
        }

        // Handle multiple files stored as JSON array (other_document)
        if ($document === 'other_document') {
            $paths = $this->parseOtherDocumentPaths($path);

            $fileParam = $request->query('file');
            if ($fileParam) {
                $found = false;
                foreach ($paths as $p) {
                    if ($p === $fileParam || basename($p) === basename($fileParam)) {
                        $path = $p;
                        $found = true;
                        break;
                    }
                }
                if (!$found) $path = $paths[0] ?? null;
            } else {
                $index = (int) $request->query('index', 0);
                $path = $paths[$index] ?? $paths[0] ?? null;
            }

            if (!$path) {
                return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
            }
        }

        $fullPath = storage_path('app/public/' . $path);

        if (!file_exists($fullPath)) {
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($path);

        if ($request->query('action') === 'download') {
            return response()->download($fullPath, $filename);
        }

        return response()->file($fullPath);
    }

    /**
     * Try to authenticate the user via Bearer token header or ?token= query param.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @return \App\Models\User|null  The authenticated user or null if not found.
     */
    private function resolveAuth(Request $request): ?User
    {
        if ($request->user()) {
            return $request->user();
        }

        $token = $request->query('token');
        if ($token) {
            $accessToken = PersonalAccessToken::findToken($token);
            if ($accessToken) {
                Auth::login($accessToken->tokenable);
                return $accessToken->tokenable;
            }
        }

        return null;
    }

    /**
     * Convert empty string values in the request to null for proper nullable validation.
     *
     * @param  \Illuminate\Http\Request  $request  The request to normalize.
     * @return void
     */
    private function normalizeEmptyStrings(Request $request): void
    {
        foreach ($request->input() as $key => $value) {
            if (is_string($value) && $value === '') {
                $request->merge([$key => null]);
            }
        }
    }

    /**
     * Handle file uploads for all document fields and store paths in the database.
     *
     * Deletes existing files before uploading new ones. Only processes valid uploads.
     *
     * @param  \Illuminate\Http\Request  $request  The request containing file uploads.
     * @param  \App\Models\User  $user  The user to upload files for.
     * @return void
     */
    private function handleAvatarUpload(Request $request, ?User $user): ?string
    {
        if (!$request->hasFile('avatar')) {
            return $user?->avatar;
        }

        $file = $request->file('avatar');
        if (!$file->isValid()) {
            return $user?->avatar;
        }

        // Delete old avatar if exists
        if ($user && $user->avatar && Storage::disk('public')->exists($user->avatar)) {
            Storage::disk('public')->delete($user->avatar);
        }

        $userId = $user ? $user->id : 'temp_' . time();
        $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
        $path = $file->storeAs('avatars/' . $userId, $filename, 'public');

        return $path;
    }

    private function handleFileUploads(Request $request, User $user): void
    {
        $authUser = $request->user();
        $singleFields = [
            'employment_contract', 'offer_letter', 'techxaro_regulations',
        ];

        foreach ($singleFields as $field) {
            if ($request->hasFile($field)) {
                $file = $request->file($field);

                if (!$file->isValid()) {
                    continue;
                }

                // Delete old file if exists
                if ($user->$field && Storage::disk('public')->exists($user->$field)) {
                    Storage::disk('public')->delete($user->$field);
                }

                $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

                $user->$field = $path;

                \App\Models\UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => $field,
                    'old_value' => null,
                    'new_value' => $file->getClientOriginalName(),
                    'modified_by' => $authUser->id,
                ]);
            }
        }

        // Handle multiple other_document files
        if ($request->hasFile('other_document')) {
            $files = $request->file('other_document');

            if (is_array($files)) {
                // Keep existing files and append new ones
                $existingPaths = $this->parseOtherDocumentPaths($user->other_document);

                $storedPaths = [];
                foreach ($files as $file) {
                    if ($file->isValid()) {
                        $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                        $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');
                        $storedPaths[] = $path;
                    }
                }

                $allPaths = array_merge($existingPaths, $storedPaths);
                $user->other_document = !empty($allPaths) ? json_encode($allPaths) : null;

                \App\Models\UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => 'other_document',
                    'old_value' => count($existingPaths) . ' file(s)',
                    'new_value' => count($allPaths) . ' file(s) uploaded',
                    'modified_by' => $authUser->id,
                ]);
            }
        }

        $user->save();
    }

    /**
     * Parse other_document value which may be a JSON array of paths or a single path.
     */
    private function parseOtherDocumentPaths($value): array
    {
        if (empty($value)) {
            return [];
        }

        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        // Legacy single file path
        return [$value];
    }

    /**
     * Delete all document files associated with a user from storage.
     *
     * @param  \App\Models\User  $user  The user whose files to delete.
     * @return void
     */
    private function deleteAllFiles(User $user): void
    {
        foreach ($this->documentFields as $field) {
            if ($field === 'other_document') {
                $paths = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($paths as $path) {
                    if (Storage::disk('public')->exists($path)) {
                        Storage::disk('public')->delete($path);
                    }
                }
            } elseif ($user->$field && Storage::disk('public')->exists($user->$field)) {
                Storage::disk('public')->delete($user->$field);
            }
        }
    }

    /**
     * Download or view a document belonging to the authenticated user (self-access only).
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request with optional action=download.
     * @param  string  $document  The document field name (e.g., 'cv', 'offer_letter').
     * @return \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\JsonResponse  File response or error.
     */
    public function downloadMyDocument(Request $request, string $document)
    {
        if (!$this->resolveAuth($request)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = $request->user();

        if (!in_array($document, $this->documentFields)) {
            return response()->json(['success' => false, 'message' => 'Invalid document field.'], 404);
        }

        $path = $user->$document;

        if (!$path) {
            return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
        }

        // Handle multiple files stored as JSON array (other_document)
        if ($document === 'other_document') {
            $paths = $this->parseOtherDocumentPaths($path);

            $fileParam = $request->query('file');
            if ($fileParam) {
                $found = false;
                foreach ($paths as $p) {
                    if ($p === $fileParam || basename($p) === basename($fileParam)) {
                        $path = $p;
                        $found = true;
                        break;
                    }
                }
                if (!$found) $path = $paths[0] ?? null;
            } else {
                $index = (int) $request->query('index', 0);
                $path = $paths[$index] ?? $paths[0] ?? null;
            }

            if (!$path) {
                return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
            }
        }

        $fullPath = storage_path('app/public/' . $path);

        if (!file_exists($fullPath)) {
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($path);

        if ($request->query('action') === 'download') {
            return response()->download($fullPath, $filename);
        }

        return response()->file($fullPath);
    }

    /**
     * Test email sending functionality by sending a test email to the specified address.
     *
     * @param  \Illuminate\Http\Request  $request  Input: email (required).
     * @return \Illuminate\Http\JsonResponse  JSON response confirming email sent or reporting failure.
     */
    public function testEmail(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $testUser = new \App\Models\User();
        $testUser->name = 'Test User';
        $testUser->email = $request->input('email');

        $plainPassword = 'TestPass123';
        $loginUrl = config('app.frontend_url');

        try {
            $authUser = $request->user();
            Mail::to($testUser->email)->send(new UserCreated($testUser, $plainPassword, '', '', $loginUrl, [], false, '', $authUser->professional_email ?? '', $authUser->name ?? 'PMS Techxaro'));
            Log::info("Test email sent successfully to {$testUser->email}");

            return response()->json([
                'success' => true,
                'message' => 'Test email sent successfully. Check your inbox.',
            ]);
        } catch (\Throwable $e) {
            Log::error("Test email failed: " . $e->getMessage(), [
                'exception' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Email sending failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}
