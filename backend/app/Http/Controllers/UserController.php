<?php

/**
 * Controller for administration and user account management.
 */

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Task;
use App\Models\Project;
use App\Mail\UserCreated;
use App\Mail\UserResigned;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * User management controller.
 * Handles listing, creating, updating, and deleting users.
 */
class UserController extends Controller
{
    private array $documentFields = [
        'employment_contract',
        'offer_letter',
        'techxaro_regulations',
        'latest_education_cert',
        'cv',
        'previous_exp_letter',
        'previous_salary_slip',
        'other_document',
    ];

    /**
     * Return a list of all users with full profile fields.
     */
    public function index()
    {
        $users = User::orderBy('created_at', 'desc')->get();

        return response()->json([
            'users' => $users,
        ]);
    }

    /**
     * Return a single user by ID.
     */
    public function show(User $user)
    {
        return response()->json([
            'user' => $user,
        ]);
    }

    /**
     * Create a new user account with auto-generated password and file uploads.
     */
    public function store(Request $request)
    {
        $this->normalizeEmptyStrings($request);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
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
            'personal_email' => 'nullable|email|max:255',
            'professional_email_password' => 'nullable|string|max:255',
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'required|string|max:255',
            'designation' => 'required|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'required|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date|after_or_equal:job_started_date',
            'gross_salary' => 'nullable|numeric|min:0',
            'applied_via' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:64',
            'bank_account_title' => 'nullable|string|max:255',
        ]);

        $plainPassword = Str::random(10);
        $role = $request->input('role') === 'teamlead' ? 'team_lead' : $request->input('role');

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => Hash::make($plainPassword),
            'role' => $role,
            'active' => true,
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
            'professional_email_password' => $request->input('professional_email_password'),
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

        $loginUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));

        $emailSent = false;
        $emailError = null;

        try {
            Mail::to($user->email)->send(new UserCreated($user, $plainPassword, $loginUrl));
            $emailSent = true;
            Log::info("Email sent successfully to {$user->email} for user ID {$user->id}");
        } catch (\Throwable $e) {
            $emailError = $e->getMessage();
            Log::error("Failed to send email to {$user->email}: " . $e->getMessage(), [
                'user_id' => $user->id,
                'user_email' => $user->email,
                'user_name' => $user->name,
                'exception' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
        }

        $message = $emailSent
            ? 'User created successfully and email sent to ' . $user->email
            : 'User created successfully. Email sending failed: ' . $emailError;

        return response()->json([
            'status' => true,
            'message' => $message,
            'user' => $user,
            'email_sent' => $emailSent,
        ], 201);
    }

    /**
     * Update user details and handle file uploads.
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
            'professional_email_password' => 'nullable|string|max:255',
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'sometimes|required|string|max:255',
            'designation' => 'sometimes|required|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'sometimes|required|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date',
            'gross_salary' => 'nullable|numeric|min:0',
            'applied_via' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:64',
            'bank_account_title' => 'nullable|string|max:255',
        ]);

        $authUser = $request->user();

        if ($authUser->id === $user->id) {
            return response()->json([
                'status' => false,
                'message' => 'You cannot modify your own account.',
            ], 403);
        }

        if ($user->active === false) {
            return response()->json([
                'status' => false,
                'message' => 'Resigned users cannot be modified.',
            ], 403);
        }

        if ($authUser->role === 'manager' && in_array($user->role, ['admin', 'manager'])) {
            return response()->json([
                'status' => false,
                'message' => 'Managers cannot modify administrators or other managers.',
            ], 403);
        }

        if ($authUser->role === 'manager' && $request->has('role') && in_array($request->input('role'), ['admin', 'manager'])) {
            return response()->json([
                'status' => false,
                'message' => 'Managers cannot assign admin or manager roles.',
            ], 403);
        }

        $fields = [
            'name', 'email', 'role', 'active',
            'father_name', 'id_card_number', 'phone_number',
            'present_address', 'permanent_address',
            'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
            'personal_email', 'professional_email_password', 'recovery_email',
            'department', 'designation', 'hired_for', 'employee_code',
            'job_started_date', 'job_ended_date',
            'gross_salary', 'applied_via',
            'bank_name', 'bank_account_number', 'bank_account_title',
        ];

        foreach ($fields as $field) {
            if ($request->has($field)) {
                $user->$field = $request->input($field);
            }
        }

        // Sync legacy fields
        if ($request->has('phone_number')) {
            $user->contact_no = $request->input('phone_number');
        }
        if ($request->has('present_address')) {
            $user->address = $request->input('present_address');
        }

        // Normalize role
        if ($user->role === 'teamlead') {
            $user->role = 'team_lead';
        }

        $user->save();

        // Handle file uploads
        $this->handleFileUploads($request, $user);

        return response()->json([
            'status' => true,
            'message' => 'User updated successfully',
            'user' => $user,
        ]);
    }

    /**
     * Delete a user from the system.
     */
    public function destroy(User $user)
    {
        // Delete associated files
        $this->deleteAllFiles($user);

        $user->delete();

        return response()->json([
            'status' => true,
            'message' => 'User deleted successfully',
        ]);
    }

    /**
     * Resign a user - set active to false and send notification email.
     */
    public function resign(Request $request, User $user)
    {
        try {
            $authUser = $request->user();

            if ($authUser->id === $user->id) {
                return response()->json([
                    'status' => false,
                    'message' => 'You cannot resign yourself.',
                ], 403);
            }

            if ($user->active === false) {
                return response()->json([
                    'status' => false,
                    'message' => 'This user is already resigned.',
                ], 422);
            }

            if ($authUser->role === 'manager' && in_array($user->role, ['admin', 'manager'])) {
                return response()->json([
                    'status' => false,
                    'message' => 'Managers cannot resign administrators or other managers.',
                ], 403);
            }

            $user->active = false;
            $user->save();

            $user->tokens()->delete();

            Log::info("User {$user->id} ({$user->email}) resigned by {$authUser->id} ({$authUser->email})");

            $emailSent = false;
            $emailError = null;

            try {
                Mail::to($user->email)->send(new UserResigned($user, $authUser->name));
                $emailSent = true;
                Log::info("Resignation email sent to {$user->email}");
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

            return response()->json([
                'status' => true,
                'message' => $message,
                'user' => $user,
                'email_sent' => $emailSent,
            ]);

        } catch (\Throwable $e) {
            Log::error("Resignation failed for user {$user->id}: " . $e->getMessage());
            return response()->json([
                'status' => false,
                'message' => 'Failed to resign user. Please try again.',
            ], 500);
        }
    }

    /**
     * Return a simplified user list for team assignment.
     */
    public function getTeamUsers(Request $request)
    {
        $users = User::select('id', 'name', 'email', 'role')
            ->where('active', true)
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }

    /**
     * Return full user profile with statistics and metadata.
     */
    public function profile($id)
    {
        $user = User::findOrFail($id);

        $totalAssignedTasks = Task::where('assigned_to', $user->id)->count();
        $completedTasks = Task::where('assigned_to', $user->id)
            ->where('status', 'completed')
            ->count();
        $pendingTasks = Task::where('assigned_to', $user->id)
            ->whereIn('status', ['pending', 'in_progress'])
            ->count();

        $totalProjects = Project::where('created_by', $user->id)->count();

        $projects = Project::where('created_by', $user->id)
            ->with(['tasks' => function ($query) use ($user) {
                $query->where('assigned_to', $user->id);
            }])
            ->get()
            ->map(function ($project) {
                $completed = $project->tasks->where('status', 'completed')->count();
                $pending = $project->tasks->where('status', '!=', 'completed')->count();
                return [
                    'id' => $project->id,
                    'name' => $project->name,
                    'status' => $project->status ?? 'active',
                    'total_tasks' => $project->tasks->count(),
                    'completed_tasks' => $completed,
                    'pending_tasks' => $pending,
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

        return response()->json([
            'user' => $user->only([
                'id', 'name', 'email', 'role', 'active',
                'father_name', 'id_card_number', 'phone_number', 'contact_no',
                'present_address', 'permanent_address', 'address',
                'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
                'personal_email', 'recovery_email',
                'department', 'designation', 'hired_for', 'employee_code',
                'job_started_date', 'job_ended_date',
                'gross_salary', 'applied_via',
                'bank_name', 'bank_account_number', 'bank_account_title',
                'employment_contract', 'offer_letter', 'techxaro_regulations',
                'latest_education_cert', 'cv', 'previous_exp_letter',
                'previous_salary_slip', 'other_document',
                'last_login_at', 'created_at', 'updated_at',
            ]),
            'stats' => [
                'total_assigned_tasks' => $totalAssignedTasks,
                'completed_tasks' => $completedTasks,
                'pending_tasks' => $pendingTasks,
                'total_projects' => $totalProjects,
            ],
            'projects' => $projects,
            'login_history' => $loginHistory,
            'account' => [
                'account_age' => $accountAge,
                'days_since_creation' => $daysSinceCreation,
                'status' => $user->active ? 'Active' : 'Resigned',
                'last_login' => $user->last_login_at?->toDateTimeString() ?? 'Never logged in',
            ],
        ]);
    }

    /**
     * Serve a user document file for viewing/downloading.
     */
    public function downloadDocument(Request $request, User $user, string $document)
    {
        if (!in_array($document, $this->documentFields)) {
            return response()->json(['message' => 'Invalid document field.'], 404);
        }

        $path = $user->$document;

        if (!$path) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        $fullPath = storage_path('app/public/' . $path);

        if (!file_exists($fullPath)) {
            return response()->json(['message' => 'File not found on disk.'], 404);
        }

        $mimeType = mime_content_type($fullPath);
        $filename = basename($path);

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => ($request->query('action') === 'download')
                ? 'attachment; filename="' . $filename . '"'
                : 'inline; filename="' . $filename . '"',
        ]);
    }

    /**
     * Convert empty strings to null for proper nullable validation.
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
     * Handle file uploads for a user and store paths in database.
     */
    private function handleFileUploads(Request $request, User $user): void
    {
        foreach ($this->documentFields as $field) {
            if ($request->hasFile($field)) {
                // Delete old file if exists
                if ($user->$field && Storage::disk('public')->exists($user->$field)) {
                    Storage::disk('public')->delete($user->$field);
                }

                $file = $request->file($field);
                $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');

                $user->$field = $path;
            }
        }

        $user->save();
    }

    /**
     * Delete all files associated with a user.
     */
    private function deleteAllFiles(User $user): void
    {
        foreach ($this->documentFields as $field) {
            if ($user->$field && Storage::disk('public')->exists($user->$field)) {
                Storage::disk('public')->delete($user->$field);
            }
        }
    }

    /**
     * Download a document for the authenticated user (self-access).
     */
    public function downloadMyDocument(Request $request, string $document)
    {
        $user = $request->user();

        if (!in_array($document, $this->documentFields)) {
            return response()->json(['message' => 'Invalid document field.'], 404);
        }

        $path = $user->$document;

        if (!$path) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        $fullPath = storage_path('app/public/' . $path);

        if (!file_exists($fullPath)) {
            return response()->json(['message' => 'File not found on disk.'], 404);
        }

        $mimeType = mime_content_type($fullPath);
        $filename = basename($path);

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => ($request->query('action') === 'download')
                ? 'attachment; filename="' . $filename . '"'
                : 'inline; filename="' . $filename . '"',
        ]);
    }

    /**
     * Test email sending functionality.
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
        $loginUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));

        try {
            Mail::to($testUser->email)->send(new UserCreated($testUser, $plainPassword, $loginUrl));
            Log::info("Test email sent successfully to {$testUser->email}");

            return response()->json([
                'status' => true,
                'message' => 'Test email sent successfully. Check your inbox.',
            ]);
        } catch (\Throwable $e) {
            Log::error("Test email failed: " . $e->getMessage(), [
                'exception' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            return response()->json([
                'status' => false,
                'message' => 'Email sending failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}
