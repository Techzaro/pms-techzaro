<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;

class HrmWarningController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    /**
     * Helper to evaluate and auto-trigger late warning for a user
     * If user has reached or exceeded max_late_allowed (default 3) late arrivals past grace period.
     */
    /**
     * Helper to evaluate and auto-trigger late warning for a user.
     * Respects Admin warning removal cutoff: once a warning is removed by Admin,
     * past late attendances prior to removal date are CLEARED and will NEVER re-trigger a warning.
     * Only NEW late attendances occurring AFTER removal/policy change count towards a new warning.
     */
    public static function evaluateLateWarningsForUser($userId)
    {
        $currentMonth = date('Y-m');
        $activePolicy = DB::table('hrm_shift_templates')->where('is_active', 1)->orderBy('updated_at', 'desc')->first()
            ?: DB::table('hrm_shift_templates')->orderBy('id', 'asc')->first();
        if ($activePolicy) {
            $activePolicy->is_active = true;
        }

        if (!$activePolicy) return null;

        $lateThreshold = $activePolicy->late_threshold ?: '09:15:00';
        $maxLateAllowed = isset($activePolicy->max_late_allowed) ? (int)$activePolicy->max_late_allowed : 3;

        // 1. Find latest warning removed/cleared by Admin for this user in current month cycle
        $lastRemovedWarning = DB::table('hrm_warnings')
            ->where('user_id', $userId)
            ->where('status', 'Removed')
            ->where('created_at', 'like', "{$currentMonth}%")
            ->orderBy('removed_at', 'desc')
            ->first();

        $cutoffDate = null;
        if ($lastRemovedWarning && $lastRemovedWarning->removed_at) {
            $cutoffDate = date('Y-m-d', strtotime($lastRemovedWarning->removed_at));
        }

        // 2. Query late attendances in current month strictly AFTER the removal cutoff date
        $query = DB::table('hrm_attendances')
            ->where('user_id', $userId)
            ->where('date', 'like', "{$currentMonth}%")
            ->where(function ($q) use ($lateThreshold) {
                $q->where('status', 'Late')
                  ->orWhere(function ($q2) use ($lateThreshold) {
                      $q2->whereNotNull('clock_in')->where('clock_in', '>', $lateThreshold);
                  });
            });

        if ($cutoffDate) {
            $query->where('date', '>', $cutoffDate);
        }

        $lateAttendances = $query->orderBy('date', 'asc')->get();
        $lateCount = $lateAttendances->count();

        // 3. Only issue a warning if NEW late count (since clearance) >= maxLateAllowed
        if ($lateCount >= $maxLateAllowed) {
            $existingActive = DB::table('hrm_warnings')
                ->where('user_id', $userId)
                ->whereIn('status', ['Active', 'Removal Requested'])
                ->where('created_at', 'like', "{$currentMonth}%")
                ->first();

            $lateDates = $lateAttendances->pluck('date')->toArray();

            if (!$existingActive) {
                $id = DB::table('hrm_warnings')->insertGetId([
                    'user_id' => $userId,
                    'shift_id' => $activePolicy->id,
                    'warning_type' => 'Late Arrival Policy Violation',
                    'late_count' => $lateCount,
                    'late_dates_json' => json_encode($lateDates),
                    'description' => "Candidate accumulated {$lateCount} new late arrivals past grace threshold ({$lateThreshold}) since last clearance in " . date('F Y') . ".",
                    'status' => 'Active',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Create HRM notification safely
                try {
                    DB::table('hrm_notifications')->insert([
                        'user_id' => $userId,
                        'type' => 'Warning Issued',
                        'title' => '⚠️ Attendance Policy Warning Issued',
                        'message' => "You have accumulated {$lateCount} new late arrivals past the grace threshold ({$lateThreshold}). Please submit your removal justification.",
                        'is_read' => false,
                        'read' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } catch (\Exception $e) {
                    \Illuminate\Support\Facades\Log::warning("Notification insert error: " . $e->getMessage());
                }

                return $id;
            } else {
                DB::table('hrm_warnings')
                    ->where('id', $existingActive->id)
                    ->update([
                        'late_count' => $lateCount,
                        'late_dates_json' => json_encode($lateDates),
                        'updated_at' => now(),
                    ]);

                return $existingActive->id;
            }
        }

        return null;
    }

    /**
     * 1. Get All Warnings (Admin & Member View)
     */
    public function getWarnings(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $activePolicy = DB::table('hrm_shift_templates')->where('is_active', 1)->orderBy('updated_at', 'desc')->first()
            ?: DB::table('hrm_shift_templates')->orderBy('id', 'asc')->first();
        if ($activePolicy) {
            $activePolicy->is_active = true;
        }

        // Always run an evaluation for current user
        self::evaluateLateWarningsForUser($user->id);

        $query = DB::table('hrm_warnings')
            ->join('users', 'hrm_warnings.user_id', '=', 'users.id')
            ->leftJoin('hrm_shift_templates', 'hrm_warnings.shift_id', '=', 'hrm_shift_templates.id')
            ->leftJoin('users as admin', 'hrm_warnings.removed_by', '=', 'admin.id')
            ->select(
                'hrm_warnings.*',
                'users.name as user_name',
                'users.email as user_email',
                'users.department',
                'users.designation',
                'hrm_shift_templates.name as policy_name',
                'hrm_shift_templates.late_threshold',
                'hrm_shift_templates.grace_minutes',
                'admin.name as removed_by_name'
            );

        if (!in_array($user->role, ['admin', 'manager'])) {
            // Member only sees their own warnings
            $query->where('hrm_warnings.user_id', $user->id);
        } else {
            if ($request->has('user_id') && $request->user_id) {
                $query->where('hrm_warnings.user_id', $request->user_id);
            }
            if ($request->has('status') && $request->status) {
                $query->where('hrm_warnings.status', $request->status);
            }
            if ($request->has('department') && $request->department) {
                $query->where('users.department', $request->department);
            }
        }

        $warnings = $query->orderBy('hrm_warnings.created_at', 'desc')->get();

        // Calculate summary metrics
        $activeCount = DB::table('hrm_warnings')->where('status', 'Active')->count();
        $removalRequestedCount = DB::table('hrm_warnings')->where('status', 'Removal Requested')->count();
        $removedCount = DB::table('hrm_warnings')->where('status', 'Removed')->count();

        return response()->json([
            'success' => true,
            'activePolicy' => $activePolicy,
            'warnings' => $warnings,
            'summary' => [
                'active_warnings' => $activeCount,
                'pending_removal_requests' => $removalRequestedCount,
                'removed_warnings' => $removedCount,
            ]
        ]);
    }

    /**
     * 2. Member Submit Online Reason for Warning Removal
     */
    public function submitRemovalReason(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $request->validate([
            'reason' => 'required|string|min:5',
        ]);

        $warning = DB::table('hrm_warnings')->where('id', $id)->first();
        if (!$warning) {
            return response()->json(['message' => 'Warning record not found.'], 404);
        }

        if ($warning->user_id != $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized to request removal for this warning.'], 403);
        }

        DB::table('hrm_warnings')->where('id', $id)->update([
            'status' => 'Removal Requested',
            'removal_reason' => $request->reason,
            'removal_requested_at' => now(),
            'updated_at' => now(),
        ]);

        // Send Notification to Admins safely
        try {
            $admins = User::whereIn('role', ['admin', 'manager'])->get();
            foreach ($admins as $adm) {
                DB::table('hrm_notifications')->insert([
                    'user_id' => $adm->id,
                    'candidate_name' => $user->name,
                    'type' => 'Warning Removal Request',
                    'title' => '📝 Warning Removal Reason Submitted',
                    'message' => "Employee {$user->name} ({$user->department}) submitted an online reason for warning removal.",
                    'is_read' => false,
                    'read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Notification insert error: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Online warning removal reason submitted successfully. Request sent to Admin for review ✔'
        ]);
    }

    /**
     * 3. Admin Remove Warning from Member Account (Approve Removal & Clear)
     */
    public function removeWarning(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $warning = DB::table('hrm_warnings')->where('id', $id)->first();
        if (!$warning) {
            return response()->json(['message' => 'Warning record not found.'], 404);
        }

        $adminNotes = $request->input('admin_notes', 'Warning approved for removal by Management.');

        DB::table('hrm_warnings')->where('id', $id)->update([
            'status' => 'Removed',
            'removed_by' => $user->id,
            'admin_notes' => $adminNotes,
            'removed_at' => now(),
            'updated_at' => now(),
        ]);

        // Notify member that warning was removed from their account
        try {
            DB::table('hrm_notifications')->insert([
                'user_id' => $warning->user_id,
                'candidate_name' => $user->name,
                'type' => 'Warning Removed',
                'title' => '✅ Policy Warning Removed from Account',
                'message' => "Management has reviewed your online reason and removed the policy warning from your account.",
                'is_read' => false,
                'read' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Notification insert error: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Policy warning successfully removed from member account ✔'
        ]);
    }

    /**
     * 4. Admin Reject Warning Removal Request
     */
    public function rejectRemoval(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $warning = DB::table('hrm_warnings')->where('id', $id)->first();
        if (!$warning) {
            return response()->json(['message' => 'Warning record not found.'], 404);
        }

        $adminNotes = $request->input('admin_notes', 'Removal request rejected. Reason insufficient.');

        DB::table('hrm_warnings')->where('id', $id)->update([
            'status' => 'Active',
            'admin_notes' => $adminNotes,
            'updated_at' => now(),
        ]);

        // Notify member
        try {
            DB::table('hrm_notifications')->insert([
                'user_id' => $warning->user_id,
                'candidate_name' => $user->name,
                'type' => 'Warning Removal Rejected',
                'title' => '❌ Warning Removal Request Declined',
                'message' => "Your warning removal justification was reviewed by Admin: '{$adminNotes}'. Warning remains active.",
                'is_read' => false,
                'read' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Notification insert error: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Warning removal request declined. Warning remains active.'
        ]);
    }

    /**
     * 5. Sync All Department Settings with Current Active Policy
     * "mean all department setting will be updated with current policy"
     */
    public function syncDepartmentSettings(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $shiftId = $request->input('shift_id');
        $shiftPolicy = null;

        if ($shiftId) {
            $shiftPolicy = DB::table('hrm_shift_templates')->where('id', $shiftId)->first();
        } else {
            $shiftPolicy = DB::table('hrm_shift_templates')->where('is_active', true)->first()
                ?: DB::table('hrm_shift_templates')->first();
        }

        if (!$shiftPolicy) {
            return response()->json(['message' => 'No shift policy template found.'], 422);
        }

        // Set policy active globally if requested
        if ($request->input('make_active', true)) {
            DB::table('hrm_shift_templates')->update(['is_active' => false]);
            DB::table('hrm_shift_templates')->where('id', $shiftPolicy->id)->update(['is_active' => true, 'updated_at' => now()]);
        }

        // Standard list of departments plus any existing user departments
        $dbDepts = User::whereNotNull('department')->where('department', '!=', '')->pluck('department')->toArray();
        $standardDepts = ['Engineering', 'Design', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'Management'];
        $allDepartments = array_unique(array_merge($standardDepts, $dbDepts));

        $syncedCount = 0;
        foreach ($allDepartments as $dept) {
            $existing = DB::table('hrm_department_policies')->where('department', $dept)->first();
            if ($existing) {
                DB::table('hrm_department_policies')->where('id', $existing->id)->update([
                    'shift_id' => $shiftPolicy->id,
                    'is_active' => true,
                    'policy_notes' => "Updated with current policy ({$shiftPolicy->name}) - Shift: {$shiftPolicy->shift_start}-{$shiftPolicy->shift_end}, Grace: {$shiftPolicy->grace_minutes}m, Late Threshold: " . ($shiftPolicy->late_threshold ?: '09:15:00'),
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('hrm_department_policies')->insert([
                    'department' => $dept,
                    'shift_id' => $shiftPolicy->id,
                    'is_active' => true,
                    'policy_notes' => "Updated with current policy ({$shiftPolicy->name}) - Shift: {$shiftPolicy->shift_start}-{$shiftPolicy->shift_end}, Grace: {$shiftPolicy->grace_minutes}m, Late Threshold: " . ($shiftPolicy->late_threshold ?: '09:15:00'),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            $syncedCount++;
        }

        return response()->json([
            'success' => true,
            'message' => "All {$syncedCount} department settings updated with current policy ({$shiftPolicy->name}) ✔",
            'policy' => $shiftPolicy,
            'departments_synced' => $allDepartments
        ]);
    }

    /**
     * 6. Get Department Settings Matrix with Policy Details & Headcount
     */
    public function getDepartmentSettings(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $activePolicy = DB::table('hrm_shift_templates')->where('is_active', 1)->orderBy('updated_at', 'desc')->first()
            ?: DB::table('hrm_shift_templates')->orderBy('id', 'asc')->first();
        if ($activePolicy) {
            $activePolicy->is_active = true;
        }

        $deptPolicies = DB::table('hrm_department_policies')
            ->leftJoin('hrm_shift_templates', 'hrm_department_policies.shift_id', '=', 'hrm_shift_templates.id')
            ->select('hrm_department_policies.*', 'hrm_shift_templates.name as shift_name', 'hrm_shift_templates.shift_start', 'hrm_shift_templates.shift_end', 'hrm_shift_templates.grace_minutes', 'hrm_shift_templates.late_threshold', 'hrm_shift_templates.max_late_allowed')
            ->get();

        $dbDepts = User::whereNotNull('department')->where('department', '!=', '')->pluck('department')->toArray();
        $standardDepts = ['Engineering', 'Design', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'Management'];
        $allDepartments = array_unique(array_merge($standardDepts, $dbDepts));

        $matrix = [];
        foreach ($allDepartments as $dept) {
            $headcount = User::where('department', $dept)->count();
            $deptPol = $deptPolicies->where('department', $dept)->first();
            $activeWarningsCount = DB::table('hrm_warnings')
                ->join('users', 'hrm_warnings.user_id', '=', 'users.id')
                ->where('users.department', $dept)
                ->where('hrm_warnings.status', 'Active')
                ->count();

            $matrix[] = [
                'department' => $dept,
                'headcount' => $headcount,
                'active_policy_name' => $deptPol ? $deptPol->shift_name : ($activePolicy ? $activePolicy->name : 'Fixed Morning Shift'),
                'shift_start' => $deptPol ? $deptPol->shift_start : ($activePolicy ? $activePolicy->shift_start : '09:00:00'),
                'shift_end' => $deptPol ? $deptPol->shift_end : ($activePolicy ? $activePolicy->shift_end : '17:00:00'),
                'grace_minutes' => $deptPol ? $deptPol->grace_minutes : ($activePolicy ? $activePolicy->grace_minutes : 15),
                'late_threshold' => $deptPol ? $deptPol->late_threshold : ($activePolicy ? $activePolicy->late_threshold : '09:15:00'),
                'max_late_allowed' => $deptPol ? $deptPol->max_late_allowed : ($activePolicy && isset($activePolicy->max_late_allowed) ? $activePolicy->max_late_allowed : 3),
                'active_warnings' => $activeWarningsCount,
                'is_synced' => true,
            ];
        }

        return response()->json([
            'success' => true,
            'departments' => $matrix,
            'globalActivePolicy' => $activePolicy,
        ]);
    }
}
