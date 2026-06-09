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
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * User management controller.
 * Handles listing, creating, updating, and deleting users.
 */
class UserController extends Controller
{
    /**
     * Return a list of all users with full profile fields.
     */
    public function index()
    {
        $users = User::select('id', 'name', 'email', 'role', 'active', 'contact_no', 'address', 'department', 'designation', 'employee_code', 'created_at')
            ->where('active', true)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'users' => $users,
        ]);
    }

    /**
     * Create a new user account with auto-generated password and send email.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'role' => ['required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
            'contact_no' => 'required|string|max:32',
            'address' => 'required|string|max:500',
            'department' => 'required|string|max:255',
            'designation' => 'required|string|max:255',
            'employee_code' => 'required|string|max:64',
        ]);

        $plainPassword = Str::random(10);

        // Normalize role (teamlead → team_lead)
        $role = $request->input('role') === 'teamlead' ? 'team_lead' : $request->input('role');

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => Hash::make($plainPassword),
            'role' => $role,
            'active' => true,
            'must_change_password' => true,
            'contact_no' => $request->input('contact_no'),
            'address' => $request->input('address'),
            'department' => $request->input('department'),
            'designation' => $request->input('designation'),
            'employee_code' => $request->input('employee_code'),
        ]);

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
     * Update user details (role, active, and profile fields).
     */
    public function update(Request $request, User $user)
    {
        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['sometimes', 'required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
            'active' => ['sometimes', 'boolean'],
            'contact_no' => 'sometimes|required|string|max:32',
            'address' => 'sometimes|required|string|max:500',
            'department' => 'sometimes|required|string|max:255',
            'designation' => 'sometimes|required|string|max:255',
            'employee_code' => 'sometimes|required|string|max:64',
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

        if ($authUser->role === 'manager' && $user->role === 'admin') {
            return response()->json([
                'status' => false,
                'message' => 'Managers cannot modify administrators.',
            ], 403);
        }

        $fields = ['name', 'email', 'role', 'active', 'contact_no', 'address', 'department', 'designation', 'employee_code'];

        foreach ($fields as $field) {
            if ($request->has($field)) {
                $user->$field = $request->input($field);
            }
        }

        // Normalize role (teamlead → team_lead)
        if ($user->role === 'teamlead') {
            $user->role = 'team_lead';
        }

        $user->save();

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

            // Cannot resign yourself
            if ($authUser->id === $user->id) {
                return response()->json([
                    'status' => false,
                    'message' => 'You cannot resign yourself.',
                ], 403);
            }

            // Already resigned
            if ($user->active === false) {
                return response()->json([
                    'status' => false,
                    'message' => 'This user is already resigned.',
                ], 422);
            }

            // Manager cannot resign admin
            if ($authUser->role === 'manager' && $user->role === 'admin') {
                return response()->json([
                    'status' => false,
                    'message' => 'Managers cannot resign administrators.',
                ], 403);
            }

            // Set user as resigned
            $user->active = false;
            $user->save();

            // Force logout - delete all user tokens
            $user->tokens()->delete();

            Log::info("User {$user->id} ({$user->email}) resigned by {$authUser->id} ({$authUser->email})");

            // Send resignation email
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
        $user = User::with([])->findOrFail($id);

        // Total assigned tasks
        $totalAssignedTasks = Task::where('assigned_to', $user->id)->count();

        // Completed tasks
        $completedTasks = Task::where('assigned_to', $user->id)
            ->where('status', 'completed')
            ->count();

        // Pending tasks
        $pendingTasks = Task::where('assigned_to', $user->id)
            ->whereIn('status', ['pending', 'in_progress'])
            ->count();

        // Total created projects (by this user)
        $totalProjects = Project::where('created_by', $user->id)->count();

        // Projects with deliverables summary
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

        // Login history (we only have last_login_at currently)
        $loginHistory = [];
        if ($user->last_login_at) {
            $loginHistory[] = [
                'login_at' => $user->last_login_at->toDateTimeString(),
                'ip_address' => null,
            ];
        }

        // Account status info
        $accountAge = $user->created_at->diffForHumans();
        $daysSinceCreation = $user->created_at->diffInDays(now());

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'active' => $user->active,
                'contact_no' => $user->contact_no,
                'address' => $user->address,
                'department' => $user->department,
                'designation' => $user->designation,
                'employee_code' => $user->employee_code,
                'last_login_at' => $user->last_login_at?->toDateTimeString(),
                'created_at' => $user->created_at->toDateTimeString(),
                'updated_at' => $user->updated_at->toDateTimeString(),
            ],
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
