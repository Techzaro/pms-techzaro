<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HrmActivityController extends Controller
{
    /**
     * Resolve authenticated user.
     */
    private function resolveAuth(Request $request): ?User
    {
        return $request->user() ?: auth('sanctum')->user();
    }

    /**
     * Get paginated HRM & Auth activity logs with strict role-based & mode-based access control.
     * Mode 'my': returns personal activities from login to logout.
     * Mode 'all' (Admin/Manager): returns all organization activities.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $this->resolveAuth($request);
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $perPage = (int) ($request->input('per_page') ?: $request->input('limit') ?: 25);
        $page = (int) ($request->input('page') ?: 1);
        $search = trim((string) $request->input('search'));
        $module = $request->input('module');
        $action = $request->input('action');
        $startDate = $request->input('start_date') ?: $request->input('date_from');
        $endDate = $request->input('end_date') ?: $request->input('date_to');
        $mode = $request->input('mode'); // 'my' or 'all'

        // Elevated roles check
        $isElevated = in_array(strtolower($user->role ?: ''), ['admin', 'owner', 'manager', 'hr_manager', 'superadmin', 'super_admin']);
        $filterUserId = $request->input('user_id');

        // If mode === 'my' or user is not elevated, target ONLY user's own ID
        $targetUserId = ($mode === 'my' || !$isElevated) ? $user->id : ($filterUserId ? (int)$filterUserId : null);

        $combinedLogs = collect();

        // 1. Fetch from `activities` table (Includes Auth logins, logouts, tasks, hrm events)
        try {
            $actQuery = Activity::with(['user:id,name,email,avatar,role,designation,department']);
            
            if ($mode !== 'my') {
                $actQuery->where(function($q) {
                    $q->whereIn('activity_type', ['hrm', 'application', 'attendance', 'workflow', 'recruitment', 'performance', 'hrm_applications', 'hrm_attendance', 'hrm_workflow', 'hrm_recruitment', 'hrm_performance', 'auth', 'auth_login'])
                      ->orWhere('related_module', 'LIKE', 'hrm%')
                      ->orWhere('related_module', 'LIKE', 'application%')
                      ->orWhere('related_module', 'LIKE', 'attendance%')
                      ->orWhere('related_module', 'LIKE', 'auth%');
                });
            }

            if ($targetUserId) {
                $actQuery->where(function($q) use ($targetUserId) {
                    $q->where('user_id', $targetUserId)
                      ->orWhere('related_user_id', $targetUserId);
                });
            }

            if ($startDate) $actQuery->whereDate('created_at', '>=', Carbon::parse($startDate));
            if ($endDate) $actQuery->whereDate('created_at', '<=', Carbon::parse($endDate));

            $actItems = $actQuery->latest()->take(300)->get();

            foreach ($actItems as $act) {
                $meta = $act->metadata ?: [];
                $ip = $meta['ip_address'] ?? ($act->ip_address ?? $request->ip());

                $combinedLogs->push([
                    'id' => 'act_' . $act->id,
                    'user_id' => $act->user_id,
                    'user_name' => $act->user?->name ?: 'System User',
                    'user_email' => $act->user?->email ?: '',
                    'user_avatar' => $act->user?->avatar,
                    'user_role' => $act->user?->role ?: 'member',
                    'user_designation' => $act->user?->designation ?: 'Staff',
                    'user_department' => $act->user?->department ?: 'General',
                    'activity_type' => $act->activity_type ?: 'hrm',
                    'action' => ucfirst($act->action ?: 'Activity'),
                    'related_module' => $act->related_module ?: 'hrm',
                    'related_id' => $act->related_id,
                    'entity_name' => $act->entity_name ?: 'HRM Record',
                    'description' => $act->description ?: 'HRM Action Recorded',
                    'status' => $meta['status'] ?? 'success',
                    'ip_address' => $ip,
                    'metadata' => $meta,
                    'created_at' => $act->created_at->toIso8601String(),
                    'raw_time' => strtotime($act->created_at),
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('HrmActivityController activities fetch error: ' . $e->getMessage());
        }

        // 2. Fetch from `audit_logs` table (Captures Logins, Logouts, Password Changes)
        try {
            $auditLogQuery = DB::table('audit_logs')
                ->leftJoin('users', 'audit_logs.user_id', '=', 'users.id')
                ->select(
                    'audit_logs.*',
                    'users.name as u_name',
                    'users.email as u_email',
                    'users.avatar as u_avatar',
                    'users.role as u_role',
                    'users.designation as u_desig',
                    'users.department as u_dept'
                );

            if ($targetUserId) {
                $auditLogQuery->where('audit_logs.user_id', $targetUserId);
            }

            if ($startDate) $auditLogQuery->whereDate('audit_logs.created_at', '>=', Carbon::parse($startDate));
            if ($endDate) $auditLogQuery->whereDate('audit_logs.created_at', '<=', Carbon::parse($endDate));

            $auditLogItems = $auditLogQuery->orderBy('audit_logs.created_at', 'desc')->take(300)->get();

            foreach ($auditLogItems as $al) {
                $meta = [];
                if (!empty($al->old_values) || !empty($al->new_values)) {
                    $meta['old'] = is_string($al->old_values) ? json_decode($al->old_values, true) : (array)$al->old_values;
                    $meta['new'] = is_string($al->new_values) ? json_decode($al->new_values, true) : (array)$al->new_values;
                }

                $combinedLogs->push([
                    'id' => 'auditlog_' . $al->id,
                    'user_id' => $al->user_id,
                    'user_name' => $al->u_name ?: 'User',
                    'user_email' => $al->u_email ?: '',
                    'user_avatar' => $al->u_avatar,
                    'user_role' => $al->u_role ?: 'member',
                    'user_designation' => $al->u_desig ?: 'Staff',
                    'user_department' => $al->u_dept ?: 'General',
                    'activity_type' => $al->module ?: 'auth',
                    'action' => ucfirst($al->action ?: 'Action'),
                    'related_module' => $al->module ?: 'auth',
                    'related_id' => $al->entity_id,
                    'entity_name' => $al->entity_type ?: 'Audit Record',
                    'description' => $al->description ?: ($al->action . ' event recorded'),
                    'status' => strtolower($al->status ?: 'success'),
                    'ip_address' => $al->ip_address ?: $request->ip(),
                    'metadata' => $meta,
                    'created_at' => Carbon::parse($al->created_at)->toIso8601String(),
                    'raw_time' => strtotime($al->created_at),
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('HrmActivityController audit_logs fetch error: ' . $e->getMessage());
        }

        // 3. Fetch from `hrm_request_audits` table (Captures Application workflow reviews & approvals)
        try {
            $auditQuery = DB::table('hrm_request_audits')
                ->leftJoin('users', 'hrm_request_audits.user_id', '=', 'users.id')
                ->select(
                    'hrm_request_audits.*',
                    'users.name as u_name',
                    'users.email as u_email',
                    'users.avatar as u_avatar',
                    'users.role as u_role',
                    'users.designation as u_desig',
                    'users.department as u_dept'
                );

            if ($targetUserId) {
                $myRequestIds = DB::table('hrm_member_requests')
                    ->where('employee_id', $targetUserId)
                    ->pluck('id')
                    ->toArray();

                $auditQuery->where(function($q) use ($targetUserId, $myRequestIds) {
                    $q->where('hrm_request_audits.user_id', $targetUserId);
                    if (!empty($myRequestIds)) {
                        $q->orWhereIn('hrm_request_audits.request_id', $myRequestIds);
                    }
                });
            }

            if ($startDate) $auditQuery->whereDate('hrm_request_audits.created_at', '>=', Carbon::parse($startDate));
            if ($endDate) $auditQuery->whereDate('hrm_request_audits.created_at', '<=', Carbon::parse($endDate));

            $auditItems = $auditQuery->orderBy('hrm_request_audits.created_at', 'desc')->take(300)->get();

            foreach ($auditItems as $aud) {
                $meta = [];
                if (!empty($aud->metadata)) {
                    $meta = is_string($aud->metadata) ? json_decode($aud->metadata, true) : (array)$aud->metadata;
                }
                if ($aud->remarks) $meta['remarks'] = $aud->remarks;
                if ($aud->new_status) $meta['status'] = $aud->new_status;

                $combinedLogs->push([
                    'id' => 'aud_' . $aud->id,
                    'user_id' => $aud->user_id,
                    'user_name' => $aud->user_name ?: ($aud->u_name ?: 'System'),
                    'user_email' => $aud->u_email ?: '',
                    'user_avatar' => $aud->u_avatar,
                    'user_role' => $aud->u_role ?: 'member',
                    'user_designation' => $aud->u_desig ?: 'Staff',
                    'user_department' => $aud->u_dept ?: 'General',
                    'activity_type' => 'application',
                    'action' => ucfirst($aud->action ?: 'Status Update'),
                    'related_module' => 'hrm_applications',
                    'related_id' => $aud->request_id,
                    'entity_name' => $aud->request_type ?: 'HR Application',
                    'description' => "{$aud->request_type}: {$aud->action}" . ($aud->new_status ? " ({$aud->new_status})" : ""),
                    'status' => strtolower($aud->new_status) === 'rejected' ? 'failed' : 'success',
                    'ip_address' => $aud->ip_address ?: $request->ip(),
                    'metadata' => $meta,
                    'created_at' => Carbon::parse($aud->created_at)->toIso8601String(),
                    'raw_time' => strtotime($aud->created_at),
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('HrmActivityController audits fetch error: ' . $e->getMessage());
        }

        // 4. Fetch submitted applications directly from `hrm_member_requests` table
        try {
            $reqQuery = DB::table('hrm_member_requests')
                ->join('users', 'hrm_member_requests.employee_id', '=', 'users.id')
                ->select(
                    'hrm_member_requests.*',
                    'users.name as u_name',
                    'users.email as u_email',
                    'users.avatar as u_avatar',
                    'users.role as u_role',
                    'users.designation as u_desig',
                    'users.department as u_dept'
                );

            if ($targetUserId) {
                $reqQuery->where('hrm_member_requests.employee_id', $targetUserId);
            }

            if ($startDate) $reqQuery->whereDate('hrm_member_requests.created_at', '>=', Carbon::parse($startDate));
            if ($endDate) $reqQuery->whereDate('hrm_member_requests.created_at', '<=', Carbon::parse($endDate));

            $reqItems = $reqQuery->orderBy('hrm_member_requests.created_at', 'desc')->take(300)->get();

            foreach ($reqItems as $req) {
                $combinedLogs->push([
                    'id' => 'req_' . $req->id,
                    'user_id' => $req->employee_id,
                    'user_name' => $req->u_name ?: 'User',
                    'user_email' => $req->u_email ?: '',
                    'user_avatar' => $req->u_avatar,
                    'user_role' => $req->u_role ?: 'member',
                    'user_designation' => $req->u_desig ?: 'Staff',
                    'user_department' => $req->u_dept ?: 'General',
                    'activity_type' => 'application',
                    'action' => 'Submitted',
                    'related_module' => 'hrm_applications',
                    'related_id' => $req->id,
                    'entity_name' => $req->application_type ?: 'HR Application',
                    'description' => "Submitted {$req->application_type} application: {$req->title}" . ($req->request_number ? " ({$req->request_number})" : ""),
                    'status' => strtolower($req->status) === 'rejected' ? 'failed' : 'success',
                    'ip_address' => $request->ip(),
                    'metadata' => [
                        'request_number' => $req->request_number,
                        'title' => $req->title,
                        'status' => $req->status,
                        'description' => $req->description
                    ],
                    'created_at' => Carbon::parse($req->created_at)->toIso8601String(),
                    'raw_time' => strtotime($req->created_at),
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('HrmActivityController member_requests fetch error: ' . $e->getMessage());
        }

        // 5. Search Filter
        if ($search) {
            $s = strtolower($search);
            $combinedLogs = $combinedLogs->filter(function($item) use ($s) {
                return str_contains(strtolower($item['description']), $s) ||
                       str_contains(strtolower($item['user_name']), $s) ||
                       str_contains(strtolower($item['user_email']), $s) ||
                       str_contains(strtolower($item['entity_name']), $s) ||
                       str_contains(strtolower($item['user_department']), $s) ||
                       str_contains(strtolower($item['action']), $s) ||
                       str_contains(strtolower($item['ip_address']), $s);
            });
        }

        // 6. Module Filter
        if ($module) {
            $m = strtolower($module);
            $combinedLogs = $combinedLogs->filter(function($item) use ($m) {
                return str_contains(strtolower($item['related_module']), $m) ||
                       str_contains(strtolower($item['activity_type']), $m);
            });
        }

        // 7. Action Filter
        if ($action) {
            $act = strtolower($action);
            $combinedLogs = $combinedLogs->filter(function($item) use ($act) {
                return str_contains(strtolower($item['action']), $act);
            });
        }

        // Sort descending by raw timestamp & deduplicate by unique key
        $sortedLogs = $combinedLogs->sortByDesc('raw_time')->unique(function($item) {
            return $item['user_id'] . '_' . strtolower($item['action']) . '_' . date('YmdHi', $item['raw_time']);
        })->values();

        $totalCount = $sortedLogs->count();
        $pagedLogs = $sortedLogs->slice(($page - 1) * $perPage, $perPage)->values();

        // Format dates & timeAgo for UI table rendering
        $formattedItems = $pagedLogs->map(function($item) {
            $dt = Carbon::parse($item['created_at']);
            $item['formatted_time'] = $dt->format('M d, Y h:i A');
            $item['time_ago'] = $dt->diffForHumans();
            return $item;
        });

        // Summary statistics
        $stats = [
            'total_activities' => $totalCount,
            'applications_logged' => $sortedLogs->whereIn('activity_type', ['application', 'hrm_applications'])->count(),
            'attendance_events' => $sortedLogs->whereIn('activity_type', ['attendance', 'hrm_attendance'])->count(),
            'system_changes' => $sortedLogs->whereIn('activity_type', ['workflow', 'hrm_workflow', 'hrm', 'auth'])->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $formattedItems,
            'stats' => $stats,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $totalCount,
                'last_page' => max(1, (int) ceil($totalCount / $perPage)),
            ]
        ]);
    }

    /**
     * Get current user's personal HRM activities.
     */
    public function myActivity(Request $request): JsonResponse
    {
        $user = $this->resolveAuth($request);
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $request->merge(['mode' => 'my']);
        return $this->index($request);
    }
}
