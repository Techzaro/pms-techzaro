<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use App\Models\HrmCandidate;
use App\Models\HrmOfferLetter;

class HrmMemberPortalController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    // Get Member HRM Portal Dashboard Summary
    public function getMemberDashboardSummary(Request $request)
    {
        try {
            $user = $this->resolveAuth($request);
            if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

            $currentYear = date('Y');
            $currentMonth = date('Y-m');
            $today = date('Y-m-d');
            $weekStart = date('Y-m-d', strtotime('monday this week'));

            // Active Working Policy Template
            $shiftPolicy = DB::table('hrm_shift_templates')->where('is_active', 1)->orderBy('updated_at', 'desc')->first()
                ?: DB::table('hrm_shift_templates')->orderBy('id', 'asc')->first();
            if ($shiftPolicy) {
                $shiftPolicy->is_active = true;
            }
            $policyGraceMins = $shiftPolicy ? $shiftPolicy->grace_minutes : 15;
            $policyWeeklyTarget = $shiftPolicy ? (float)$shiftPolicy->weekly_hours : 40.0;

            // Total working days in month based on 5-Day Work Week (Monday to Friday)
            $daysInMonth = date('t');
            $workingDays = 0;
            for ($d = 1; $d <= $daysInMonth; $d++) {
                $dayOfWeek = date('N', strtotime(date("Y-m-{$d}")));
                if ($dayOfWeek >= 1 && $dayOfWeek <= 5) {
                    $workingDays++;
                }
            }

            $standardMonthlyHours = round($workingDays * ($policyWeeklyTarget / 5.0), 1);

            // Fetch Employee Accepted Offer Letter Stipend / Base Salary (Bulletproof query)
            $cand = HrmCandidate::where('email', $user->email)->first();
            $offerQuery = HrmOfferLetter::where('candidate_email', $user->email);
            if ($cand) {
                $offerQuery->orWhere('candidate_id', $cand->id);
            }
            $offer = $offerQuery->first();

            $acceptedStipend = 0;
            if ($offer && $offer->base_salary > 0) {
                $acceptedStipend = (float)$offer->base_salary;
            } elseif (!empty($user->gross_salary) && $user->gross_salary > 0) {
                $acceptedStipend = (float)$user->gross_salary;
            } else {
                $acceptedStipend = 3500.00;
            }

            $hourlyCostRate = round($acceptedStipend / max(1, $standardMonthlyHours), 2);

            // Attendance stats
            $monthAttendances = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', 'like', "{$currentMonth}%")
                ->get();

            $weekAttendances = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', '>=', $weekStart)
                ->get();

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

            $approvedLeavesCount = $approvedLeaves->sum('total_days');

            $wfhApprovedCount = DB::table('hrm_wfh_requests')
                ->where('user_id', $user->id)
                ->where('status', 'Approved')
                ->where('request_date', 'like', "{$currentMonth}%")
                ->count();

            $leaveHistory = DB::table('hrm_leave_requests')
                ->leftJoin('users as reviewer', 'hrm_leave_requests.approved_by', '=', 'reviewer.id')
                ->where('hrm_leave_requests.user_id', $user->id)
                ->select('hrm_leave_requests.*', 'reviewer.name as reviewer_name')
                ->orderBy('hrm_leave_requests.created_at', 'desc')
                ->get();

            $latestLeaveDecision = DB::table('hrm_leave_requests')
                ->leftJoin('users as reviewer', 'hrm_leave_requests.approved_by', '=', 'reviewer.id')
                ->where('hrm_leave_requests.user_id', $user->id)
                ->whereIn('hrm_leave_requests.status', ['Approved', 'Rejected'])
                ->orderBy('hrm_leave_requests.updated_at', 'desc')
                ->select('hrm_leave_requests.*', 'reviewer.name as reviewer_name')
                ->first();

            $monthWorkMins = $monthAttendances->sum('work_duration_minutes');
            $weekWorkMins = $weekAttendances->sum('work_duration_minutes');

            $monthlyHours = round($monthWorkMins / 60, 1);
            $weeklyHours = round($weekWorkMins / 60, 1);

            $todayAtt = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', $today)
                ->first();

            // Compute Live Active Work Seconds for Session Persistence
            $todayWorkSeconds = 0;
            if ($todayAtt && $todayAtt->clock_in) {
                $totalBreakMins = DB::table('hrm_work_breaks')->where('attendance_id', $todayAtt->id)->sum('break_duration_minutes');
                $openBreak = DB::table('hrm_work_breaks')->where('attendance_id', $todayAtt->id)->whereNull('resumed_at')->orderBy('id', 'desc')->first();
                if ($openBreak) {
                    $totalBreakMins += max(0, round((time() - strtotime($openBreak->paused_at)) / 60));
                }

                if ($todayAtt->clock_out) {
                    $todayWorkSeconds = max(0, ($todayAtt->work_duration_minutes ?: 0) * 60);
                } else {
                    $grossSecs = max(0, time() - strtotime("{$today} {$todayAtt->clock_in}"));
                    $todayWorkSeconds = max(0, $grossSecs - ($totalBreakMins * 60));
                }
            }

            $todayHours = round($todayWorkSeconds / 3600, 1);
            $remainingWeeklyHours = max(0, round($policyWeeklyTarget - $weeklyHours, 1));

            $elapsedWorkingDays = max(1, min(date('j'), $workingDays));
            $attendancePercentage = round(min(100.0, ($presentCount / $elapsedWorkingDays) * 100), 1);

            $wfhToday = DB::table('hrm_wfh_requests')
                ->where('user_id', $user->id)
                ->where('request_date', $today)
                ->orderBy('id', 'desc')
                ->first();

            $salarySlips = DB::table('hrm_salary_slips')
                ->where('user_id', $user->id)
                ->orderBy('id', 'desc')
                ->get();

            if ($salarySlips->isEmpty()) {
                DB::table('hrm_salary_slips')->insert([
                    'user_id' => $user->id,
                    'month_year' => date('F Y'),
                    'basic_salary' => $acceptedStipend * 0.7,
                    'allowances' => $acceptedStipend * 0.3,
                    'deductions' => 0.00,
                    'net_salary' => $acceptedStipend,
                    'status' => 'Paid',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $salarySlips = DB::table('hrm_salary_slips')->where('user_id', $user->id)->get();
            }

                        // Consolidated Applications Aggregation across all HRM tables for member
            $allRequests = \App\Models\HrmMemberRequest::with(['type', 'history.performedBy'])
                ->where('employee_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(function ($r) {
                    $r->table_type = 'Member Request';
                    $r->category = $r->type ? $r->type->name : 'Member Request';
                    $r->category_name = $r->category;
                    $r->subject = $r->title;
                    $r->details = $r->description;
                    
                    // Get latest admin remark
                    $latestHistory = $r->history->where('action', 'Status Updated')->first();
                    $r->admin_remark = $latestHistory ? $latestHistory->comments : null;
                    $r->reviewer_name = $latestHistory && $latestHistory->performedBy ? $latestHistory->performedBy->name : null;
                    
                    return $r;
                });

            $memberRequests = $allRequests;
            $leaveHistory = $allRequests;

            $customDocuments = DB::table('hrm_employee_documents')
                ->where(function ($q) use ($user) {
                    $q->where('user_id', $user->id)->orWhere('user_email', $user->email);
                })
                ->get();

            // PMS Tasks & Projects Hourly Breakdown
            $userTasks = DB::table('tasks')
                ->where('assigned_to', $user->id)
                ->select('id', 'project_id', 'title', 'total_work_seconds', 'elapsed_seconds', 'status')
                ->get();

            $projectIds = $userTasks->pluck('project_id')->filter()->unique();
            $projects = DB::table('projects')
                ->whereIn('id', $projectIds)
                ->pluck('title', 'id');

            $pmsProjectBreakdown = [];
            $pmsTotalSeconds = 0;

            foreach ($userTasks->groupBy('project_id') as $pId => $tasks) {
                $pName = $projects[$pId] ?? ($pId ? "Project #{$pId}" : "Internal Tasks");
                $pSecs = $tasks->sum(function ($t) {
                    return (int)($t->elapsed_seconds ?: $t->total_work_seconds);
                });
                $pmsTotalSeconds += $pSecs;

                $pmsProjectBreakdown[] = [
                    'project_id' => $pId,
                    'project_name' => $pName,
                    'total_seconds' => $pSecs,
                    'total_hours' => round($pSecs / 3600, 1),
                    'tasks' => $tasks->map(function ($t) {
                        $tSecs = (int)($t->elapsed_seconds ?: $t->total_work_seconds);
                        return [
                            'id' => $t->id,
                            'title' => $t->title,
                            'seconds' => $tSecs,
                            'hours' => round($tSecs / 3600, 1),
                            'status' => $t->status,
                        ];
                    })->values()->toArray(),
                ];
            }

            $upcomingHolidays = [
                ['title' => 'Independence Day', 'date' => '2026-08-14', 'day' => 'Friday'],
                ['title' => 'Defense Day', 'date' => '2026-09-06', 'day' => 'Sunday'],
                ['title' => 'Iqbal Day', 'date' => '2026-11-09', 'day' => 'Monday'],
                ['title' => 'Quaid-e-Azam Day', 'date' => '2026-12-25', 'day' => 'Friday'],
            ];

            // Run automatic warning evaluation for member
            \App\Http\Controllers\HrmWarningController::evaluateLateWarningsForUser($user->id);

            $memberWarnings = DB::table('hrm_warnings')
                ->where('user_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get();

            $activeWarning = $memberWarnings->whereIn('status', ['Active', 'Removal Requested'])->first();

            return response()->json([
                'success' => true,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'department' => $user->department,
                    'designation' => $user->designation,
                    'screen_consent_agreed' => (bool)$user->screen_consent_agreed,
                ],
                'todayAttendance' => $todayAtt,
                'today_work_seconds' => $todayWorkSeconds,
                'activePolicy' => $shiftPolicy,
                'warnings' => $memberWarnings,
                'activeWarning' => $activeWarning,
                'summary' => [
                    'month_name' => date('F Y'),
                    'present_days' => $presentCount,
                    'late_days' => $lateCount,
                    'max_late_allowed' => $shiftPolicy && isset($shiftPolicy->max_late_allowed) ? (int)$shiftPolicy->max_late_allowed : 3,
                    'late_threshold' => $shiftPolicy ? ($shiftPolicy->late_threshold ?: '09:15:00') : '09:15:00',
                    'wfh_days' => $wfhApprovedCount,
                    'leave_days' => $approvedLeavesCount,
                    'absent_days' => max(0, $elapsedWorkingDays - ($presentCount + $approvedLeavesCount)),
                    'attendance_percentage' => $attendancePercentage,
                    'total_work_hours' => $monthlyHours,
                    'today_work_hours' => $todayHours,
                    'weekly_work_hours' => $weeklyHours,
                    'remaining_weekly_hours' => $remainingWeeklyHours,
                    'policy_weekly_target' => $policyWeeklyTarget,
                    'accepted_stipend' => $acceptedStipend,
                    'hourly_cost_rate' => $hourlyCostRate,
                ],
                'offerLetter' => $offer ? [
                    'candidate_name' => $offer->candidate_name,
                    'base_salary' => (float)$offer->base_salary,
                    'employment_type' => $offer->employment_type,
                    'joining_date' => $offer->joining_date,
                    'status' => $offer->status,
                ] : null,
                'wfhToday' => $wfhToday,
                'leaveHistory' => $leaveHistory,
                'latestLeaveDecision' => $latestLeaveDecision,
                'pmsProjectBreakdown' => $pmsProjectBreakdown,
                'pmsTotalHours' => round($pmsTotalSeconds / 3600, 1),
                'upcomingHolidays' => $upcomingHolidays,
                'salarySlips' => $salarySlips,
                'memberRequests' => $memberRequests,
                'customDocuments' => $customDocuments,
            ]);
        } catch (\Throwable $e) {
            Log::error('Member Dashboard Summary Error: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine());
            return response()->json([
                'success' => false,
                'message' => 'Failed to load member dashboard: ' . $e->getMessage(),
                'error_file' => $e->getFile() . ':' . $e->getLine()
            ], 500);
        }
    }

    // Submit HR Member Request Form
    public function submitMemberRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $request->validate([
            'application_type_id' => 'required|exists:hrm_application_types,id',
            'title' => 'required|string',
            'dynamic_fields' => 'nullable|array',
        ]);

        try {
            DB::beginTransaction();

            $appType = \App\Models\HrmApplicationType::find($request->application_type_id);
            $prefix = $appType && $appType->slug ? strtoupper(substr($appType->slug, 0, 3)) : 'REQ';
            $requestNumber = $prefix . '-' . date('Ymd') . '-' . rand(1000, 9999);

            $memberRequest = \App\Models\HrmMemberRequest::create([
                'organization_id' => $user->organization_id,
                'employee_id' => $user->id,
                'application_type_id' => $request->application_type_id,
                'request_number' => $requestNumber,
                'title' => $request->title,
                'description' => $request->description,
                'status' => 'Pending',
                'submitted_at' => now(),
            ]);

                        if ($request->has('dynamic_fields') && is_array($request->dynamic_fields)) {
                foreach ($request->dynamic_fields as $fieldName => $fieldValue) {
                    $valueToSave = $fieldValue;
                    if ($request->hasFile("dynamic_fields.{$fieldName}")) {
                        $file = $request->file("dynamic_fields.{$fieldName}");
                        $path = $file->store('hrm/member_requests', 'public');
                        $valueToSave = '/storage/' . $path;
                    } elseif (is_array($fieldValue)) {
                        $valueToSave = json_encode($fieldValue);
                    }
                    
                    \App\Models\HrmMemberRequestField::create([
                        'organization_id' => $user->organization_id,
                        'request_id' => $memberRequest->id,
                        'field_name' => $fieldName,
                        'field_value' => $valueToSave,
                    ]);
                }
            }
            }

            \App\Models\HrmRequestHistory::create([
                'organization_id' => $user->organization_id,
                'request_id' => $memberRequest->id,
                'performed_by' => $user->id,
                'action' => 'Submitted',
                'new_status' => 'Pending',
                'comments' => 'Application submitted by employee.',
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Application submitted successfully',
                'data' => ['request_id' => $memberRequest->id]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Submit Member Request Error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to submit application'], 500);
        }
    }

    // Submit Attendance Correction Request
    public function storeCorrectionRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $request->validate([
            'date' => 'required|date',
            'requested_clock_in' => 'required',
            'reason' => 'required|string',
        ]);

        $id = DB::table('hrm_attendance_corrections')->insertGetId([
            'user_id' => $user->id,
            'date' => $request->date,
            'requested_clock_in' => $request->requested_clock_in,
            'requested_clock_out' => $request->input('requested_clock_out'),
            'work_mode' => $request->input('work_mode', 'Office'),
            'reason' => $request->reason,
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \App\Services\HrmAuditLogger::log('Attendance Correction', $id, $user, 'Application Submitted', null, 'Pending', $request->reason, [], $request);

        return response()->json([
            'success' => true,
            'message' => 'Attendance Correction Request submitted successfully for HR approval ✔',
            'data' => ['correction_id' => $id]
        ]);
    }
}


