<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\HrmMemberRequest;
use App\Models\HrmRequestHistory;
use App\Models\HrmApplicationType;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class HrmApplicationHistoryController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    public function index(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $query = HrmMemberRequest::with(['employee:id,name,email,department,role', 'type:id,name,slug,category'])
            ->where('organization_id', $user->organization_id);

        // Filters
        if ($request->filled('application_type_id')) {
            $query->where('application_type_id', $request->application_type_id);
        }
        if ($request->filled('status') && $request->status !== 'All') {
            $query->where('status', $request->status);
        }
        if ($request->filled('employee_id') && $request->employee_id !== 'All') {
            $query->where('employee_id', $request->employee_id);
        }

        $stats = [
            'total' => (clone $query)->count(),
            'pending' => (clone $query)->where('status', 'Pending')->count(),
            'approved' => (clone $query)->where('status', 'Approved')->count(),
            'rejected' => (clone $query)->where('status', 'Rejected')->count(),
            'cancelled' => (clone $query)->where('status', 'Cancelled')->count(),
        ];

        $paginated = $query->orderBy('created_at', 'desc')->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $paginated->items(),
            'meta' => [
                'total' => $paginated->total(),
                'page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'last_page' => $paginated->lastPage(),
                'stats' => $stats,
            ],
            'filters' => [
                'employees' => User::where('organization_id', $user->organization_id)->select('id', 'name')->get(),
                'types' => HrmApplicationType::where('organization_id', $user->organization_id)->select('id', 'name')->get(),
                'statuses' => ['Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled', 'Closed'],
            ]
        ]);
    }

    public function show(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $record = HrmMemberRequest::with(['employee', 'type', 'fields', 'history.performedBy'])
            ->where('organization_id', $user->organization_id)
            ->where('id', $id)
            ->first();

        if (!$record) return response()->json(['success' => false, 'message' => 'Not found.'], 404);

        return response()->json([
            'success' => true,
            'data' => [
                'application' => $record,
                'audits' => $record->history,
            ]
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $request->validate([
            'status' => 'required|string',
            'comments' => 'nullable|string'
        ]);

        $record = HrmMemberRequest::where('organization_id', $user->organization_id)->where('id', $id)->first();
        if (!$record) return response()->json(['success' => false, 'message' => 'Not found.'], 404);

        $oldStatus = $record->status;
        $newStatus = $request->status;

        $record->status = $newStatus;
        if ($newStatus === 'Approved') $record->approved_at = now();
        if ($newStatus === 'Rejected') $record->rejected_at = now();
        if ($newStatus === 'Closed') $record->closed_at = now();
        $record->updated_by = $user->id;
        $record->save();

        HrmRequestHistory::create([
            'organization_id' => $user->organization_id,
            'request_id' => $record->id,
            'performed_by' => $user->id,
            'action' => 'Status Updated',
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
            'comments' => $request->comments,
        ]);

        try {
            DB::table('hrm_notifications')->insert([
                'user_id' => $record->employee_id,
                'type' => 'Application Update',
                'title' => "Application {$newStatus}",
                'message' => "Your application '{$record->title}' has been {$newStatus} by HR.",
                'is_read' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Exception $e) {
            // Notifications table might be missing or have different columns
        }

        return response()->json([
            'success' => true,
            'message' => 'Status updated successfully.',
            'data' => $record
        ]);
    }
}
