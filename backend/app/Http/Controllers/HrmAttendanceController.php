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

    // 1. Clock In
    public function clockIn(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $nowTime = date('H:i:s');

        $existing = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        $workMode = $request->input('work_mode', 'Office');
        $lat = $request->input('latitude');
        $lng = $request->input('longitude');
        $address = $request->input('location_address', 'Office Location');

        if ($existing && $existing->clock_in) {
            DB::table('hrm_attendances')->where('id', $existing->id)->update([
                'work_mode' => $workMode,
                'latitude' => $lat ?: $existing->latitude,
                'longitude' => $lng ?: $existing->longitude,
                'location_address' => $address ?: $existing->location_address,
                'clock_out' => null,
                'ip_address' => $request->ip(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => "Work session mode updated to {$workMode} ✔. Session active.",
                'attendance_id' => $existing->id,
                'clock_in' => $existing->clock_in,
                'work_mode' => $workMode
            ]);
        }

        $shiftStart = '09:15:00';
        $status = ($nowTime > $shiftStart) ? 'Late' : 'Present';

        if ($existing) {
            DB::table('hrm_attendances')->where('id', $existing->id)->update([
                'clock_in' => $nowTime,
                'work_mode' => $workMode,
                'latitude' => $lat,
                'longitude' => $lng,
                'location_address' => $address,
                'status' => $status,
                'ip_address' => $request->ip(),
                'updated_at' => now(),
            ]);
            $attendanceId = $existing->id;
        } else {
            $attendanceId = DB::table('hrm_attendances')->insertGetId([
                'user_id' => $user->id,
                'date' => $today,
                'clock_in' => $nowTime,
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

        return response()->json([
            'success' => true,
            'message' => "Clock-In successful ({$status}) ✔",
            'attendance_id' => $attendanceId,
            'clock_in' => $nowTime
        ]);
    }

    // 2. Pause Work Session
    public function pauseWork(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $attendance = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        if (!$attendance || !$attendance->clock_in) {
            return response()->json(['message' => 'No active clock-in session found for today.'], 422);
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
            'message' => 'Work session paused. Break timer active.',
            'break_id' => $breakId
        ]);
    }

    // 3. Resume Work Session
    public function resumeWork(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $attendance = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        if (!$attendance) {
            return response()->json(['message' => 'No attendance session found.'], 422);
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

        $shiftStart = '09:15:00';
        $status = ($attendance->clock_in > $shiftStart) ? 'Late' : 'Present';

        DB::table('hrm_attendances')->where('id', $attendance->id)->update([
            'status' => $status,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Work session resumed! Active time tracking continues.',
        ]);
    }

    // 4. Clock Out (Subtracts Break Durations for Net Active Hours)
    public function clockOut(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');
        $nowTime = date('H:i:s');

        $attendance = DB::table('hrm_attendances')
            ->where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        if (!$attendance || !$attendance->clock_in) {
            return response()->json(['success' => false, 'message' => 'No active clock-in session found for today.'], 422);
        }

        // Close open breaks if any
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

        $standardShift = 480; // 8 Hours
        $overtimeMinutes = max(0, $netMinutes - $standardShift);

        DB::table('hrm_attendances')->where('id', $attendance->id)->update([
            'clock_out' => $nowTime,
            'work_duration_minutes' => $netMinutes,
            'overtime_minutes' => $overtimeMinutes,
            'status' => 'Completed',
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Clock-Out logged successfully. Good job today!',
            'clock_out' => $nowTime,
            'work_duration_minutes' => $netMinutes
        ]);
    }

    // 5. Update Screen Capture Consent
    public function updateConsent(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        DB::table('users')->where('id', $user->id)->update([
            'screen_consent_agreed' => true,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Screen monitoring consent agreement accepted ✔'
        ]);
    }

    // 6. Submit Attendance Correction / Manual Entry Request
    public function submitCorrection(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $id = DB::table('hrm_attendance_corrections')->insertGetId([
            'user_id' => $user->id,
            'date' => $request->input('date', date('Y-m-d')),
            'requested_clock_in' => $request->input('requested_clock_in', '09:00:00'),
            'requested_clock_out' => $request->input('requested_clock_out', '17:00:00'),
            'work_mode' => $request->input('work_mode', 'Office'),
            'reason' => $request->input('reason', 'Missed clock-in punch adjustment'),
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Attendance correction request submitted to HR for approval ✔',
            'correction_id' => $id
        ]);
    }

    // 7. Fetch Attendance Corrections
    public function getCorrections(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $query = DB::table('hrm_attendance_corrections')
            ->join('users', 'users.id', '=', 'hrm_attendance_corrections.user_id')
            ->select(
                'hrm_attendance_corrections.*',
                'users.name as user_name',
                'users.email as user_email'
            );

        if ($user->role === 'member') {
            $query->where('hrm_attendance_corrections.user_id', $user->id);
        }

        $corrections = $query->orderBy('hrm_attendance_corrections.id', 'desc')->get();

        return response()->json([
            'success' => true,
            'corrections' => $corrections
        ]);
    }

    // 8. Respond / Approve Attendance Correction (Admin)
    public function respondCorrection(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status', 'Approved');
        $corr = DB::table('hrm_attendance_corrections')->where('id', $id)->first();

        if (!$corr) {
            return response()->json(['message' => 'Correction record not found.'], 404);
        }

        DB::table('hrm_attendance_corrections')->where('id', $id)->update([
            'status' => $status,
            'approved_by' => $user->id,
            'updated_at' => now(),
        ]);

        if ($status === 'Approved') {
            $clockInTs = strtotime("{$corr->date} {$corr->requested_clock_in}");
            $clockOutTs = strtotime("{$corr->date} {$corr->requested_clock_out}");
            $netMins = max(0, round(($clockOutTs - $clockInTs) / 60));

            DB::table('hrm_attendances')->updateOrInsert(
                ['user_id' => $corr->user_id, 'date' => $corr->date],
                [
                    'clock_in' => $corr->requested_clock_in,
                    'clock_out' => $corr->requested_clock_out,
                    'work_mode' => $corr->work_mode,
                    'work_duration_minutes' => $netMins,
                    'status' => ($corr->requested_clock_in > '09:15:00') ? 'Late' : 'Present',
                    'updated_at' => now(),
                ]
            );
        }

        return response()->json([
            'success' => true,
            'message' => "Attendance correction updated to {$status} & applied to logs ✔"
        ]);
    }

    // 3. WFH Request Submission
    public function submitWfhRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $requestDate = $request->input('request_date', date('Y-m-d'));
        $reason = $request->input('reason', 'Remote Work Request');

        $existing = DB::table('hrm_wfh_requests')
            ->where('user_id', $user->id)
            ->where('request_date', $requestDate)
            ->first();

        if ($existing) {
            DB::table('hrm_wfh_requests')->where('id', $existing->id)->update([
                'reason' => $reason,
                'status' => 'Pending',
                'rejection_reason' => null,
                'updated_at' => now(),
            ]);
            $id = $existing->id;
        } else {
            $id = DB::table('hrm_wfh_requests')->insertGetId([
                'user_id' => $user->id,
                'request_date' => $requestDate,
                'reason' => $reason,
                'status' => 'Pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Work From Home (WFH) request submitted to HR for approval ✔',
            'wfh_request_id' => $id
        ]);
    }

    // 4. Respond to WFH Request (HR/Admin) - Approve, Reject with Reason, or Cancel
    public function respondWfhRequest(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized HR action.'], 403);
        }

        $status = $request->input('status'); // Approved, Rejected, Cancelled
        if (!in_array($status, ['Approved', 'Rejected', 'Cancelled'])) {
            return response()->json(['message' => 'Invalid status value.'], 422);
        }

        $rejectionReason = $request->input('rejection_reason', $request->input('reason'));

        $wfh = DB::table('hrm_wfh_requests')->where('id', $id)->first();

        DB::table('hrm_wfh_requests')->where('id', $id)->update([
            'status' => $status,
            'rejection_reason' => $rejectionReason,
            'approved_by' => $user->id,
            'updated_at' => now(),
        ]);

        if ($wfh) {
            DB::table('hrm_member_requests')
                ->where('user_id', $wfh->user_id)
                ->where('category', 'WFH Request')
                ->where('created_at', '>=', date('Y-m-d 00:00:00', strtotime($wfh->request_date)))
                ->update([
                    'status' => $status,
                    'hr_response' => $rejectionReason ?: "WFH Request status updated to {$status} by HR.",
                    'updated_at' => now(),
                ]);
        }

        return response()->json([
            'success' => true,
            'message' => "WFH Request status updated to {$status} successfully!"
        ]);
    }

    // 5. Upload Screen Snapshot / Work Proof (Stores ONLY latest image of the day)
    public function uploadWorkSnapshot(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $snapshotData = $request->input('snapshot_data');
        if (!$snapshotData) {
            return response()->json(['message' => 'No snapshot image payload received.'], 422);
        }

        $today = date('Y-m-d');
        $att = DB::table('hrm_attendances')->where('user_id', $user->id)->where('date', $today)->first();
        $wfh = DB::table('hrm_wfh_requests')->where('user_id', $user->id)->where('request_date', $today)->first();

        // Check if snapshot already logged for today
        $existing = DB::table('hrm_work_snapshots')
            ->where('user_id', $user->id)
            ->whereDate('captured_at', $today)
            ->first();

        if ($existing) {
            DB::table('hrm_work_snapshots')->where('id', $existing->id)->update([
                'snapshot_data' => $snapshotData,
                'captured_at' => now(),
                'notes' => $request->input('notes', 'Latest Auto Screen Snapshot (1-Min Interval)'),
                'updated_at' => now(),
            ]);
            $id = $existing->id;
        } else {
            $id = DB::table('hrm_work_snapshots')->insertGetId([
                'user_id' => $user->id,
                'attendance_id' => $att?->id,
                'wfh_request_id' => $wfh?->id,
                'snapshot_data' => $snapshotData,
                'captured_at' => now(),
                'notes' => $request->input('notes', 'Latest Auto Screen Snapshot (1-Min Interval)'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Latest work proof snapshot updated in database.',
            'snapshot_id' => $id
        ]);
    }

    // 6. Get Admin Attendance Overview (All Staff)
    public function getTodayAttendance(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $today = date('Y-m-d');

        $users = User::select('id', 'name', 'email', 'role', 'department', 'designation', 'phone_number', 'contact_no', 'id_card_number', 'criminal_check_status')
            ->orderBy('name')
            ->get();

        $attendances = DB::table('hrm_attendances')->where('date', $today)->get();
        $wfhRequests = DB::table('hrm_wfh_requests')->where('request_date', $today)->get();
        $snapshots = DB::table('hrm_work_snapshots')->whereDate('captured_at', $today)->orderBy('captured_at', 'desc')->get();
        $leaves = DB::table('hrm_leave_requests')->where('start_date', '<=', $today)->where('end_date', '>=', $today)->get();

        return response()->json([
            'success' => true,
            'today' => $today,
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
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $leaves = DB::table('hrm_leave_requests')
            ->join('users', 'hrm_leave_requests.user_id', '=', 'users.id')
            ->select('hrm_leave_requests.*', 'users.name as user_name', 'users.email as user_email', 'users.department')
            ->orderBy('hrm_leave_requests.created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'leaves' => $leaves]);
    }

    // 8. Submit Leave Request
    public function storeLeaveRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $request->validate([
            'leave_type' => 'required|string',
            'start_date' => 'required|date',
            'end_date' => 'required|date',
            'reason' => 'required|string',
        ]);

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
            'message' => 'Leave application submitted successfully.',
            'id' => $id
        ]);
    }

    // 9. Respond to Leave Request
    public function respondLeaveRequest(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $status = $request->input('status'); // Approved, Rejected
        DB::table('hrm_leave_requests')->where('id', $id)->update([
            'status' => $status,
            'approved_by' => $user->id,
            'rejection_reason' => $request->input('rejection_reason'),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => "Leave application {$status}."]);
    }
}
