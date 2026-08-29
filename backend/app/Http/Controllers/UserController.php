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
    public function index(Request $request)
    {
        $role = $request->query('role');
        $status = $request->query('status');
        $search = $request->query('search');

        $selectColumns = [
            'id', 'name', 'avatar', 'email', 'role', 'active',
            'department', 'designation', 'employee_code', 'contact_no', 'sort_order', 'must_change_password',
            'personal_email', 'professional_email', 'company_name', 'phone_number', 'last_login_at', 'created_at',
            'father_name', 'id_card_number', 'present_address', 'permanent_address', 'gross_salary',
            'bank_name', 'bank_account_number', 'bank_account_title'
        ];
        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'deletion_requested')) {
            $selectColumns[] = 'deletion_requested';
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'deletion_requested_by')) {
            $selectColumns[] = 'deletion_requested_by';
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'status')) {
            $selectColumns[] = 'status';
        }

        $query = User::select($selectColumns);

        if ($role) {
            $normalizedRole = $role === 'teamlead' ? 'team_lead' : $role;
            $query->where('role', $normalizedRole);
        }

        if ($status) {
            if ($status === 'active') {
                $query->where('active', true);
            } elseif ($status === 'inactive' || $status === 'resigned') {
                $query->where('active', false);
            }
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('personal_email', 'like', "%{$search}%")
                  ->orWhere('professional_email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('sort_order')->latest('updated_at')->get();

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

        $isDraft = strtolower($request->input('status', '')) === 'draft' || $request->boolean('is_draft');

        try {
            // Check org email policy — standard policy makes professional_email optional
            $org = $request->attributes->get('currentOrganization');
            $emailPolicy = $org->email_policy ?? 'standard';
            $isCompanyRequired = $emailPolicy === 'company_required';

            $request->validate([
                'name' => 'required|string|max:255',
                'email' => $isDraft ? 'nullable|string|email|max:255|unique:users,email' : 'required|string|email|max:255|unique:users,email',
                'personal_email' => 'nullable|email|max:255',
                'professional_email' => ($isDraft || !$isCompanyRequired) ? 'nullable|string|email|max:255' : 'required|string|email|max:255',
                'professional_email_password' => 'nullable|string|max:255',
                'role' => [$isDraft ? 'nullable' : 'required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member', 'guest'])],
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
                'department' => $isDraft ? 'nullable|string|max:255' : 'required|string|max:255',
                'designation' => $isDraft ? 'nullable|string|max:255' : 'required|string|max:255',
                'hired_for' => 'nullable|string|max:255',
                'employee_code' => $isDraft ? 'nullable|string|max:64' : 'required|string|max:64',
                'job_started_date' => 'nullable|date',
                'job_ended_date' => 'nullable|date|after_or_equal:job_started_date',
                'gross_salary' => 'nullable|string|max:1000',
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
                'password_type' => 'nullable|string|in:auto,manual',
                'password' => $request->input('password_type') === 'manual' ? 'required|string|min:6|max:255' : 'nullable|string|max:255',
                'project_ids' => 'nullable|array',
                'project_ids.*' => 'integer|exists:projects,id',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('User create validation failed', ['errors' => $e->errors()]);
            throw $e;
        }

        $passwordType = $request->input('password_type', 'auto');
        if ($passwordType === 'manual' && $request->filled('password')) {
            $plainPassword = $request->input('password');
        } else {
            $plainPassword = Str::random(10);
        }
        $role = $request->input('role') === 'teamlead' ? 'team_lead' : ($request->input('role') ?: 'member');

        $authUser = $request->user();

        if ($authUser->role === 'manager' && in_array($role, ['admin', 'manager'])) {
            return response()->json([
                'success' => false,
                'message' => 'Managers cannot create administrators or other managers.',
            ], 403);
        }

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email') ?: ($isDraft ? 'draft_' . Str::random(8) . '@draft.local' : null),
            'password' => Hash::make($plainPassword),
            'role' => $role,
            'status' => $isDraft ? 'Draft' : 'Inactive',
            'active' => $isDraft ? false : false,
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
            'professional_email' => $request->input('professional_email') ?: $request->input('personal_email'),
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

        // Attach user to selected projects immediately upon creation
        $projectIds = $request->input('project_ids', $request->input('projects', []));
        if (is_string($projectIds)) {
            $projectIds = json_decode($projectIds, true) ?: explode(',', $projectIds);
        }
        if (! empty($projectIds) && is_array($projectIds)) {
            $projectIds = array_values(array_filter(array_map('intval', $projectIds)));
            $projects = Project::whereIn('id', $projectIds)->get();
            foreach ($projects as $proj) {
                $assignedUsers = (array) ($proj->assigned_users ?? []);
                if (! in_array((int) $user->id, array_map('intval', $assignedUsers))) {
                    $assignedUsers[] = (int) $user->id;
                    $proj->assigned_users = array_values(array_unique(array_map('intval', $assignedUsers)));
                }
                if ($user->role === 'guest') {
                    $guestIds = (array) ($proj->guest_ids ?? []);
                    if (! in_array((int) $user->id, array_map('intval', $guestIds))) {
                        $guestIds[] = (int) $user->id;
                        $proj->guest_ids = array_values(array_unique(array_map('intval', $guestIds)));
                    }
                }
                $proj->save();
            }
        }

        // Handle file uploads
        $this->handleFileUploads($request, $user);

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $user->avatar = $this->handleAvatarUpload($request, $user);
            $user->save();
        }

        // Collect uploaded file paths for email attachments
        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);

        $emailAttachments = [];
        foreach ($this->documentFields as $field) {
            if ($field === 'other_document') {
                $docs = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($docs as $doc) {
                    $docPath = is_array($doc) ? $doc['path'] : $doc;
                    if ($docPath) {
                        $cleanPath = ltrim($docPath, '/');
                        if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                        if ($diskInstance->exists($cleanPath)) {
                            $fullPath = $diskInstance->path($cleanPath);
                            $emailAttachments[$fullPath] = 'other_document';
                        }
                    }
                }
            } elseif ($user->$field) {
                $cleanPath = ltrim($user->$field, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                if ($diskInstance->exists($cleanPath)) {
                    $fullPath = $diskInstance->path($cleanPath);
                    $emailAttachments[$fullPath] = $field;
                }
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
        $adderEmail = $authUser->professional_email ?: $authUser->personal_email ?: $authUser->email;

        $message = $isDraft
            ? 'User draft created successfully.'
            : ($personalEmail
                ? 'User created successfully. Welcome email will be sent to ' . $personalEmail
                : 'User created successfully.');

        // Send emails synchronously to ensure delivery (skip for drafts)
        if (! $isDraft) {
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
            'professional_email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'professional_email')->ignore($user->id)],
            'professional_email_password' => 'nullable|string|max:255',
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['Active', 'Inactive', 'Resigned', 'active', 'inactive', 'resigned'])],
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'sometimes|required|string|max:255',
            'designation' => 'sometimes|required|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'sometimes|required|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date',
            'gross_salary' => 'nullable|string|max:1000',
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
            'avatar_remove' => 'nullable|in:1',
        ]);

        $authUser = $request->user();

        if ($authUser->id === $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot modify your own account.',
            ], 403);
        }

        if ($user->status === 'Resigned') {
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

        // Handle status and active boolean sync
        if ($request->has('status') && $request->input('status')) {
            $statusStr = ucfirst(strtolower($request->input('status')));
            $user->status = $statusStr;
            if ($statusStr === 'Active') {
                $user->active = true;
            } else {
                $user->active = false;
            }
        } elseif ($request->has('active')) {
            $activeBool = filter_var($request->input('active'), FILTER_VALIDATE_BOOLEAN);
            $user->active = $activeBool;
            if ($activeBool && $user->status !== 'Active') {
                $user->status = 'Active';
            } elseif (!$activeBool && $user->status === 'Active') {
                $user->status = 'Inactive';
            }
        }

        // Handle avatar removal from edit modal or flag
        if (
            $request->boolean('remove_avatar') ||
            $request->input('remove_avatar') === true ||
            $request->input('remove_avatar') === 'true' ||
            $request->input('avatar_remove') === '1' ||
            $request->input('avatar_remove') === 1
        ) {
            if ($user->avatar) {
                $org = $request->attributes->get('currentOrganization');
                $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
                $cleanPath = ltrim($user->avatar, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
            }
            $user->avatar = null;
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
                Mail::to($user->professional_email)->queue(new UserProfileUpdated($user, $authUser->name, $changes, $authUser->professional_email, $authUser->name));
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
     * Remove the user's profile photo (Bug Fix: USER_002).
     *
     * @param  int  $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function removePhoto(Request $request, $id)
    {
        $user = User::findOrFail($id);

        if ($user->avatar) {
            $org = $request->attributes->get('currentOrganization');
            $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
            $cleanPath = ltrim($user->avatar, '/');
            if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
            try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
            $user->update(['avatar' => null]);
            
            Cache::forget('all_users_list');
            Cache::forget("user_profile_{$user->id}");
        }

        return response()->json([
            'success' => true,
            'message' => 'Profile photo removed successfully'
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
    public function destroy(Request $request, User $user)
    {
        $authUser = $request->user() ?: request()->user();

        if ($authUser->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized. Only Admins can execute user deletion.'], 403);
        }

        if ($authUser->id === $user->id) {
            return response()->json(['success' => false, 'message' => 'You cannot delete your own account.'], 403);
        }

        // Prevent deleting the founding/first admin of the organization
        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            // Auto-backfill founding_admin_id if NULL (for orgs created before this feature)
            if (!$org->founding_admin_id) {
                try {
                    $dbName = $org->database_name;
                    $escaped = str_replace('`', '``', $dbName);
                    $pdo = DB::connection('mysql_master')->getPdo();
                    $stmt = $pdo->prepare("SELECT id FROM `{$escaped}`.`users` WHERE role = 'admin' AND active = 1 ORDER BY created_at ASC LIMIT 1");
                    $stmt->execute();
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    if ($row && !empty($row['id'])) {
                        $org->update(['founding_admin_id' => $row['id']]);
                        $org->founding_admin_id = $row['id'];
                    }
                } catch (\Throwable $e) {
                    \Log::warning("Failed to auto-backfill founding_admin_id for org {$org->id}: " . $e->getMessage());
                }
            }

            if ($org->founding_admin_id && $org->founding_admin_id === $user->id) {
                return response()->json(['success' => false, 'message' => 'Cannot delete the founding admin of this organization. This user registered the organization and is protected from deletion.'], 403);
            }
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
     * Request user deletion (for Manager role).
     * Flags deletion_requested = true and notifies Admins.
     */
    public function requestDeletion(Request $request, User $user)
    {
        $authUser = $request->user();

        if ($authUser->role !== 'manager') {
            return response()->json(['success' => false, 'message' => 'Only managers can submit a deletion request.'], 403);
        }

        if (in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Managers cannot request deletion of administrators or managers.'], 403);
        }

        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'deletion_requested')) {
            $user->deletion_requested = true;
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'deletion_requested_by')) {
            $user->deletion_requested_by = $authUser->id;
        }
        $user->save();

        Cache::forget('all_users_list');

        $this->activityService->log(
            $authUser->id,
            'user_deletion_requested',
            "You requested deletion of user {$user->name}",
            'user',
            $user->id,
            'updated',
            $user->name
        );

        $admins = User::where('role', 'admin')->get();
        foreach ($admins as $admin) {
            $this->notificationService->notify(
                $admin->id,
                $authUser->id,
                'user_deletion_requested',
                'user',
                $user->id,
                'User Deletion Requested',
                "Manager {$authUser->name} requested deletion of user {$user->name}.",
                '/manage-users'
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'User deletion request submitted successfully to Admin.',
        ]);
    }

    /**
     * Delete a guest user account.
     */
    public function destroyGuest(Request $request, User $user)
    {
        $authUser = $request->user();

        if (!in_array($authUser->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($user->role !== 'guest') {
            return response()->json(['success' => false, 'message' => 'Selected user is not a guest account.'], 422);
        }

        if ($user->avatar) {
            $org = $request->attributes->get('currentOrganization');
            $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
            $cleanPath = ltrim($user->avatar, '/');
            if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
            try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
        }

        $user->delete();

        Cache::forget('all_users_list');

        return response()->json([
            'success' => true,
            'message' => 'Guest deleted successfully.',
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

            if ($user->status === 'Resigned') {
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

            // Prevent resigning the founding admin of the organization
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                // Auto-backfill founding_admin_id if NULL (for orgs created before this feature)
                if (!$org->founding_admin_id) {
                    try {
                        $dbName = $org->database_name;
                        $escaped = str_replace('`', '``', $dbName);
                        $pdo = DB::connection('mysql_master')->getPdo();
                        $stmt = $pdo->prepare("SELECT id FROM `{$escaped}`.`users` WHERE role = 'admin' AND active = 1 ORDER BY created_at ASC LIMIT 1");
                        $stmt->execute();
                        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                        if ($row && !empty($row['id'])) {
                            $org->update(['founding_admin_id' => $row['id']]);
                            $org->founding_admin_id = $row['id'];
                        }
                    } catch (\Throwable $e) {
                        \Log::warning("Failed to auto-backfill founding_admin_id for org {$org->id}: " . $e->getMessage());
                    }
                }

                if ($org->founding_admin_id && $org->founding_admin_id === $user->id) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Cannot resign the founding admin of this organization. This user registered the organization and is protected.',
                    ], 403);
                }
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
                    'language', 'timezone', 'date_format', 'time_format', 'working_hours',
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
                    'status' => $user->status ?: ($user->active ? 'Active' : 'Inactive'),
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

        $cleanPath = ltrim($path, '/');
        if (str_starts_with($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, 8);
        }

        $org = $request->attributes->get('currentOrganization');

        // Fallback: resolve org from user's company_name when middleware didn't set it
        // (happens when <a href> requests bypass tenant resolution)
        if (!$org && $user->company_name) {
            try {
                $org = \App\Models\Master\Organization::where('slug', $user->company_name)
                    ->orWhere('name', $user->company_name)
                    ->first();
            } catch (\Throwable $e) {}
        }

        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';

        if (!Storage::disk($disk)->exists($cleanPath)) {
            \Log::error('File not found on disk', [
                'path' => $cleanPath,
                'disk' => $disk,
                'user_id' => $user->id,
                'document' => $document,
                'org_id' => $org?->id,
            ]);
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($cleanPath);

        // Support both ?action=download and ?download=1 parameter patterns
        if ($request->query('action') === 'download' || $request->query('download')) {
            return Storage::disk($disk)->download($cleanPath, $filename);
        }

        return Storage::disk($disk)->response($cleanPath);
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

        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);

        if ($user && $user->avatar) {
            $cleanPath = ltrim($user->avatar, '/');
            if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
            try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
        }

        $userId = $user ? $user->id : 'temp_' . time();
        $category = 'avatars/' . $userId;

        if ($org) {
            $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
            $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
        } else {
            if (!$diskInstance->exists($category)) {
                $diskInstance->makeDirectory($category);
            }
            $filename = 'avatar_' . time() . '_' . mt_rand(10000, 99999) . '.' . $file->getClientOriginalExtension();
            $path = $file->storeAs($category, $filename, 'public');
        }

        if ($path) {
            return $path;
        }

        Log::error('Avatar upload failed - store returned null', [
            'user_id' => $user?->id,
        ]);

        return $user?->avatar;
    }

    private function handleFileUploads(Request $request, User $user): void
    {
        $authUser = $request->user();
        $org = $request->attributes->get('currentOrganization');

        // Resolve disk: S3 if org has it configured, else local public
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);
        $diskRoot = $diskInstance->path('');

        $category = 'user_documents/' . $user->id;

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
                        Log::warning('Could not delete old document', ['path' => $user->$field, 'error' => $e->getMessage()]);
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
                        'disk' => $disk,
                        'file_size' => $file->getSize(),
                    ]);
                } else {
                    $uploadErrors[$field] = 'File could not be saved to storage.';
                    Log::error('Document upload failed - file not found on disk after store', [
                        'user_id' => $user->id,
                        'field' => $field,
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
                        // Store file using StorageDiskResolver (S3 or local)
                        if ($org) {
                            $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                            $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
                        } else {
                            $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                            $path = $file->storeAs($category, $filename, 'public');
                        }

                        if ($path) {
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
                        }
                    } else {
                        $uploadErrors['other_document_' . $index] = 'File upload failed or file is invalid.';
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
                    if ($removedPath) {
                        $cleanPath = ltrim($removedPath, '/');
                        if (str_starts_with($cleanPath, 'storage/')) {
                            $cleanPath = substr($cleanPath, 8);
                        }
                        try {
                            if ($diskInstance->exists($cleanPath)) {
                                $diskInstance->delete($cleanPath);
                            }
                        } catch (\Exception $e) {
                            Log::warning('Could not delete removed document', ['path' => $removedPath, 'error' => $e->getMessage()]);
                        }
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
        $disksToTry = ['public'];
        try {
            $org = $user->organization ?? $user->organizations()->first();
            if ($org) {
                $s3Disk = \App\Services\StorageDiskResolver::getDisk($org);
                if ($s3Disk !== 'public') $disksToTry[] = $s3Disk;
            }
        } catch (\Exception $e) {}

        foreach ($this->documentFields as $field) {
            if ($field === 'other_document') {
                $docs = $this->parseOtherDocumentPaths($user->other_document);
                foreach ($docs as $doc) {
                    $path = is_array($doc) ? $doc['path'] : $doc;
                    if ($path) {
                        $cleanPath = ltrim($path, '/');
                        if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                        foreach ($disksToTry as $disk) {
                            try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
                        }
                    }
                }
            } elseif ($user->$field) {
                $cleanPath = ltrim($user->$field, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                foreach ($disksToTry as $disk) {
                    try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
                }
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

        $org = $request->attributes->get('currentOrganization');

        // Fallback: resolve org from user's company_name when middleware didn't set it
        if (!$org && $user->company_name) {
            try {
                $org = \App\Models\Master\Organization::where('slug', $user->company_name)
                    ->orWhere('name', $user->company_name)
                    ->first();
            } catch (\Throwable $e) {}
        }

        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);

        $cleanPath = ltrim($path, '/');
        if (str_starts_with($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, 8);
        }

        if (!$diskInstance->exists($cleanPath)) {
            \Log::error('File not found on disk (my-documents)', [
                'path' => $cleanPath,
                'disk' => $disk,
                'user_id' => $user->id ?? null,
                'document' => $document,
            ]);
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        $filename = basename($cleanPath);

        if ($request->query('action') === 'download' || $request->query('download')) {
            return $diskInstance->download($cleanPath, $filename);
        }

        return $diskInstance->response($cleanPath);
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
        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);

        if (in_array($type, $singleFields)) {
            if ($user->$type) {
                $cleanPath = ltrim($user->$type, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
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

            if ($removedPath) {
                $cleanPath = ltrim($removedPath, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
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

        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);

        $singleFields = ['employment_contract', 'offer_letter', 'techxaro_regulations'];

        if (in_array($type, $singleFields)) {
            if ($user->$type) {
                $cleanPath = ltrim($user->$type, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
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

            if ($removedPath) {
                $cleanPath = ltrim($removedPath, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
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
        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);
        $category = 'user_documents/' . $user->id;

        if (in_array($type, $singleFields)) {
            // Delete old file if exists
            if ($user->$type) {
                $cleanPath = ltrim($user->$type, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
            }

            // Store new file
            if ($org) {
                $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
                $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
            } else {
                $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs($category, $filename, 'public');
            }

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
            if ($oldPath) {
                $cleanPath = ltrim($oldPath, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
            }

            // Upload new file
            if ($org) {
                $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                $newPath = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
            } else {
                $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                $newPath = $file->storeAs($category, $filename, 'public');
            }
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
        $org = $request->attributes->get('currentOrganization');
        $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
        $diskInstance = Storage::disk($disk);
        $category = 'user_documents/' . $user->id;

        if (in_array($type, $singleFields)) {
            if ($user->$type) {
                $cleanPath = ltrim($user->$type, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
            }

            if ($org) {
                $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
                $path = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
            } else {
                $filename = $type . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs($category, $filename, 'public');
            }

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
            if ($oldPath) {
                $cleanPath = ltrim($oldPath, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if ($diskInstance->exists($cleanPath)) $diskInstance->delete($cleanPath); } catch (\Exception $e) {}
            }

            if ($org) {
                $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                $newPath = \App\Services\StorageDiskResolver::store($org, $file, $category, $filename);
            } else {
                $filename = 'other_document_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
                $newPath = $file->storeAs($category, $filename, 'public');
            }
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
            'project_ids' => 'nullable|array',
            'project_ids.*' => 'integer|exists:projects,id',
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

        // Attach guest to selected projects immediately upon creation
        $projectIds = $request->input('project_ids', $request->input('projects', []));
        if (is_string($projectIds)) {
            $projectIds = json_decode($projectIds, true) ?: explode(',', $projectIds);
        }
        if (! empty($projectIds) && is_array($projectIds)) {
            $projectIds = array_values(array_filter(array_map('intval', $projectIds)));
            $projects = Project::whereIn('id', $projectIds)->get();
            foreach ($projects as $proj) {
                $assignedUsers = (array) ($proj->assigned_users ?? []);
                if (! in_array((int) $user->id, array_map('intval', $assignedUsers))) {
                    $assignedUsers[] = (int) $user->id;
                    $proj->assigned_users = array_values(array_unique(array_map('intval', $assignedUsers)));
                }
                $guestIds = (array) ($proj->guest_ids ?? []);
                if (! in_array((int) $user->id, array_map('intval', $guestIds))) {
                    $guestIds[] = (int) $user->id;
                    $proj->guest_ids = array_values(array_unique(array_map('intval', $guestIds)));
                }
                $proj->save();
            }
        }

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
            if ($user->avatar) {
                $org = $request->attributes->get('currentOrganization');
                $disk = $org ? \App\Services\StorageDiskResolver::getDisk($org) : 'public';
                $cleanPath = ltrim($user->avatar, '/');
                if (str_starts_with($cleanPath, 'storage/')) $cleanPath = substr($cleanPath, 8);
                try { if (Storage::disk($disk)->exists($cleanPath)) Storage::disk($disk)->delete($cleanPath); } catch (\Exception $e) {}
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
     * FEATURE: Update authenticated user's desktop & email notification preferences.
     * 
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
   public function updateNotificationPreferences(Request $request)
{
    $user = $request->user();

    // Validate and save the preferences array into the JSON column
    $validated = $request->validate([
        'notification_preferences' => 'required|array',
    ]);

    $user->notification_preferences = $validated['notification_preferences'];
    $user->save();

    return response()->json([
        'message' => 'Preferences saved successfully',
        'user' => $user
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