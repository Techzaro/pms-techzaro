<?php

/**
 * Controller responsible for authentication actions such as login, logout, and password changes.
 */

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\Task;
use App\Models\Project;

/**
 * Controller responsible for authentication actions.
 * Handles login, logout, and password update operations.
 */
class AuthController extends Controller
{
    /**
     * LOGIN
     *
     * Validate user credentials and generate a Sanctum token.
     */
    public function login(Request $request)
    {
        try {
            // validation
            $request->validate([
                'email' => 'required|email',
                'password' => 'required'
            ]);

            // credentials
            $credentials = $request->only('email', 'password');

            // check login
            if (!Auth::attempt($credentials)) {
                return response()->json([
                    'status' => false,
                    'message' => 'Invalid Email or Password'
                ], 401);
            }

            // logged in user
            $user = Auth::user();

            if ($user->active === false) {
                return response()->json([
                    'status' => false,
                    'message' => 'Your account has been resigned. You no longer have access to the system. Please contact your administrator.'
                ], 403);
            }

            // generate token
            $token = $user->createToken('auth_token')->plainTextToken;

            // Track last login
            $user->update(['last_login_at' => now()]);

            // Normalize role (teamlead → team_lead)
            $role = $user->role === 'teamlead' ? 'team_lead' : $user->role;

            return response()->json([
                'status' => true,
                'message' => 'Login successful',
                'token' => $token,
                'role' => $role,
                'must_change_password' => $user->must_change_password,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $role,
                    'active' => $user->active,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Server Error'
            ], 500);
        }
    }

    /**
     * LOGOUT
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'status' => true,
            'message' => 'Logout successful'
        ]);
    }

    /**
     * FIRST-TIME PASSWORD CHANGE - No old password required.
     */
    public function firstTimeChangePassword(Request $request)
    {
        try {
            $request->validate([
                'new_password' => 'required|min:6',
            ]);

            $user = $request->user();

            $user->password = bcrypt($request->new_password);
            $user->must_change_password = false;
            $user->save();

            return response()->json([
                'status' => true,
                'message' => 'Password changed successfully. Please login with your new password.'
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Server Error'
            ], 500);
        }
    }

    /**
     * MY PROFILE - Return current user's full profile with stats.
     */
    public function myProfile(Request $request)
    {
        $user = $request->user();

        $totalAssignedTasks = Task::where('assigned_to', $user->id)->count();
        $completedTasks = Task::where('assigned_to', $user->id)
            ->where('status', 'completed')
            ->count();
        $pendingTasks = Task::where('assigned_to', $user->id)
            ->whereIn('status', ['pending', 'in_progress'])
            ->count();
        $totalProjects = Project::where('created_by', $user->id)->count();

        $loginHistory = [];
        if ($user->last_login_at) {
            $loginHistory[] = [
                'login_at' => $user->last_login_at->toDateTimeString(),
                'ip_address' => null,
            ];
        }

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
            'login_history' => $loginHistory,
            'account' => [
                'account_age' => $user->created_at->diffForHumans(),
                'days_since_creation' => $user->created_at->diffInDays(now()),
                'status' => $user->active ? 'Active' : 'Resigned',
                'last_login' => $user->last_login_at?->toDateTimeString() ?? 'Never logged in',
            ],
        ]);
    }

    /**
     * CHANGE PASSWORD - Verify old password then update.
     */
    public function changePassword(Request $request)
    {
        try {
            $request->validate([
                'old_password' => 'required',
                'new_password' => 'required|min:6',
            ]);

            $user = $request->user();

            if (!Hash::check($request->old_password, $user->password)) {
                return response()->json([
                    'status' => false,
                    'message' => 'Current password is incorrect.'
                ], 422);
            }

            $user->password = bcrypt($request->new_password);
            $user->save();

            // Revoke all other tokens on password change for security
            $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete();

            return response()->json([
                'status' => true,
                'message' => 'Password changed successfully'
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Server Error'
            ], 500);
        }
    }
}