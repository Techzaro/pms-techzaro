<?php

/**
 * Controller for administration and user account management.
 */

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Task;
use App\Services\ActivityService;
use App\Services\EmailPolicyService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use App\Models\Project;
use App\Models\Team;
use App\Jobs\SendUserCreatedEmails;
use App\Mail\GuestInvitation;
use App\Mail\UserCreated;
use App\Mail\UserResigned;
use App\Mail\UserProfileUpdated;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
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
        private NotificationService $notificationService,
        private AuditService $auditService
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
            User::select('id', 'name', 'avatar', 'email', 'role', 'active', 'department', 'designation', 'employee_code', 'contact_no', 'sort_order', 'must_change_password', 'personal_email', 'professional_email', 'company_name', 'phone_number', 'last_login_at', 'created_at', 'credentials_managed_by_admin', 'password_reset_locked')
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
                'role' => ['required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member', 'guest'])],
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
                'other_document_names' => 'nullable|array',
                'other_document_names.*' => 'nullable|string|max:255',
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

        $loginEmail = $request->input('email');

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $loginEmail,
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
                $docs = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($docs as $doc) {
                    $docPath = is_array($doc) ? $doc['path'] : $doc;
                    if (Storage::disk('public')->exists($docPath)) {
                        $fullPath = Storage::disk('public')->path($docPath);
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

        try {
            $this->auditService->log(
                module: 'user_management',
                action: 'create',
                description: "Created user {$user->name}",
                user: $authUser,
                entityType: 'User',
                entityId: $user->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $loginUrl = config('app.frontend_url');

        $emailSent = false;
        $emailError = null;

        $profEmail = $request->input('professional_email') ?: $user->professional_email;
        $profPassword = $request->input('professional_email_password') ?: '';
        $personalEmail = $request->input('personal_email');
        $adderEmail = $authUser->notification_email;

        $message = $personalEmail
            ? 'User created successfully. Welcome email will be sent to ' . $personalEmail
            : 'User created successfully.';

        // Send emails synchronously to ensure delivery
        try {
            SendUserCreatedEmails::dispatchSync(
                $user, $plainPassword, $profEmail, $profPassword, $loginUrl, $emailAttachments,
                $personalEmail, $adderEmail, $authUser->name
            );
        } catch (\Throwable $e) {
            Log::error('Failed to send user created emails', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }

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
            'company_name' => 'nullable|string|max:255',
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
            'other_document_names' => 'nullable|array',
            'other_document_names.*' => 'nullable|string|max:255',
            'existing_other_docs' => 'nullable|string',
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
            'department', 'designation', 'company_name', 'hired_for', 'employee_code',
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
                $notifEmail = $user->notification_email;
                if ($notifEmail) {
                    Mail::to($notifEmail)->queue(new UserProfileUpdated($user, $authUser->name, $changes, $authUser->notification_email, $authUser->name));
                    $emailSent = true;
                } else {
                    $emailSent = false;
                }
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
            try {
                $this->auditService->log(
                    module: 'user_management',
                    action: 'update',
                    description: "Updated user {$user->name}",
                    user: $authUser,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: $oldValues,
                    newValues: $request->all(),
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
            }
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

        try {
            $this->auditService->log(
                module: 'user_management',
                action: 'delete',
                description: "Deleted user {$user->name}",
                user: $authUser,
                entityType: 'User',
                entityId: $user->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'User deleted successfully',
        ]);
    }

    /**
     * Get the impact analysis for resigning a user (pre-resignation preview).
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\User  $user  The user to analyze.
     * @return \Illuminate\Http\JsonResponse  JSON response with impact analysis.
     */
    public function resignationImpact(Request $request, User $user): JsonResponse
    {
        try {
            $service = app(\App\Services\ResignationWorkflowService::class);
            $impact = $service->analyzeImpact($user);
            return response()->json(['success' => true, 'impact' => $impact]);
        } catch (\Throwable $e) {
            \Log::error('Resignation impact analysis failed: ' . $e->getMessage(), [
                'user_id' => $user->id,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
            return response()->json(['success' => false, 'message' => 'Failed to analyze resignation impact: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Resign a user by setting their active status to false.
     *
     * Revokes all API tokens, returns unfinished work to original assigners as drafts,
     * sends resignation notification email, and creates comprehensive audit logs.
     * Managers cannot resign admin/manager accounts. Users cannot resign themselves.
     *
     * @param  \Illuminate\Http\Request  $request  The incoming HTTP request.
     * @param  \App\Models\User  $user  The user to resign.
     * @return \Illuminate\Http\JsonResponse  JSON response with resignation status.
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

            $service = app(\App\Services\ResignationWorkflowService::class);
            $resignationLog = $service->executeResignation(
                user: $user,
                admin: $authUser,
                notes: $request->input('notes')
            );

            return response()->json([
                'success' => true,
                'message' => 'User resigned successfully. All unfinished work has been returned to original assigners as drafts.',
                'user' => $user->fresh(),
                'resignation_log' => $resignationLog,
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
        $user = $request->user();

        if ($user->role === 'guest') {
            // Guest can only see admin/manager + team members of their projects
            $projectIds = Project::whereJsonContains('guest_ids', $user->id)->pluck('id');

            $teamIds = \App\Models\Team::whereIn('id', function ($q) use ($projectIds) {
                $q->select('team_id')->from('projects')->whereIn('id', $projectIds)->whereNotNull('team_id');
            })->pluck('id');

            $memberIds = \App\Models\Team::whereIn('id', $teamIds)
                ->with('members:id')
                ->get()
                ->pluck('members')
                ->flatten()
                ->pluck('id');

            $adminManagerIds = User::whereIn('role', ['admin', 'manager'])->pluck('id');

            $allIds = $adminManagerIds->merge($memberIds)->unique();

            $users = User::select('id', 'name', 'email', 'role', 'department')
                ->where('active', true)
                ->whereIn('id', $allIds)
                ->orderBy('name')
                ->get();
        } else {
            $users = User::select('id', 'name', 'email', 'role', 'department')
                ->where('active', true)
                ->orderBy('name')
                ->get();
        }

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
                    'credentials_managed_by_admin', 'password_reset_locked',
                    'password_changed_by', 'password_changed_at', 'password_version',
                ]) + [
                    'password_changed_by_name' => $user->password_changed_by
                        ? ($user->passwordChangedByUser?->name ?? 'Unknown')
                        : null,
                ],
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
            $docs = $this->parseOtherDocumentPaths($path);

            $fileParam = $request->query('file');
            if ($fileParam) {
                $found = false;
                foreach ($docs as $doc) {
                    $docPath = is_array($doc) ? $doc['path'] : $doc;
                    if ($docPath === $fileParam || basename($docPath) === basename($fileParam)) {
                        $path = $docPath;
                        $found = true;
                        break;
                    }
                }
                if (!$found) $path = is_array($docs[0]) ? $docs[0]['path'] : ($docs[0] ?? null);
            } else {
                $index = (int) $request->query('index', 0);
                $doc = $docs[$index] ?? $docs[0] ?? null;
                $path = is_array($doc) ? $doc['path'] : $doc;
            }

            if (!$path) {
                return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
            }
        }

        if (!Storage::disk('public')->exists($path)) {
            \Log::error('File not found on disk', [
                'path' => $path,
                'disk_root' => storage_path('app/public'),
                'full_path' => storage_path('app/public') . '/' . $path,
                'user_id' => $user->id,
                'document' => $document,
            ]);
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($path);

        if ($request->query('action') === 'download') {
            return Storage::disk('public')->download($path, $filename);
        }

        return Storage::disk('public')->response($path);
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
            Log::warning('Avatar upload invalid', [
                'user_id' => $user?->id,
                'error' => $file->getError(),
            ]);
            return $user?->avatar;
        }

        $disk = Storage::disk('public');

        if ($user && $user->avatar && $disk->exists($user->avatar)) {
            $disk->delete($user->avatar);
        }

        $userId = $user ? $user->id : 'temp_' . time();

        if (!$disk->exists('avatars/' . $userId)) {
            $disk->makeDirectory('avatars/' . $userId);
        }

        $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
        $path = $file->storeAs('avatars/' . $userId, $filename, 'public');

        if ($path && $disk->exists($path)) {
            return $path;
        }

        Log::error('Avatar upload failed - file not found on disk after store', [
            'user_id' => $user?->id,
            'returned_path' => $path,
        ]);

        return $user?->avatar;
    }

    private function handleFileUploads(Request $request, User $user): void
    {
        $authUser = $request->user();

        $disk = Storage::disk('public');
        $diskRoot = $disk->path('');

        if (!$disk->exists('user_documents/' . $user->id)) {
            $disk->makeDirectory('user_documents/' . $user->id);
        }

        $singleFields = [
            'employment_contract', 'offer_letter', 'techxaro_regulations',
        ];

        $uploadErrors = [];

        foreach ($singleFields as $field) {
            if ($request->hasFile($field)) {
                $file = $request->file($field);

                if (!$file->isValid()) {
                    $uploadErrors[$field] = 'File upload failed or file is invalid.';
                    Log::warning('Document upload invalid', [
                        'user_id' => $user->id,
                        'field' => $field,
                        'error' => $file->getError(),
                    ]);
                    continue;
                }

                if ($user->$field && $disk->exists($user->$field)) {
                    $disk->delete($user->$field);
                }

                $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

                if ($path && $disk->exists($path)) {
                    $user->$field = $path;

                    \App\Models\UserChange::create([
                        'user_id' => $user->id,
                        'field_name' => $field,
                        'old_value' => null,
                        'new_value' => $file->getClientOriginalName(),
                        'modified_by' => $authUser->id,
                    ]);

                    Log::info('Document uploaded successfully', [
                        'user_id' => $user->id,
                        'field' => $field,
                        'path' => $path,
                        'disk_root' => $diskRoot,
                        'file_size' => $file->getSize(),
                    ]);
                } else {
                    $uploadErrors[$field] = 'File could not be saved to storage.';
                    Log::error('Document upload failed - file not found on disk after store', [
                        'user_id' => $user->id,
                        'field' => $field,
                        'returned_path' => $path,
                        'disk_root' => $diskRoot,
                        'expected_path' => $diskRoot . '/' . $path,
                    ]);
                }
            }
        }

        if ($request->hasFile('other_document')) {
            $files = $request->file('other_document');
            $names = $request->input('other_document_names', []);

            if (is_array($files)) {
                $existingDocs = $this->parseOtherDocumentPaths($user->other_document);

                $newDocs = [];
                foreach ($files as $index => $file) {
                    if ($file->isValid()) {
                        $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                        $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

                        if ($path && $disk->exists($path)) {
                            $customName = isset($names[$index]) ? $names[$index] : $file->getClientOriginalName();
                            $customName = preg_replace('/\.[^.]+$/', '', $customName);
                            $newDocs[] = ['path' => $path, 'name' => $customName];

                            Log::info('Other document uploaded successfully', [
                                'user_id' => $user->id,
                                'path' => $path,
                                'file_size' => $file->getSize(),
                            ]);
                        } else {
                            $uploadErrors['other_document_' . $index] = 'File could not be saved to storage.';
                            Log::error('Other document upload failed - file not found on disk after store', [
                                'user_id' => $user->id,
                                'returned_path' => $path,
                                'disk_root' => $diskRoot,
                            ]);
                        }
                    } else {
                        $uploadErrors['other_document_' . $index] = 'File upload failed or file is invalid.';
                        Log::warning('Other document upload invalid', [
                            'user_id' => $user->id,
                            'error' => $file->getError(),
                        ]);
                    }
                }

                $allDocs = array_merge($existingDocs, $newDocs);
                $user->other_document = !empty($allDocs) ? json_encode($allDocs) : null;

                \App\Models\UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => 'other_document',
                    'old_value' => count($existingDocs) . ' file(s)',
                    'new_value' => count($allDocs) . ' file(s) uploaded',
                    'modified_by' => $authUser->id,
                ]);
            }
        }

        if (!$request->hasFile('other_document') && $request->has('existing_other_docs')) {
            $existingDocsJson = $request->input('existing_other_docs');
            $updatedDocs = json_decode($existingDocsJson, true);

            if (is_array($updatedDocs)) {
                $oldDocs = $this->parseOtherDocumentPaths($user->other_document);

                $oldPaths = array_map(function($doc) {
                    return is_array($doc) ? $doc['path'] : $doc;
                }, $oldDocs);
                $newPaths = array_map(function($doc) {
                    return $doc['path'] ?? null;
                }, $updatedDocs);
                $removedPaths = array_diff($oldPaths, $newPaths);
                foreach ($removedPaths as $removedPath) {
                    if ($removedPath && $disk->exists($removedPath)) {
                        $disk->delete($removedPath);
                    }
                }

                $user->other_document = !empty($updatedDocs) ? json_encode($updatedDocs) : null;

                \App\Models\UserChange::create([
                    'user_id' => $user->id,
                    'field_name' => 'other_document',
                    'old_value' => count($oldDocs) . ' file(s)',
                    'new_value' => count($updatedDocs) . ' file(s)',
                    'modified_by' => $authUser->id,
                ]);
            }
        }

        $user->save();

        if (!empty($uploadErrors)) {
            Log::warning('Some document uploads failed for user', [
                'user_id' => $user->id,
                'errors' => $uploadErrors,
            ]);
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
     * Delete all document files associated with a user from storage.
     *
     * @param  \App\Models\User  $user  The user whose files to delete.
     * @return void
     */
    private function deleteAllFiles(User $user): void
    {
        foreach ($this->documentFields as $field) {
            if ($field === 'other_document') {
                $docs = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($docs as $doc) {
                    $path = is_array($doc) ? $doc['path'] : $doc;
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
            $docs = $this->parseOtherDocumentPaths($path);

            $fileParam = $request->query('file');
            if ($fileParam) {
                $found = false;
                foreach ($docs as $doc) {
                    $docPath = is_array($doc) ? $doc['path'] : $doc;
                    if ($docPath === $fileParam || basename($docPath) === basename($fileParam)) {
                        $path = $docPath;
                        $found = true;
                        break;
                    }
                }
                if (!$found) $path = is_array($docs[0]) ? $docs[0]['path'] : ($docs[0] ?? null);
            } else {
                $index = (int) $request->query('index', 0);
                $doc = $docs[$index] ?? $docs[0] ?? null;
                $path = is_array($doc) ? $doc['path'] : $doc;
            }

            if (!$path) {
                return response()->json(['success' => false, 'message' => 'Document not found.'], 404);
            }
        }

        if (!Storage::disk('public')->exists($path)) {
            \Log::error('File not found on disk (my-documents)', [
                'path' => $path,
                'disk_root' => storage_path('app/public'),
                'full_path' => storage_path('app/public') . '/' . $path,
                'user_id' => $user->id ?? null,
                'document' => $document,
            ]);
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($path);

        if ($request->query('action') === 'download') {
            return Storage::disk('public')->download($path, $filename);
        }

        return Storage::disk('public')->response($path);
    }

    /**
     * Remove a document from the authenticated user's own profile.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function removeMyDocument(Request $request)
    {
        if (!$this->resolveAuth($request)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'type' => 'required|string|max:50',
            'index' => 'nullable|integer|min:0',
        ]);

        $user = $request->user();
        $type = $request->input('type');
        $index = $request->input('index');

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            if ($user->$type && Storage::disk('public')->exists($user->$type)) {
                Storage::disk('public')->delete($user->$type);
            }
            $user->$type = null;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            return response()->json([
                'success' => true,
                'message' => 'Document removed successfully.',
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index < 0 || $index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            $removedDoc = $docs[$index];
            $removedPath = is_array($removedDoc) ? ($removedDoc['path'] ?? null) : $removedDoc;

            if ($removedPath && Storage::disk('public')->exists($removedPath)) {
                Storage::disk('public')->delete($removedPath);
            }

            unset($docs[$index]);
            $docs = array_values($docs);

            $user->other_document = !empty($docs) ? json_encode($docs) : null;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            return response()->json([
                'success' => true,
                'message' => 'Document removed successfully.',
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
    }

    /**
     * Rename a document in the authenticated user's own profile (other_document items only).
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function renameMyDocument(Request $request)
    {
        if (!$this->resolveAuth($request)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'type' => 'required|string|max:50',
            'index' => 'nullable|integer',
            'name' => 'required|string|max:255',
        ]);

        $user = $request->user();
        $type = $request->input('type');
        $index = $request->input('index');
        $name = $request->input('name');

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            return response()->json([
                'success' => true,
                'message' => 'Document label updated.',
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null || $index < 0) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            $docs[$index]['name'] = $name;
            $user->other_document = json_encode($docs);
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            return response()->json([
                'success' => true,
                'message' => 'Document renamed successfully.',
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
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
            Mail::to($testUser->email)->send(new UserCreated($testUser, $plainPassword, '', '', $loginUrl, [], false, '', $authUser->notification_email ?? '', $authUser->name ?? 'PMS Techxaro'));
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

    /**
     * Remove a specific document from a user's profile.
     *
     * Supports removing single document fields (employment_contract, offer_letter, techxaro_regulations)
     * or a specific item from the other_document array by index.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \App\Models\User  $user
     * @return \Illuminate\Http\JsonResponse
     */
    public function removeDocument(Request $request, User $user)
    {
        $request->validate([
            'type' => 'required|string|max:50',
            'index' => 'nullable|integer|min:0',
        ]);

        $authUser = $request->user();
        $type = $request->input('type');
        $index = $request->input('index');

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            if ($user->$type && Storage::disk('public')->exists($user->$type)) {
                Storage::disk('public')->delete($user->$type);
            }
            $oldValue = $user->$type;
            $user->$type = null;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => $type,
                'old_value' => $oldValue ? basename($oldValue) : null,
                'new_value' => null,
                'modified_by' => $authUser->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Document removed successfully.',
                'user' => $user,
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index < 0 || $index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            $removedDoc = $docs[$index];
            $removedPath = is_array($removedDoc) ? ($removedDoc['path'] ?? null) : $removedDoc;

            if ($removedPath && Storage::disk('public')->exists($removedPath)) {
                Storage::disk('public')->delete($removedPath);
            }

            unset($docs[$index]);
            $docs = array_values($docs);

            $user->other_document = !empty($docs) ? json_encode($docs) : null;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => 'other_document',
                'old_value' => (count($docs) + 1) . ' file(s)',
                'new_value' => count($docs) . ' file(s)',
                'modified_by' => $authUser->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Document removed successfully.',
                'user' => $user,
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
    }

    /**
     * Rename a user document (for other_document items).
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \App\Models\User  $user
     * @return \Illuminate\Http\JsonResponse
     */
    public function renameDocument(Request $request, User $user)
    {
        Log::info('renameDocument called', ['user_id' => $user->id, 'type' => $request->input('type'), 'index' => $request->input('index'), 'name' => $request->input('name')]);

        $request->validate([
            'type' => 'required|string|max:50',
            'index' => 'nullable|integer|min:0',
            'name' => 'required|string|max:255',
        ]);

        $authUser = $request->user();
        $type = $request->input('type');
        $index = $request->input('index');
        $name = $request->input('name');

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            // Single doc — name is the display label, no file rename needed, just return success
            return response()->json([
                'success' => true,
                'message' => 'Document label updated.',
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null || $index < 0) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            $oldName = $docs[$index]['name'] ?? null;
            $docs[$index]['name'] = $name;

            $user->other_document = json_encode($docs);
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => 'other_document',
                'old_value' => $oldName,
                'new_value' => $name,
                'modified_by' => $authUser->id,
            ]);

            // Retrieve fresh data so response always matches DB
            $freshUser = \App\Models\User::find($user->id);

            return response()->json([
                'success' => true,
                'message' => 'Document renamed successfully.',
                'user' => [
                    'other_document' => $freshUser?->other_document,
                ],
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
    }

    /**
     * Replace a user document file (and optionally rename it).
     *
     * Supports replacing single document fields (employment_contract, offer_letter, techxaro_regulations)
     * or a specific item from the other_document array.
     *
     * @param  \Illuminate\Http\Request  $request  Multipart form with doc_type, doc_file, optional doc_index, doc_name
     * @param  \App\Models\User  $user
     * @return \Illuminate\Http\JsonResponse
     */
    public function replaceDocument(Request $request, User $user)
    {
        Log::info('replaceDocument called', ['user_id' => $user->id, 'doc_type' => $request->input('doc_type'), 'doc_index' => $request->input('doc_index'), 'doc_name' => $request->input('doc_name')]);

        $request->validate([
            'doc_type' => 'required|string|max:50',
            'doc_index' => 'nullable|integer|min:0',
            'doc_name' => 'nullable|string|max:255',
            'doc_file' => 'required|file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:20480',
        ]);

        $authUser = $request->user();
        $type = $request->input('doc_type');
        $index = $request->input('doc_index');
        $name = $request->input('doc_name');
        $file = $request->file('doc_file');

        if (!$file->isValid()) {
            return response()->json(['success' => false, 'message' => 'Uploaded file is not valid.'], 422);
        }

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            // Delete old file if exists
            if ($user->$type && Storage::disk('public')->exists($user->$type)) {
                Storage::disk('public')->delete($user->$type);
            }

            $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
            $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

            $oldValue = $user->$type;
            $user->$type = $path;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => $type,
                'old_value' => $oldValue ? basename($oldValue) : null,
                'new_value' => $file->getClientOriginalName(),
                'modified_by' => $authUser->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Document replaced successfully.',
                'user' => $user->only(['employment_contract', 'offer_letter', 'techxaro_regulations']),
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index < 0 || $index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            // Delete old file
            $oldDoc = $docs[$index];
            $oldPath = is_array($oldDoc) ? ($oldDoc['path'] ?? null) : $oldDoc;
            if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }

            // Upload new file
            $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
            $newPath = $file->storeAs('user_documents/' . $user->id, $filename, 'public');
            $customName = $name ?: preg_replace('/\.[^.]+$/', '', $file->getClientOriginalName());

            $docs[$index] = ['path' => $newPath, 'name' => $customName];

            $user->other_document = json_encode($docs);
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => 'other_document',
                'old_value' => $oldPath ? basename($oldPath) : null,
                'new_value' => $file->getClientOriginalName(),
                'modified_by' => $authUser->id,
            ]);

            $freshUser = \App\Models\User::find($user->id);

            return response()->json([
                'success' => true,
                'message' => 'Document replaced successfully.',
                'user' => [
                    'other_document' => $freshUser?->other_document,
                ],
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
    }

    /**
     * Replace a document in the authenticated user's own profile.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function replaceMyDocument(Request $request)
    {
        if (!$this->resolveAuth($request)) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'doc_type' => 'required|string|max:50',
            'doc_index' => 'nullable|integer|min:0',
            'doc_name' => 'nullable|string|max:255',
            'doc_file' => 'required|file|mimes:pdf,jpeg,jpg,png,gif,bmp,webp,svg,tiff,tif|max:20480',
        ]);

        $user = $request->user();
        $type = $request->input('doc_type');
        $index = $request->input('doc_index');
        $name = $request->input('doc_name');
        $file = $request->file('doc_file');

        if (!$file->isValid()) {
            return response()->json(['success' => false, 'message' => 'Uploaded file is not valid.'], 422);
        }

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            if ($user->$type && Storage::disk('public')->exists($user->$type)) {
                Storage::disk('public')->delete($user->$type);
            }

            $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
            $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

            $user->$type = $path;
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            return response()->json([
                'success' => true,
                'message' => 'Document replaced successfully.',
                'user' => $user->only(['employment_contract', 'offer_letter', 'techxaro_regulations']),
            ]);
        }

        if ($type === 'other_document') {
            if ($index === null) {
                return response()->json(['success' => false, 'message' => 'Index is required for other_document.'], 422);
            }

            $docs = $this->parseOtherDocumentPaths($user->other_document);

            if ($index < 0 || $index >= count($docs)) {
                return response()->json(['success' => false, 'message' => 'Invalid document index.'], 422);
            }

            $oldDoc = $docs[$index];
            $oldPath = is_array($oldDoc) ? ($oldDoc['path'] ?? null) : $oldDoc;
            if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }

            $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
            $newPath = $file->storeAs('user_documents/' . $user->id, $filename, 'public');
            $customName = $name ?: preg_replace('/\.[^.]+$/', '', $file->getClientOriginalName());

            $docs[$index] = ['path' => $newPath, 'name' => $customName];

            $user->other_document = json_encode($docs);
            $user->save();
            Cache::forget("user_profile_{$user->id}");

            return response()->json([
                'success' => true,
                'message' => 'Document replaced successfully.',
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Invalid document type.'], 422);
    }

    /*
    |--------------------------------------------------------------------------
    | Guest (Client Portal) Management
    |--------------------------------------------------------------------------
    */

    /**
     * Create a new guest (client portal) user with auto-generated password.
     */
    public function storeGuest(Request $request)
    {
        $this->normalizeEmptyStrings($request);

        $request->validate([
            'name' => 'required|string|max:255',
            'personal_email' => 'required|string|email|max:255|unique:users,professional_email|unique:users,email',
            'phone_number' => 'nullable|string|max:32',
            'company_name' => 'nullable|string|max:255',
            'avatar' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);

        $authUser = $request->user();
        $plainPassword = Str::random(10) . '@' . Str::random(2);

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('personal_email'),
            'professional_email' => $request->input('personal_email'),
            'personal_email' => $request->input('personal_email'),
            'password' => Hash::make($plainPassword),
            'role' => 'guest',
            'active' => false,
            'must_change_password' => true,
            'phone_number' => $request->input('phone_number'),
            'contact_no' => $request->input('phone_number'),
            'company_name' => $request->input('company_name'),
        ]);

        if ($request->hasFile('avatar')) {
            $user->avatar = $this->handleAvatarUpload($request, $user);
            $user->save();
        }

        Cache::forget('all_users_list');

        $this->activityService->log(
            $authUser->id,
            'guest_created',
            "You created guest {$user->name}",
            'user',
            $user->id,
            'created',
            $user->name,
            $user->id,
        );

        try {
            $this->auditService->log(
                module: 'user_management',
                action: 'create',
                description: "Created guest {$user->name}",
                user: $authUser,
                entityType: 'User',
                entityId: $user->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $loginUrl = config('app.frontend_url');
        $emailSent = false;

        try {
            Mail::to($user->personal_email)->send(new GuestInvitation($user, $plainPassword, $loginUrl, false));
            $emailSent = true;
        } catch (\Throwable $e) {
            Log::error("Failed to send guest invitation email to {$user->personal_email}: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Guest created successfully.' . ($emailSent ? ' Invitation email sent.' : ''),
            'user' => $user,
            'email_sent' => $emailSent,
        ], 201);
    }

    /**
     * Update a guest's profile details.
     */
    public function updateGuest(Request $request, User $user)
    {
        $this->normalizeEmptyStrings($request);

        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'This user is not a guest.'], 422);
        }

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'personal_email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'professional_email')->ignore($user->id), Rule::unique('users', 'email')->ignore($user->id)],
            'phone_number' => 'nullable|string|max:32',
            'company_name' => 'nullable|string|max:255',
            'avatar' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
            'avatar_remove' => 'nullable|in:1',
        ]);

        $authUser = $request->user();

        $fields = ['name', 'phone_number', 'company_name'];
        foreach ($fields as $field) {
            if ($request->exists($field)) {
                $user->$field = $request->input($field);
            }
        }

        if ($request->exists('personal_email')) {
            $user->email = $request->input('personal_email');
            $user->professional_email = $request->input('personal_email');
            $user->personal_email = $request->input('personal_email');
        }

        if ($request->exists('phone_number')) {
            $user->contact_no = $request->input('phone_number');
        }

        // Handle avatar removal
        if ($request->input('avatar_remove') === '1') {
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = null;
        }

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $user->avatar = $this->handleAvatarUpload($request, $user);
        }

        $user->save();

        Cache::forget('all_users_list');
        Cache::forget("user_profile_{$user->id}");

        $this->activityService->log(
            $authUser->id,
            'guest_updated',
            "You updated guest {$user->name}",
            'user',
            $user->id,
            'updated',
            $user->name,
            $user->id,
        );

        return response()->json([
            'success' => true,
            'message' => 'Guest updated successfully.',
            'user' => $user,
        ]);
    }

    /**
     * Resend invitation email to a guest with a new password.
     */
    public function resendInvitation(Request $request, User $user)
    {
        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'This user is not a guest.'], 422);
        }

        $authUser = $request->user();
        $plainPassword = Str::random(10) . '@' . Str::random(2);
        $user->password = Hash::make($plainPassword);
        $user->must_change_password = true;
        $user->active = true;
        $user->save();

        Cache::forget('all_users_list');

        $loginUrl = config('app.frontend_url');
        $emailSent = false;

        try {
            Mail::to($user->personal_email)->send(new GuestInvitation($user, $plainPassword, $loginUrl, false));
            $emailSent = true;
        } catch (\Throwable $e) {
            Log::error("Failed to resend guest invitation to {$user->personal_email}: " . $e->getMessage());
        }

        $this->activityService->log(
            $authUser->id,
            'guest_invitation_resent',
            "You resent invitation to guest {$user->name}",
            'user',
            $user->id,
            'updated',
            $user->name,
            $user->id,
        );

        return response()->json([
            'success' => true,
            'message' => 'Invitation resent successfully.' . ($emailSent ? ' Email sent.' : ' Email sending failed.'),
            'user' => $user,
            'email_sent' => $emailSent,
        ]);
    }

    /**
     * Reset a guest's password and send new credentials.
     */
    public function resetGuestPassword(Request $request, User $user)
    {
        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'This user is not a guest.'], 422);
        }

        $authUser = $request->user();
        $plainPassword = Str::random(10) . '@' . Str::random(2);
        $user->password = Hash::make($plainPassword);
        $user->must_change_password = true;
        $user->save();

        Cache::forget('all_users_list');

        $loginUrl = config('app.frontend_url');
        $emailSent = false;

        try {
            Mail::to($user->personal_email)->send(new GuestInvitation($user, $plainPassword, $loginUrl, true));
            $emailSent = true;
        } catch (\Throwable $e) {
            Log::error("Failed to send password reset to guest {$user->personal_email}: " . $e->getMessage());
        }

        $this->activityService->log(
            $authUser->id,
            'guest_password_reset',
            "You reset password for guest {$user->name}",
            'user',
            $user->id,
            'updated',
            $user->name,
            $user->id,
        );

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully.' . ($emailSent ? ' New credentials sent by email.' : ' Email sending failed.'),
            'user' => $user,
            'email_sent' => $emailSent,
        ]);
    }

    /**
     * Toggle a guest's active/inactive status.
     */
    public function resignGuest(Request $request, User $user)
    {
        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'This user is not a guest.'], 422);
        }

        if ($user->active === false && $user->must_change_password === false) {
            return response()->json(['success' => false, 'message' => 'This guest is already resigned.'], 422);
        }

        $authUser = $request->user();

        $user->active = false;
        $user->must_change_password = false;
        $user->save();

        Cache::forget('all_users_list');

        $this->activityService->log(
            $authUser->id,
            'guest_resigned',
            "You resigned guest {$user->name}",
            'user',
            $user->id,
            'resigned',
            $user->name,
            $user->id,
        );

        try {
            $this->auditService->log(
                module: 'user_management',
                action: 'resign',
                description: "Resigned guest {$user->name}",
                user: $authUser,
                entityType: 'User',
                entityId: $user->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Guest resigned successfully.',
            'user' => $user,
        ]);
    }

    public function toggleGuestStatus(Request $request, User $user)
    {
        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'This user is not a guest.'], 422);
        }

        $authUser = $request->user();
        $user->active = !$user->active;
        $user->save();

        Cache::forget('all_users_list');

        $status = $user->active ? 'activated' : 'deactivated';

        $this->activityService->log(
            $authUser->id,
            'guest_status_changed',
            "You {$status} guest {$user->name}",
            'user',
            $user->id,
            'updated',
            $user->name,
            $user->id,
        );

        return response()->json([
            'success' => true,
            'message' => "Guest {$status} successfully.",
            'user' => $user,
        ]);
    }
}
