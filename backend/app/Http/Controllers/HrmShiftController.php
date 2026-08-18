<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HrmShiftController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    // 1. List All Shift Templates
    public function getShifts(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $shifts = DB::table('hrm_shift_templates')
            ->orderBy('is_active', 'desc')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->map(function ($s) {
                $s->is_active = (bool)$s->is_active;
                return $s;
            });

        return response()->json([
            'success' => true,
            'shifts' => $shifts
        ]);
    }

    // 2. Create Shift Template Policy
    public function storeShift(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'name' => 'required|string',
            'shift_type' => 'required|string',
            'shift_start' => 'required',
            'shift_end' => 'required',
        ]);

        $id = DB::table('hrm_shift_templates')->insertGetId([
            'name' => $request->name,
            'shift_type' => $request->shift_type,
            'shift_start' => $request->shift_start,
            'shift_end' => $request->shift_end,
            'grace_minutes' => $request->input('grace_minutes', 15),
            'late_threshold' => $request->input('late_threshold', '09:15:00'),
            'max_late_allowed' => $request->input('max_late_allowed', 3),
            'weekly_hours' => $request->input('weekly_hours', 40.0),
            'rules_json' => json_encode($request->input('rules', [])),
            'is_active' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Working Shift Template Policy created successfully ✔',
            'shift_id' => $id
        ]);
    }

    // 3. Activate Shift Template Policy (Sets chosen policy active, deactivates others and syncs department settings)
    public function activateShift(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        DB::transaction(function () use ($id) {
            DB::table('hrm_shift_templates')->update(['is_active' => 0]);
            DB::table('hrm_shift_templates')->where('id', $id)->update(['is_active' => 1, 'updated_at' => now()]);
        });

        // Automatically sync all department settings with this active policy
        app(\App\Http\Controllers\HrmWarningController::class)->syncDepartmentSettings($request);

        $activePolicy = DB::table('hrm_shift_templates')->where('id', $id)->first();
        if ($activePolicy) {
            $activePolicy->is_active = true;
        }

        return response()->json([
            'success' => true,
            'message' => 'Working Policy implemented as active organization policy and all department settings updated ✔',
            'activePolicy' => $activePolicy
        ]);
    }

    // 4. Update Shift Template Policy
    public function updateShift(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $updateData = [
            'name' => $request->input('name'),
            'shift_type' => $request->input('shift_type'),
            'shift_start' => $request->input('shift_start'),
            'shift_end' => $request->input('shift_end'),
            'grace_minutes' => $request->input('grace_minutes'),
            'late_threshold' => $request->input('late_threshold'),
            'weekly_hours' => $request->input('weekly_hours'),
            'rules_json' => json_encode($request->input('rules', [])),
            'updated_at' => now(),
        ];

        if ($request->has('max_late_allowed')) {
            $updateData['max_late_allowed'] = $request->input('max_late_allowed');
        }

        DB::table('hrm_shift_templates')->where('id', $id)->update($updateData);

        // Sync department settings if this is the active policy
        $policy = DB::table('hrm_shift_templates')->where('id', $id)->first();
        if ($policy && $policy->is_active) {
            app(\App\Http\Controllers\HrmWarningController::class)->syncDepartmentSettings($request);
        }

        return response()->json([
            'success' => true,
            'message' => 'Working Shift Template Policy updated successfully ✔'
        ]);
    }

    // 5. Delete Shift Template Policy
    public function deleteShift(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        DB::table('hrm_shift_templates')->where('id', $id)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Working Shift Policy deleted successfully ✔'
        ]);
    }

    // 6. Admin Request Real-Time Screen Verification
    public function createScreenRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $targetUserId = $request->input('user_id');
        if (!$targetUserId) {
            return response()->json(['message' => 'Target user ID is required.'], 422);
        }

        // Supercede previous pending requests for this user
        DB::table('hrm_screen_requests')
            ->where('user_id', $targetUserId)
            ->where('status', 'Pending')
            ->update(['status' => 'Superceded', 'updated_at' => now()]);

        $id = DB::table('hrm_screen_requests')->insertGetId([
            'user_id' => $targetUserId,
            'requested_by' => $user->id,
            'status' => 'Pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Real-time Screen Verification Request sent to employee ✔',
            'request_id' => $id
        ]);
    }

    // 7. Member Respond to Screen Verification Request (Accept or Reject with Reason)
    public function respondScreenRequest(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $status = $request->input('status', 'Accepted');
        if (in_array(strtolower($status), ['declined', 'rejected'])) {
            $status = 'Rejected';
        }

        $reason = $request->input('reason') ?: $request->input('rejection_reason', 'User declined screen capture request');

        // Resolve ALL pending screen requests for this user
        DB::table('hrm_screen_requests')
            ->where('user_id', $user->id)
            ->where(function ($q) use ($id) {
                $q->where('id', $id)->orWhere('status', 'Pending');
            })
            ->update([
                'status' => $status,
                'rejection_reason' => $reason,
                'responded_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => "Screen verification request {$status} ✔"
        ]);
    }

    // 8. Get Active Pending Screen Request for Member
    public function getActiveScreenRequest(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $pending = DB::table('hrm_screen_requests')
            ->where('user_id', $user->id)
            ->where('status', 'Pending')
            ->orderBy('id', 'desc')
            ->first();

        return response()->json([
            'success' => true,
            'pending_request' => $pending
        ]);
    }
}
