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

        $taskStats = Task::where('assigned_to', $user->id)
            ->selectRaw('COUNT(*) as total_assigned')
            ->selectRaw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed")
            ->selectRaw("COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pending")
            ->first();

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
                'father_name' => $user->father_name,
                'id_card_number' => $user->id_card_number,
                'present_address' => $user->present_address,
                'permanent_address' => $user->permanent_address,
                'emergency_contact_name' => $user->emergency_contact_name,
                'emergency_contact_relation' => $user->emergency_contact_relation,
                'emergency_contact_phone' => $user->emergency_contact_phone,
                'personal_email' => $user->personal_email,
                'professional_email_password' => $user->professional_email_password,
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
                'latest_education_cert' => $user->latest_education_cert,
                'cv' => $user->cv,
                'previous_exp_letter' => $user->previous_exp_letter,
                'previous_salary_slip' => $user->previous_salary_slip,
                'other_document' => $user->other_document,
                'last_login_at' => $user->last_login_at?->toDateTimeString(),
                'created_at' => $user->created_at->toDateTimeString(),
                'updated_at' => $user->updated_at->toDateTimeString(),
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
                'status' => $user->active ? 'Active' : 'Resigned',
                'last_login' => $user->last_login_at?->toDateTimeString() ?? 'Never logged in',
            ],
        ]);
    }

    /**
     * UPDATE OWN PROFILE - Any authenticated user can update their own profile.
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
            'professional_email_password' => 'nullable|string|max:255',
            'recovery_email' => 'nullable|email|max:255',
            'department' => 'nullable|string|max:255',
            'designation' => 'nullable|string|max:255',
            'hired_for' => 'nullable|string|max:255',
            'employee_code' => 'nullable|string|max:64',
            'job_started_date' => 'nullable|date',
            'job_ended_date' => 'nullable|date',
            'gross_salary' => 'nullable|numeric|min:0',
            'applied_via' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:64',
            'bank_account_title' => 'nullable|string|max:255',
        ]);

        $fields = [
            'name', 'father_name', 'id_card_number',
            'phone_number', 'present_address', 'permanent_address',
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

        if ($request->has('phone_number')) {
            $user->contact_no = $request->input('phone_number');
        }
        if ($request->has('present_address')) {
            $user->address = $request->input('present_address');
        }

        $user->save();

        $documentFields = [
            'employment_contract', 'offer_letter', 'techxaro_regulations',
            'latest_education_cert', 'cv', 'previous_exp_letter',
            'previous_salary_slip', 'other_document',
        ];

        foreach ($documentFields as $field) {
            if ($request->hasFile($field)) {
                if ($user->$field && \Storage::disk('public')->exists($user->$field)) {
                    \Storage::disk('public')->delete($user->$field);
                }
                $file = $request->file($field);
                $filename = $field . '_' . time() . '_' . $file->getClientOriginalName();
                $path = $file->storeAs('user_documents/' . $user->id, $filename, 'public');
                $user->$field = $path;
            }
        }

        $user->save();

        return response()->json([
            'status' => true,
            'message' => 'Profile updated successfully',
            'user' => $user,
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