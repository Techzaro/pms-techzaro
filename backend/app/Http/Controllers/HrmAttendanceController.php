<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;

class HrmAttendanceController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    public const STANDARDIZED_LEAVE_TYPES = [
        'Annual Leave',
        'Casual Leave',
        'Sick Leave',
        'Medical Leave',
        'Maternity Leave',
        'Paternity Leave',
        'Bereavement Leave',
        'Comp Off',
        'Half Day',
        'Hourly Leave',
        'Unpaid Leave',
        'Study Leave',
        'Marriage Leave',
        'Business Trip',
    ];

    // 1. Clock In
    public function clockIn(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $nowTime = date('H:i:s');

        return DB::transaction(function () use ($user, $today, $nowTime, $request) {
            $existing = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', $today)
                ->first();

            $workMode = $request->input('work_mode', 'Office');
            $lat = $request->input('latitude');
            $lng = $request->input('longitude');
            $address = $request->input('location_address', 'Office Location');

            $activePolicy = DB::table('hrm_shift_templates')->where('is_active', true)->first();
            $lateThreshold = $activePolicy ? ($activePolicy->late_threshold ?: '09:15:00') : '09:15:00';

            $status = ($nowTime > $lateThreshold) ? 'Late' : 'Present';

            if ($existing) {
                $clockInTime = $existing->clock_in ?: $nowTime;
                DB::table('hrm_attendances')->where('id', $existing->id)->update([
                    'clock_in' => $clockInTime,
                    'clock_out' => null,
                    'work_mode' => $workMode,
                    'latitude' => $lat ?: $existing->latitude,
                    'longitude' => $lng ?: $existing->longitude,
                    'location_address' => $address ?: $existing->location_address,
                    'status' => ($existing->status === 'Paused' ? 'Paused' : $status),
                    'ip_address' => $request->ip(),
                    'updated_at' => now(),
                ]);
                $attendanceId = $existing->id;
            } else {
                $clockInTime = $nowTime;
                $attendanceId = DB::table('hrm_attendances')->insertGetId([
                    'user_id' => $user->id,
                    'date' => $today,
                    'clock_in' => $nowTime,
                    'clock_out' => null,
                    'work_mode' => $workMode,
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'location_address' => $address,
                    'status' => $status,
                    'ip_address' => $request->ip(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Evaluate late warnings count for policy enforcement
            \App\Http\Controllers\HrmWarningController::evaluateLateWarningsForUser($user->id);

            return response()->json([
                'success' => true,
                'message' => "Duty Session Active ({$status}) ✔",
                'data' => [
                    'attendance_id' => $attendanceId,
                    'clock_in' => $clockInTime,
                    'clock_out' => null,
                    'work_mode' => $workMode,
                    'status' => $existing && $existing->status === 'Paused' ? 'Paused' : $status,
                ]
            ]);
        });
    }

    // 2. Pause Work Session
    public function pauseWork(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');

        return DB::transaction(function () use ($user, $today, $request) {
            $attendance = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', $today)
                ->first();

            if (!$attendance || !$attendance->clock_in) {
                return response()->json(['success' => false, 'message' => 'No active clock-in session found for today.'], 422);
            }

            $breakId = DB::table('hrm_work_breaks')->insertGetId([
                'attendance_id' => $attendance->id,
                'user_id' => $user->id,
                'paused_at' => now(),
                'reason' => $request->input('reason', 'Scheduled Work Break'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('hrm_attendances')->where('id', $attendance->id)->update([
                'status' => 'Paused',
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Work session paused. Break duration logged.',
                'data' => ['break_id' => $breakId, 'status' => 'Paused']
            ]);
        });
    }

    // 3. Resume Work Session
    public function resumeWork(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');

        return DB::transaction(function () use ($user, $today) {
            $attendance = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', $today)
                ->first();

            if (!$attendance) {
                return response()->json(['success' => false, 'message' => 'No attendance session found.'], 422);
            }

            $openBreak = DB::table('hrm_work_breaks')
                ->where('attendance_id', $attendance->id)
                ->whereNull('resumed_at')
                ->orderBy('id', 'desc')
                ->first();

            if ($openBreak) {
                $pausedTs = strtotime($openBreak->paused_at);
                $resumedTs = time();
                $breakMinutes = max(0, round(($resumedTs - $pausedTs) / 60));

                DB::table('hrm_work_breaks')->where('id', $openBreak->id)->update([
                    'resumed_at' => now(),
                    'break_duration_minutes' => $breakMinutes,
                    'updated_at' => now(),
                ]);
            }

            $activePolicy = DB::table('hrm_shift_templates')->where('is_active', true)->first();
            $lateThreshold = $activePolicy ? ($activePolicy->late_threshold ?: '09:15:00') : '09:15:00';
            $status = ($attendance->clock_in > $lateThreshold) ? 'Late' : 'Present';

            DB::table('hrm_attendances')->where('id', $attendance->id)->update([
                'status' => $status,
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Work session resumed! Active time tracking continues.',
                'data' => ['status' => $status]
            ]);
        });
    }

    // 4. Clock Out
    public function clockOut(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $nowTime = date('H:i:s');

        return DB::transaction(function () use ($user, $today, $nowTime) {
            $attendance = DB::table('hrm_attendances')
                ->where('user_id', $user->id)
                ->where('date', $today)
                ->first();

            if (!$attendance || !$attendance->clock_in) {
                return response()->json(['success' => false, 'message' => 'No active clock-in session found for today.'], 422);
            }

            $openBreaks = DB::table('hrm_work_breaks')
                ->where('attendance_id', $attendance->id)
                ->whereNull('resumed_at')
                ->get();

            foreach ($openBreaks as $b) {
                $pausedTs = strtotime($b->paused_at);
                $resumedTs = time();
                $breakMinutes = max(0, round(($resumedTs - $pausedTs) / 60));
                DB::table('hrm_work_breaks')->where('id', $b->id)->update([
                    'resumed_at' => now(),
                    'break_duration_minutes' => $breakMinutes,
                    'updated_at' => now(),
                ]);
            }

            $totalBreakMinutes = DB::table('hrm_work_breaks')
                ->where('attendance_id', $attendance->id)
                ->sum('break_duration_minutes');

            $clockInTs = strtotime("{$today} {$attendance->clock_in}");
            $clockOutTs = strtotime("{$today} {$nowTime}");
            $grossMinutes = max(0, round(($clockOutTs - $clockInTs) / 60));
            $netMinutes = max(0, $grossMinutes - $totalBreakMinutes);

            $activePolicy = DB::table('hrm_shift_templates')->where('is_active', true)->first();
            $targetWeekly = $activePolicy ? (float)$activePolicy->weekly_hours : 40.0;
            $standardDailyShiftMins = round(($targetWeekly / 5.0) * 60);

            $overtimeMinutes = max(0, $netMinutes - $standardDailyShiftMins);

            DB::table('hrm_attendances')->where('id', $attendance->id)->update([
                'clock_out' => $nowTime,
                'work_duration_minutes' => $netMinutes,
                'overtime_minutes' => $overtimeMinutes,
                'status' => 'Completed',
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Clock-Out logged successfully. Session locked.',
                'data' => [
                    'clock_out' => $nowTime,
                    'work_duration_minutes' => $netMinutes,
                    'total_break_minutes_deducted' => $totalBreakMinutes,
                    'status' => 'Completed'
                ]
            ]);
        });
    }

    // 5. Update Screen Capture Consent (Toggle ON / OFF)
    public function updateConsent(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $agreed = $request->input('agreed', true);

        DB::table('users')->where('id', $user->id)->update([
            'screen_consent_agreed' => (bool)$agreed,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => $agreed ? 'Screen monitoring consent enabled ✔' : 'Screen monitoring consent disabled (Privacy Mode) ✔',
            'screen_consent_agreed' => (bool)$agreed
        ]);
    }

    // 6. Get Today Attendance Overview
    public function getTodayAttendance(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');

        $activePolicy = DB::table('hrm_shift_templates')->where('is_active', 1)->orderBy('updated_at', 'desc')->first()
            ?: DB::table('hrm_shift_templates')->orderBy('id', 'asc')->first();
        if ($activePolicy) {
            $activePolicy->is_active = true;
        }

        $users = User::select(
            'id',
            'name',
            'email',
            'role',
            'department',
            'designation',
            'phone_number',
            'contact_no',
            'gross_salary',
            'screen_consent_agreed'
        )
        ->orderBy('name')
        ->get()
        ->unique('id')
        ->values()
        ->map(function ($u) {
            $offer = DB::table('hrm_offer_letters')
                ->where('candidate_email', $u->email)
                ->orderBy('id', 'desc')
                ->first();

            $u->accepted_offer_stipend = $offer ? (float)$offer->base_salary : null;
            $u->stipend = (float)($offer?->base_salary ?: ($u->gross_salary ?: 3500));
            return $u;
        });

        $attendances = DB::table('hrm_attendances')->where('date', $today)->get()->map(function ($att) use ($today) {
            $totalBreakMins = DB::table('hrm_work_breaks')->where('attendance_id', $att->id)->sum('break_duration_minutes');

            $openBreak = DB::table('hrm_work_breaks')->where('attendance_id', $att->id)->whereNull('resumed_at')->orderBy('id', 'desc')->first();
            if ($openBreak) {
                $totalBreakMins += max(0, round((time() - strtotime($openBreak->paused_at)) / 60));
            }

            if ($att->clock_in && !$att->clock_out) {
                $grossMins = max(0, round((time() - strtotime("{$today} {$att->clock_in}")) / 60));
                $att->work_duration_minutes = max(0, $grossMins - $totalBreakMins);
            }
            $att->total_break_minutes = $totalBreakMins;
            return $att;
        });

        $wfhRequests = DB::table('hrm_wfh_requests')->where('request_date', $today)->get();
        $snapshots = DB::table('hrm_work_snapshots')->whereDate('captured_at', $today)->orderBy('captured_at', 'desc')->get();
        $leaves = DB::table('hrm_leave_requests')->where('start_date', '<=', $today)->where('end_date', '>=', $today)->get();

        return response()->json([
            'success' => true,
            'today' => $today,
            'activePolicy' => $activePolicy,
            'users' => $users,
            'attendances' => $attendances,
            'wfhRequests' => $wfhRequests,
            'snapshots' => $snapshots,
            'leaves' => $leaves,
        ]);
    }

    // 7. Get Leaves List
    public function getLeaves(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $leaves = DB::table('hrm_leave_requests')
            ->join('users', 'hrm_leave_requests.user_id', '=', 'users.id')
            ->leftJoin('users as reviewer', 'hrm_leave_requests.approved_by', '=', 'reviewer.id')
            ->select(
                'hrm_leave_requests.*',
                'users.name as user_name',
                'users.email as user_email',
                'users.department',
                'reviewer.name as reviewer_name'
            )
            ->orderBy('hrm_leave_requests.created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'leaves' => $leaves, 'standardized_types' => self::STANDARDIZED_LEAVE_TYPES]);
    }

    // 8. Submit Leave Request
    public function storeLeaveRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $request->validate([
            'leave_type' => 'required|string',
            'start_date' => 'required|date',
            'end_date' => 'required|date',
            'reason' => 'required|string',
        ]);

        return DB::transaction(function () use ($user, $request) {
            $start = strtotime($request->start_date);
            $end = strtotime($request->end_date);
            $totalDays = max(1, round(($end - $start) / (60 * 60 * 24)) + 1);

            $id = DB::table('hrm_leave_requests')->insertGetId([
                'user_id' => $user->id,
                'leave_type' => $request->leave_type,
                'start_date' => $request->start_date,
                'end_date' => $request->end_date,
                'total_days' => $totalDays,
                'reason' => $request->reason,
                'status' => 'Pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Leave application submitted successfully to HR for real-time review ✔',
                'data' => ['leave_id' => $id, 'total_days' => $totalDays]
            ]);
        });
    }

    // 9. Respond to Leave Request
    public function respondLeaveRequest(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status', 'Approved');
        $rejectionReason = $request->input('rejection_reason');

        return DB::transaction(function () use ($id, $status, $user, $rejectionReason) {
            DB::table('hrm_leave_requests')->where('id', $id)->update([
                'status' => $status,
                'approved_by' => $user->id,
                'rejection_reason' => $rejectionReason,
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => "Leave application {$status} ✔"
            ]);
        });
    }

    // 10. Get Attendance Corrections List
    public function getCorrections(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $corrections = DB::table('hrm_attendance_corrections')
            ->join('users', 'hrm_attendance_corrections.user_id', '=', 'users.id')
            ->select('hrm_attendance_corrections.*', 'users.name as user_name', 'users.email as user_email')
            ->orderBy('hrm_attendance_corrections.created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'corrections' => $corrections]);
    }

    // 11. Submit Attendance Correction
    public function submitCorrection(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $id = DB::table('hrm_attendance_corrections')->insertGetId([
            'user_id' => $user->id,
            'date' => $request->input('date'),
            'requested_clock_in' => $request->input('requested_clock_in'),
            'requested_clock_out' => $request->input('requested_clock_out'),
            'work_mode' => $request->input('work_mode', 'Office'),
            'reason' => $request->input('reason'),
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Correction request submitted.', 'data' => ['id' => $id]]);
    }

    // 12. Respond to Attendance Correction
    public function respondCorrection(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status', 'Approved');

        DB::table('hrm_attendance_corrections')->where('id', $id)->update([
            'status' => $status,
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => "Correction request {$status} ✔"]);
    }

    // 13. Submit WFH Request
    public function submitWfhRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $requestDate = $request->input('request_date', date('Y-m-d'));
        $reason = $request->input('reason') ?: ($request->input('subject') ? $request->input('subject') . ': ' . $request->input('details') : 'Remote WFH Request');

        $id = DB::table('hrm_wfh_requests')->insertGetId([
            'user_id' => $user->id,
            'request_date' => $requestDate,
            'reason' => $reason,
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        try {
            DB::table('hrm_notifications')->insert([
                'user_id' => $user->id,
                'type' => 'WFH Request',
                'title' => '🏡 New Work From Home Request',
                'message' => "Employee {$user->name} ({$user->department}) requested WFH for {$requestDate}.",
                'is_read' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Exception $e) {
            // ignore missing columns if any
        }

        return response()->json(['success' => true, 'message' => 'Work From Home request submitted to HR in real-time ✔', 'data' => ['id' => $id]]);
    }

    // 14. Respond WFH Request
    public function respondWfhRequest(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status', 'Approved');

        DB::table('hrm_wfh_requests')->where('id', $id)->update([
            'status' => $status,
            'rejection_reason' => $request->input('rejection_reason'),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => "WFH request {$status} ✔"]);
    }

    // 15. Upload Work Snapshot
    public function uploadWorkSnapshot(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $att = DB::table('hrm_attendances')->where('user_id', $user->id)->where('date', $today)->first();

        $id = DB::table('hrm_work_snapshots')->insertGetId([
            'user_id' => $user->id,
            'attendance_id' => $att ? $att->id : null,
            'snapshot_data' => $request->input('snapshot_data'),
            'notes' => $request->input('notes', 'Auto Screen Snapshot'),
            'captured_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Snapshot captured.', 'data' => ['id' => $id]]);
    }

    // 16. Get Full History of All Requests (Leaves, WFH, Corrections, Screen Requests, Warning Removals, Member Forms)
    public function getRequestsHistory(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $corrections = DB::table('hrm_attendance_corrections')
            ->join('users', 'hrm_attendance_corrections.user_id', '=', 'users.id')
            ->select('hrm_attendance_corrections.*', 'users.name as user_name', 'users.email as user_email', 'users.department')
            ->orderBy('hrm_attendance_corrections.created_at', 'desc')
            ->get();

        $leaves = DB::table('hrm_leave_requests')
            ->join('users', 'hrm_leave_requests.user_id', '=', 'users.id')
            ->leftJoin('users as reviewer', 'hrm_leave_requests.approved_by', '=', 'reviewer.id')
            ->select('hrm_leave_requests.*', 'users.name as user_name', 'users.email as user_email', 'users.department', 'reviewer.name as reviewer_name')
            ->orderBy('hrm_leave_requests.created_at', 'desc')
            ->get();

        $wfhRequests = DB::table('hrm_wfh_requests')
            ->join('users', 'hrm_wfh_requests.user_id', '=', 'users.id')
            ->select('hrm_wfh_requests.*', 'users.name as user_name', 'users.email as user_email', 'users.department')
            ->orderBy('hrm_wfh_requests.created_at', 'desc')
            ->get();

        $screenRequests = DB::table('hrm_screen_requests')
            ->join('users', 'hrm_screen_requests.user_id', '=', 'users.id')
            ->leftJoin('users as requester', 'hrm_screen_requests.requested_by', '=', 'requester.id')
            ->select('hrm_screen_requests.*', 'users.name as user_name', 'users.email as user_email', 'users.department', 'requester.name as requester_name')
            ->orderBy('hrm_screen_requests.created_at', 'desc')
            ->get();

        $warningRemovals = DB::table('hrm_warnings')
            ->join('users', 'hrm_warnings.user_id', '=', 'users.id')
            ->leftJoin('users as admin', 'hrm_warnings.removed_by', '=', 'admin.id')
            ->select('hrm_warnings.*', 'users.name as user_name', 'users.email as user_email', 'users.department', 'admin.name as removed_by_name')
            ->orderBy('hrm_warnings.created_at', 'desc')
            ->get();

        $memberRequests = DB::table('hrm_member_requests')
            ->join('users', 'hrm_member_requests.user_id', '=', 'users.id')
            ->select('hrm_member_requests.*', 'users.name as user_name', 'users.email as user_email', 'users.department')
            ->orderBy('hrm_member_requests.created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'corrections' => $corrections,
            'leaves' => $leaves,
            'wfhRequests' => $wfhRequests,
            'screenRequests' => $screenRequests,
            'warningRemovals' => $warningRemovals,
            'memberRequests' => $memberRequests,
        ]);
    }

    /**
     * HR / Admin Manual Attendance Entry & Override Method
     */
    public function markManualAttendance(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'date' => 'required|date',
            'status' => 'required|string',
        ]);

        $targetUserId = $request->user_id;
        $date = $request->date;
        $status = $request->status;
        $workMode = $request->input('work_mode', ($status === 'WFH' ? 'WFH' : 'Office'));
        $clockIn = $request->input('clock_in', '09:00:00');
        $clockOut = $request->input('clock_out', '17:00:00');
        $notes = $request->input('notes', 'Manually recorded by HR/Management.');

        $workMins = 480;
        if ($clockIn && $clockOut) {
            $tIn = strtotime("{$date} {$clockIn}");
            $tOut = strtotime("{$date} {$clockOut}");
            if ($tOut > $tIn) {
                $workMins = round(($tOut - $tIn) / 60);
            }
        }

        $existing = DB::table('hrm_attendances')
            ->where('user_id', $targetUserId)
            ->where('date', $date)
            ->first();

        if ($existing) {
            DB::table('hrm_attendances')->where('id', $existing->id)->update([
                'clock_in' => $clockIn,
                'clock_out' => $clockOut,
                'work_mode' => $workMode,
                'status' => $status,
                'work_duration_minutes' => $workMins,
                'location_address' => "HR Manual Entry ({$notes})",
                'updated_at' => now(),
            ]);
            $attId = $existing->id;
        } else {
            $attId = DB::table('hrm_attendances')->insertGetId([
                'user_id' => $targetUserId,
                'date' => $date,
                'clock_in' => $clockIn,
                'clock_out' => $clockOut,
                'work_mode' => $workMode,
                'status' => $status,
                'work_duration_minutes' => $workMins,
                'location_address' => "HR Manual Entry ({$notes})",
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        \App\Http\Controllers\HrmWarningController::evaluateLateWarningsForUser($targetUserId);

        return response()->json([
            'success' => true,
            'message' => "Manual attendance record saved successfully for Employee ✔",
            'attendance_id' => $attId
        ]);
    }
}
