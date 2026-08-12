<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\HrmMemberRequest;
use App\Models\HrmRequestHistory;

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

        $orgId = $user->organization_id ?? 1;

        $query = HrmMemberRequest::with(['employee:id,name,email,department,role'])
            ->where('organization_id', $orgId);

        // Filters
        if ($request->filled('application_type') && $request->application_type !== 'All') {
            $query->where('application_type', $request->application_type);
        }
        if ($request->filled('status') && $request->status !== 'All') {
            $query->where('status', $request->status);
        }
        if ($request->filled('employee_id') && $request->employee_id !== 'All') {
            $query->where('employee_id', $request->employee_id);
        }
        if ($request->filled('department') && $request->department !== 'All') {
            $query->whereHas('employee', function($q) use ($request) {
                $q->where('department', $request->department);
            });
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }
        if ($request->filled('search')) {
            $searchTerm = '%' . $request->search . '%';
            $query->where(function($q) use ($searchTerm) {
                $q->where('request_number', 'LIKE', $searchTerm)
                  ->orWhere('title', 'LIKE', $searchTerm)
                  ->orWhereHas('employee', function($q2) use ($searchTerm) {
                      $q2->where('name', 'LIKE', $searchTerm);
                  });
            });
        }

        if ($request->filled('assigned_to_me') && filter_var($request->assigned_to_me, FILTER_VALIDATE_BOOLEAN)) {
            $roleMap = [
                'admin'      => 'Admin',
                'team_lead'  => 'Team Lead',
                'manager'    => 'Manager',
                'hr_manager' => 'HR Manager',
                'owner'      => 'Organization Owner',
            ];
            $mappedRole = $roleMap[$user->role] ?? $user->role;
            $roleVariants = array_filter(
                array_unique([$user->role, $mappedRole, $user->designation, ucfirst($user->role)]),
                fn($v) => !empty($v)
            );
            $query->whereHas('approvals', function ($q2) use ($user, $roleVariants) {
                $q2->where(function($q3) use ($user) {
                    $q3->where('approver_type', 'User')->where('approver_id', $user->id);
                })->orWhere(function($q4) use ($roleVariants) {
                    $q4->whereIn('approver_type', ['Role', 'Designation'])->whereIn('approver_id', $roleVariants);
                });
            });
        }

        // Exclude the viewer's own submitted applications (used in approver mode)
        if ($request->filled('exclude_own') && filter_var($request->exclude_own, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('employee_id', '!=', $user->id);
        }

        // Restrict visibility for non-admins
        if (!in_array($user->role, ['admin', 'owner'])) {
            $query->where(function ($q) use ($user) {
                $roleMap = [
                    'admin'      => 'Admin',
                    'team_lead'  => 'Team Lead',
                    'manager'    => 'Manager',
                    'hr_manager' => 'HR Manager',
                    'owner'      => 'Organization Owner',
                ];
                $mappedRole = $roleMap[$user->role] ?? $user->role;
                $userRoleVariants = array_filter(
                    array_unique([$user->role, $mappedRole, $user->designation, ucfirst($user->role)]),
                    fn($v) => !empty($v)
                );

                // 1. User's own requests
                $q->where('employee_id', $user->id)

                // 2. Requests where the user is an EXPLICIT approver by User ID (no dept restriction)
                  ->orWhereHas('approvals', function ($q2) use ($user) {
                      $q2->where('approver_type', 'User')
                         ->where('approver_id', $user->id);
                  })

                // 3. Requests where the user matches by Role/Designation (no dept restriction —
                //    if admin put this person in the chain, they must see it)
                  ->orWhereHas('approvals', function ($q3) use ($userRoleVariants) {
                      $q3->whereIn('approver_type', ['Role', 'Designation'])
                         ->whereIn('approver_id', $userRoleVariants);
                  });

                // 4. Managers/HR also see all requests from their OWN department (general oversight)
                if (in_array($user->role, ['manager', 'hr_manager', 'hr_user'])) {
                    $q->orWhereHas('employee', function($q5) use ($user) {
                        $q5->where('department', $user->department);
                    });
                }
            });
        }

        $stats = [
            'total' => (clone $query)->count(),
            'pending' => (clone $query)->where('status', 'Pending')->count(),
            'approved' => (clone $query)->where('status', 'Approved')->count(),
            'rejected' => (clone $query)->whereIn('status', ['Rejected', 'Cancelled'])->count(),
        ];

        // Sorting
        $sortBy = $request->input('sort_by', 'created_at');
        $sortDir = $request->input('sort_dir', 'desc');
        $allowedSorts = ['created_at', 'status', 'request_number', 'title'];
        if (!in_array($sortBy, $allowedSorts)) $sortBy = 'created_at';
        $query->orderBy($sortBy, $sortDir);

        $paginated = $query->paginate($request->input('per_page', 15));

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
                'employees' => User::select('id', 'name')->get(),
                'departments' => User::whereNotNull('department')->distinct()->pluck('department'),
                'types' => \App\Models\HrmMemberRequest::where('organization_id', $orgId)->whereNotNull('application_type')->distinct()->pluck('application_type'),
                'statuses' => ['Draft', 'Submitted', 'Pending', 'In Progress', 'Additional Information Required', 'Approved', 'Rejected', 'Cancelled', 'Completed'],
            ]
        ]);
    }

    public function show(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $orgId = $user->organization_id ?? 1;

        $record = HrmMemberRequest::with(['employee', 'fields', 'history.performedBy', 'approvals'])
            ->where('organization_id', $orgId)
            ->where('id', $id)
            ->first();

        if ($record) {
            foreach ($record->approvals as $approval) {
                if ($approval->approver_type === 'User') {
                    $approval->load('approver_user:id,name,role');
                }
            }
        }

        if (!$record) return response()->json(['success' => false, 'message' => 'Not found.'], 404);

        $employeeStats = [
            'total' => \App\Models\HrmMemberRequest::where('employee_id', $record->employee_id)->count(),
            'approved' => \App\Models\HrmMemberRequest::where('employee_id', $record->employee_id)->where('status', 'Approved')->count(),
            'pending' => \App\Models\HrmMemberRequest::where('employee_id', $record->employee_id)->where('status', 'Pending')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'application' => $record,
                'audits' => $record->history,
                'employee_stats' => $employeeStats,
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

        $orgId = $user->organization_id ?? 1;
        $record = HrmMemberRequest::with(['approvals', 'employee'])->where('organization_id', $orgId)->where('id', $id)->first();
        if (!$record) return response()->json(['success' => false, 'message' => 'Not found.'], 404);

        $oldStatus = $record->status;
        $newStatus = $request->status;

        $roleMap = [
            'admin' => 'Admin',
            'manager' => 'Manager',
            'team_lead' => 'Team Lead',
            'member' => 'Member',
            'guest' => 'Guest',
        ];
        $mappedRole = $roleMap[$user->role] ?? $user->role;

        // Find if this user is assigned to a pending step
        $pendingSteps = $record->approvals->where('status', 'Pending')->sortBy('step_order');
        $currentStep = $pendingSteps->first();

        $isStepApprover = false;
        if ($currentStep) {
            if ($currentStep->approver_type === 'User' && (int)$currentStep->approver_id === (int)$user->id) {
                // Explicit user match — always valid regardless of department
                $isStepApprover = true;
            } elseif (in_array($currentStep->approver_type, ['Role', 'Designation'])) {
                // Role/Designation match — valid if any of the user's role variants match
                $roleVariants = array_filter(
                    array_unique([$user->role, $mappedRole, $user->designation, ucfirst($user->role)]),
                    fn($v) => !empty($v)
                );
                if (in_array($currentStep->approver_id, $roleVariants)) {
                    $isStepApprover = true;
                }
            }
        }

        // If user is a step approver, update step
        if ($isStepApprover) {
            $currentStep->status = $newStatus === 'Approved' ? 'Approved' : ($newStatus === 'Rejected' ? 'Rejected' : $newStatus);
            $currentStep->save();

            if ($newStatus === 'Rejected') {
                // Instantly fail the whole request
                $record->status = 'Rejected';
                $record->rejected_at = now();
            } else if ($newStatus === 'Approved') {
                // Check if more steps remain
                if ($pendingSteps->count() > 1) {
                    $record->status = 'Under Review';
                } else {
                    $record->status = 'Approved';
                    $record->approved_at = now();
                }
            } else {
                $record->status = $newStatus;
            }
        } else {
            // Admin override
            $record->status = $newStatus;
            if ($newStatus === 'Approved') {
                $record->approved_at = now();
                // If admin forcefully approves, mark all remaining pending steps as Approved
                foreach ($pendingSteps as $pStep) {
                    $pStep->status = 'Approved';
                    $pStep->save();
                }
            }
            if ($newStatus === 'Rejected') {
                $record->rejected_at = now();
                // If admin forcefully rejects, mark the current step as Rejected
                if ($currentStep) {
                    $currentStep->status = 'Rejected';
                    $currentStep->save();
                }
            }
            if ($newStatus === 'Closed') $record->closed_at = now();
        }

        $record->updated_by = $user->id;
        $record->save();

        HrmRequestHistory::create([
            'organization_id' => $user->organization_id ?? 1,
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
