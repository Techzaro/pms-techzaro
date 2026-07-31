<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Models\HrmOfferLetter;
use App\Models\HrmCandidate;

class HrmMemberPortalController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    // 1. Get Member Dashboard Summary Data (HRM 2.0 Global Workforce Intelligence)
    public function getMemberDashboardSummary(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $currentYear = date('Y');
        $currentMonth = date('Y-m');
        $today = date('Y-m-d');
        $weekStart = date('Y-m-d', strtotime('monday this week'));

        // Total working days in month based on 5-Day Work Week (Monday to Friday)
        $daysInMonth = date('t');
        $workingDays = 0;
        for ($d = 1; $d <= $daysInMonth; $d++) {
            $dayOfWeek = date('N', strtotime(date("Y-m-{$d}")));
            if ($dayOfWeek >= 1 && $dayOfWeek <= 5) { // 5 days/week (Mon-Fri)
                $workingDays++;
            }
        }

        // Attendance stats for current month
        $monthAttendances = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', 'like', "{$currentMonth}%")
            ->get();

        // Attendance stats for current week
        $weekAttendances = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', '>=', $weekStart)
            ->get();

        // Attendance stats for current year
        $yearAttendances = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', 'like', "{$currentYear}%")
            ->get();

        $presentCount = $monthAttendances->whereIn('status', ['Present', 'Late', 'Completed'])->count();
        $lateCount = $monthAttendances->where('status', 'Late')->count();

        $approvedLeaves = DB::table('hrm_leave_requests')
            ->where('user_id', $user->id)
            ->where('status', 'Approved')
            ->where('start_date', 'like', "{$currentMonth}%")
            ->get();

        $rejectedLeavesCount = DB::table('hrm_leave_requests')
            ->where('user_id', $user->id)
            ->where('status', 'Rejected')
            ->where('start_date', 'like', "{$currentMonth}%")
            ->sum('total_days');

        $approvedLeavesCount = $approvedLeaves->sum('total_days');

        $wfhApprovedCount = DB::table('hrm_wfh_requests')
            ->where('user_id', $user->id)
            ->where('status', 'Approved')
            ->where('request_date', 'like', "{$currentMonth}%")
            ->count();

        $monthWorkMins = $monthAttendances->sum('work_duration_minutes');
        $weekWorkMins = $weekAttendances->sum('work_duration_minutes');
        $yearWorkMins = $yearAttendances->sum('work_duration_minutes');

        $monthlyHours = round($monthWorkMins / 60, 1);
        $weeklyHours = round($weekWorkMins / 60, 1);
        $yearlyHours = round($yearWorkMins / 60, 1);

        $todayAtt = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        $todayHours = $todayAtt ? round(($todayAtt->work_duration_minutes ?: 0) / 60, 1) : 0.0;
        $remainingWeeklyHours = max(0, round(40.0 - $weeklyHours, 1));

        $elapsedWorkingDays = max(1, min(date('j'), $workingDays));
        $attendancePercentage = round(min(100.0, ($presentCount / $elapsedWorkingDays) * 100), 1);

        $absentCount = max(0, $elapsedWorkingDays - ($presentCount + $approvedLeavesCount));

        // Active WFH request today (fetch latest ID)
        $wfhToday = DB::table('hrm_wfh_requests')
            ->where('user_id', $user->id)
            ->where('request_date', $today)
            ->orderBy('id', 'desc')
            ->first();

        // Salary Slips
        $salarySlips = DB::table('hrm_salary_slips')
            ->where('user_id', $user->id)
            ->orderBy('id', 'desc')
            ->get();

        if ($salarySlips->isEmpty()) {
            $gross = $user->gross_salary ?: 85000;
            DB::table('hrm_salary_slips')->insert([
                'user_id' => $user->id,
                'month_year' => date('F Y'),
                'basic_salary' => $gross * 0.7,
                'allowances' => $gross * 0.3,
                'deductions' => 0.00,
                'net_salary' => $gross,
                'status' => 'Paid',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $salarySlips = DB::table('hrm_salary_slips')->where('user_id', $user->id)->get();
        }

        // Recent Member Requests
        $memberRequests = DB::table('hrm_member_requests')
            ->where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get();

        // Offer Letter if applicable
        $cand = HrmCandidate::where('email', $user->email)->orWhere('user_id', $user->id)->first();
        $offer = HrmOfferLetter::where('candidate_email', $user->email)
            ->orWhere(function ($q) use ($cand) {
                if ($cand) $q->where('candidate_id', $cand->id);
            })->first();

        $customDocuments = DB::table('hrm_employee_documents')
            ->where('user_id', $user->id)
            ->orWhere('user_email', $user->email)
            ->get();

        // PMS Tasks & Projects Hourly Breakdown Calculation
        $userTasks = DB::table('tasks')
            ->where('assigned_to', $user->id)
            ->select('id', 'project_id', 'title', 'total_work_seconds', 'elapsed_seconds', 'status')
            ->get();

        $projectIds = $userTasks->pluck('project_id')->filter()->unique();
        $projects = DB::table('projects')
            ->whereIn('id', $projectIds)
            ->pluck('name', 'id');

        $pmsProjectBreakdown = [];
        $pmsTotalSeconds = 0;

        foreach ($userTasks->groupBy('project_id') as $pId => $tasks) {
            $pName = $projects[$pId] ?? ($pId ? "Project #{$pId}" : "Internal Tasks");
            $pSecs = $tasks->sum(fn($t) => $t->total_work_seconds ?: ($t->elapsed_seconds ?: 0));
            $pmsTotalSeconds += $pSecs;

            $taskList = $tasks->map(function ($t) {
                $tSecs = $t->total_work_seconds ?: ($t->elapsed_seconds ?: 0);
                return [
                    'id' => $t->id,
                    'title' => $t->title,
                    'hours' => round($tSecs / 3600, 1),
                    'status' => $t->status,
                ];
            })->values();

            $pmsProjectBreakdown[] = [
                'project_id' => $pId,
                'project_name' => $pName,
                'total_hours' => round($pSecs / 3600, 1),
                'tasks' => $taskList,
            ];
        }

        $pmsTotalHours = round($pmsTotalSeconds / 3600, 1);
        $billableHours = round($pmsTotalHours * 0.85, 1);
        $nonBillableHours = round($pmsTotalHours * 0.15, 1);

        // Public Holidays Calendar
        $upcomingHolidays = [
            ['title' => 'Labor Day / May Day', 'date' => 'May 01, 2026', 'day' => 'Friday'],
            ['title' => 'Independence Day', 'date' => 'August 14, 2026', 'day' => 'Friday'],
            ['title' => 'Quaid-e-Azam Day & Christmas', 'date' => 'December 25, 2026', 'day' => 'Friday'],
        ];

        return response()->json([
            'success' => true,
            'user' => $user,
            'summary' => [
                'month_name' => date('F Y'),
                'total_working_days' => $workingDays,
                'present_days' => $presentCount,
                'late_days' => $lateCount,
                'absent_days' => $absentCount,
                'leave_days' => $approvedLeavesCount,
                'rejected_leave_days' => $rejectedLeavesCount,
                'wfh_days' => $wfhApprovedCount,
                'today_hours' => $todayHours,
                'weekly_hours' => $weeklyHours,
                'total_work_hours' => $monthlyHours,
                'yearly_hours' => $yearlyHours,
                'remaining_weekly_hours' => $remainingWeeklyHours,
                'attendance_percentage' => $attendancePercentage,
                'productivity_score' => 95.5,
                'utilization_rate' => 88.0,
                'billable_hours' => $billableHours,
                'non_billable_hours' => $nonBillableHours,
                'pms_total_hours' => $pmsTotalHours,
                'leave_balance' => [
                    'casual' => 12,
                    'sick' => 10,
                    'annual' => 14,
                    'taken' => $approvedLeavesCount,
                ]
            ],
            'pmsProjectBreakdown' => $pmsProjectBreakdown,
            'upcomingHolidays' => $upcomingHolidays,
            'wfhToday' => $wfhToday,
            'todayAttendance' => $todayAtt,
            'salarySlips' => $salarySlips,
            'memberRequests' => $memberRequests,
            'offerLetter' => $offer,
            'candidate' => $cand,
            'customDocuments' => $customDocuments,
        ]);
    }

    // 2. Submit HR Request Form
    public function submitHrForm(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $request->validate([
            'category' => 'required|string',
            'subject' => 'required|string',
            'details' => 'required|string',
        ]);

        $id = DB::table('hrm_member_requests')->insertGetId([
            'user_id' => $user->id,
            'category' => $request->category,
            'subject' => $request->subject,
            'details' => $request->details,
            'priority' => $request->input('priority', 'Medium'),
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($request->category === 'WFH Request') {
            DB::table('hrm_wfh_requests')->insert([
                'user_id' => $user->id,
                'request_date' => date('Y-m-d'),
                'reason' => $request->details,
                'status' => 'Pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'HR Request submitted successfully to HR team ✔',
            'id' => $id
        ]);
    }
}
