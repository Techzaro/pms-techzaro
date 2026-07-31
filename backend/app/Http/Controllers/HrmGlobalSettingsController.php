<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HrmGlobalSettingsController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    // 1. Fetch Global Settings
    public function getSettings(Request $request)
    {
        $settings = DB::table('hrm_global_settings')->pluck('value', 'key');
        return response()->json([
            'success' => true,
            'settings' => $settings
        ]);
    }

    // 2. Update Global Settings (Admin)
    public function updateSettings(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $input = $request->except(['_token']);
        foreach ($input as $key => $val) {
            $valStr = is_array($val) ? json_encode($val) : (string)$val;
            DB::table('hrm_global_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $valStr, 'updated_at' => now()]
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Global HRM Settings updated successfully ✔'
        ]);
    }

    // 3. Fetch Timesheets
    public function getTimesheets(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $query = DB::table('hrm_timesheets')
            ->join('users', 'users.id', '=', 'hrm_timesheets.user_id')
            ->select(
                'hrm_timesheets.*',
                'users.name as user_name',
                'users.email as user_email',
                'users.department'
            );

        if ($user->role === 'member') {
            $query->where('hrm_timesheets.user_id', $user->id);
        }

        $timesheets = $query->orderBy('hrm_timesheets.id', 'desc')->get();

        return response()->json([
            'success' => true,
            'timesheets' => $timesheets
        ]);
    }

    // 4. Generate Monthly Timesheet
    public function generateTimesheet(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $monthYear = $request->input('period_name', date('F Y'));
        $currentMonth = date('Y-m');

        $attendances = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', 'like', "{$currentMonth}%")
            ->get();

        $workedMins = $attendances->sum('work_duration_minutes');
        $overtimeMins = $attendances->sum('overtime_minutes');

        $userTasks = DB::table('tasks')
            ->where('assigned_to', $user->id)
            ->get();

        $pmsSeconds = $userTasks->sum(fn($t) => $t->total_work_seconds ?: ($t->elapsed_seconds ?: 0));

        $workedHours = round($workedMins / 60, 2);
        $overtimeHours = round($overtimeMins / 60, 2);
        $pmsHours = round($pmsSeconds / 3600, 2);

        $existing = DB::table('hrm_timesheets')
            ->where('user_id', $user->id)
            ->where('period_name', $monthYear)
            ->first();

        if ($existing) {
            DB::table('hrm_timesheets')->where('id', $existing->id)->update([
                'total_worked_hours' => $workedHours,
                'total_overtime_hours' => $overtimeHours,
                'pms_project_hours' => $pmsHours,
                'status' => 'Submitted',
                'updated_at' => now(),
            ]);
            $id = $existing->id;
        } else {
            $id = DB::table('hrm_timesheets')->insertGetId([
                'user_id' => $user->id,
                'period_type' => 'Monthly',
                'period_name' => $monthYear,
                'start_date' => date('Y-m-01'),
                'end_date' => date('Y-m-t'),
                'total_worked_hours' => $workedHours,
                'total_break_hours' => 0,
                'total_overtime_hours' => $overtimeHours,
                'pms_project_hours' => $pmsHours,
                'status' => 'Submitted',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "Monthly Timesheet ({$monthYear}) generated & submitted for approval ✔",
            'timesheet_id' => $id
        ]);
    }

    // 5. Respond / Approve Timesheet (Admin)
    public function respondTimesheet(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status', 'Approved');

        DB::table('hrm_timesheets')->where('id', $id)->update([
            'status' => $status,
            'approved_by' => $user->id,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "Timesheet status updated to {$status} ✔"
        ]);
    }
}
