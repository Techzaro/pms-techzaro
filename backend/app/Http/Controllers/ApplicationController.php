<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use App\Models\HrmCandidate;
use App\Models\HrmOfferLetter;

class ApplicationController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    public function getApplicationContext(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $type = $request->query('type');
        $context = [];
        $metrics = [];

        // Common metrics (Total past requests of this type)
        $totalRequests = \App\Models\HrmMemberRequest::where('employee_id', $user->id)
            ->where('application_type', $type)
            ->count();
            
        $approvedRequests = \App\Models\HrmMemberRequest::where('employee_id', $user->id)
            ->where('application_type', $type)
            ->where('status', 'Approved')
            ->count();

        // Categorize by exact requested type
        if (in_array($type, ['Full Day Leave', 'Half Day Leave', 'Leave Encashment', 'Work From Home Request'])) {
            $metrics[] = ['label' => 'Total Leaves Requested', 'value' => $totalRequests, 'icon' => 'calendar'];
            $metrics[] = ['label' => 'Approved Leaves', 'value' => $approvedRequests, 'icon' => 'check-circle'];
            $metrics[] = ['label' => 'Remaining Leaves', 'value' => max(0, 20 - $approvedRequests), 'icon' => 'alert-circle', 'subtext' => '(Assuming 20/yr quota)'];
        } 
        else if ($type === 'Advance Salary' || $type === 'Loan Request') {
            $metrics[] = ['label' => 'Current Gross Salary', 'value' => number_format($user->gross_salary ?: 0, 2), 'icon' => 'banknote'];
            
            // Calculate total advances taken
            $totalAdvances = \App\Models\HrmMemberRequest::with('fields')->where('employee_id', $user->id)
                ->whereIn('application_type', ['Advance Salary', 'Loan Request'])
                ->where('status', 'Approved')
                ->get()
                ->sum(function($req) {
                    $amountField = $req->fields->firstWhere('field_name', 'amount');
                    return $amountField ? (float) $amountField->field_value : 0;
                });
                
            $metrics[] = ['label' => 'Total Advanced / Loaned', 'value' => number_format($totalAdvances, 2), 'icon' => 'pie-chart'];
            $metrics[] = ['label' => 'Total Requests', 'value' => $totalRequests, 'icon' => 'file-text'];
        }
        else if ($type === 'Promotion Request' || $type === 'Change/Transfer Request') {
            $metrics[] = ['label' => 'Current Designation', 'value' => $user->designation ?: 'N/A', 'icon' => 'briefcase'];
            $metrics[] = ['label' => 'Current Department', 'value' => $user->department ?: 'N/A', 'icon' => 'building'];
            
            $tenure = 'N/A';
            if ($user->job_started_date) {
                $start = \Carbon\Carbon::parse($user->job_started_date);
                $tenure = $start->diffForHumans(null, true);
            }
            $metrics[] = ['label' => 'Tenure', 'value' => $tenure, 'icon' => 'clock'];
        }
        else {
            // Default generic context
            $metrics[] = ['label' => 'Total Past Requests', 'value' => $totalRequests, 'icon' => 'file-text'];
            $metrics[] = ['label' => 'Approved Requests', 'value' => $approvedRequests, 'icon' => 'check-circle'];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'type' => $type,
                'metrics' => $metrics
            ]
        ]);
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

            $approvedLeavesCount = 0;
            $wfhApprovedCount = 0;
            $leaveHistory = collect([]);
            $latestLeaveDecision = null;

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
            $allRequests = \App\Models\HrmMemberRequest::with(['history.performedBy'])
                ->where('employee_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(function ($r) {
                    $r->table_type = 'Member Request';
                    $r->category = $r->application_type ?? 'Member Request';
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
            $leaveHistory = [];

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
            'application_type' => 'required|string',
            'title' => 'required|string',
            'description' => 'nullable|string',
            'dynamic_fields' => 'nullable|array',
        ]);

        $organization = $request->attributes->get('currentOrganization');
        $organizationId = $organization?->id ?? $user->organization_id ?? 1;

        if (!$organization) {
            $organization = \App\Models\Master\Organization::on('mysql_master')->find($organizationId);
        }

        if ($organization) {
            $currentMonthCount = \App\Models\HrmMemberRequest::where('organization_id', $organizationId)
                ->whereYear('created_at', date('Y'))
                ->whereMonth('created_at', date('m'))
                ->count();
            
            $limit = $organization->max_applications_per_month ?? 100;
            if ($currentMonthCount >= $limit) {
                return response()->json([
                    'success' => false,
                    'message' => "Monthly application limit reached for your organization ($limit). Please contact your administrator."
                ], 403);
            }
        }

        try {
            DB::beginTransaction();

            $prefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $request->application_type), 0, 3));
            if (empty($prefix)) $prefix = 'REQ';
            $requestNumber = $prefix . '-' . date('Ymd') . '-' . rand(1000, 9999);

            $memberRequest = \App\Models\HrmMemberRequest::create([
                'organization_id' => $organizationId,
                'employee_id' => $user->id,
                'application_type' => $request->application_type,
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
                        'organization_id' => $organizationId,
                        'request_id' => $memberRequest->id,
                        'field_name' => $fieldName,
                        'field_value' => $valueToSave,
                    ]);
                }
            }

            \App\Models\HrmRequestHistory::create([
                'organization_id' => $organizationId,
                'request_id' => $memberRequest->id,
                'performed_by' => $user->id,
                'action' => 'Submitted',
                'new_status' => 'Pending',
                'comments' => 'Application submitted by employee.'
            ]);

            \App\Services\HrmAuditLogger::log(
                $request->application_type,
                $memberRequest->id,
                $user,
                'Submitted',
                null,
                'Pending',
                $request->description,
                ['request_number' => $requestNumber, 'title' => $request->title],
                $request
            );

            try {
                app(\App\Services\ActivityService::class)->log(
                    $user->id,
                    'application',
                    "Submitted {$request->application_type} application: {$request->title}",
                    'hrm_applications',
                    $memberRequest->id,
                    'submitted',
                    $request->application_type,
                    null,
                    ['request_number' => $requestNumber, 'status' => 'Pending']
                );
            } catch (\Throwable $actErr) {
                \Log::warning('ActivityService log failed: ' . $actErr->getMessage());
            }

            // Instantiate Approval Workflow Chain.
            // Stage 1: Workflow explicitly targeted at this specific user ID
            $workflowQuery = \App\Models\HrmWorkflow::where('organization_id', $organizationId)
                ->whereJsonContains('application_types', $request->application_type)
                ->with('steps');

            $workflow = (clone $workflowQuery)
                ->whereJsonContains('submitter_role', (string) $user->id)
                ->latest('created_at')
                ->first();

            // Stage 2: Workflow targeted at the user's role (e.g. "member", "team_lead")
            if (!$workflow && $user->role) {
                $workflow = (clone $workflowQuery)
                    ->whereJsonContains('submitter_role', (string) $user->role)
                    ->latest('created_at')
                    ->first();
            }

            // Stage 3: Department workflow with no submitter restriction (open to all)
            if (!$workflow && $user->department) {
                $workflow = (clone $workflowQuery)
                    ->where('department', $user->department)
                    ->where(function ($q) {
                        $q->whereNull('submitter_role')
                          ->orWhereRaw("JSON_LENGTH(COALESCE(submitter_role, '[]')) = 0");
                    })
                    ->latest('created_at')
                    ->first();
            }

            // Stage 4: Any workflow for the department (submitter_role doesn't matter)
            // This is the catch-all — if admin set up a chain for this dept, use it
            if (!$workflow && $user->department) {
                $workflow = (clone $workflowQuery)
                    ->where('department', $user->department)
                    ->latest('created_at')
                    ->first();
            }

            // Stage 5: "All Departments" fallback workflow
            if (!$workflow) {
                $workflow = (clone $workflowQuery)
                    ->where('department', 'All Departments')
                    ->latest('created_at')
                    ->first();
            }

            if ($workflow) {
                foreach ($workflow->steps as $step) {
                    // Save EXACTLY what the admin configured — no overrides, no fallbacks
                    \App\Models\HrmRequestApproval::create([
                        'request_id'   => $memberRequest->id,
                        'step_order'   => $step->step_order,
                        'approver_type' => $step->approver_type,
                        'approver_id'  => $step->approver_id,
                        'status'       => 'Pending',
                    ]);
                }
            }

            // Notify the first approver in the chain
            $firstApproval = \App\Models\HrmRequestApproval::where('request_id', $memberRequest->id)
                ->orderBy('step_order', 'asc')
                ->first();

            $userIdsToNotify = [];
            if ($firstApproval) {
                if ($firstApproval->approver_type === 'User') {
                    // Specific user by ID
                    $userIdsToNotify[] = (int) $firstApproval->approver_id;
                } else {
                    // Role or Designation — find matching users
                    $roleMap = [
                        'Manager'            => 'manager',
                        'Team Lead'          => 'team_lead',
                        'HR Manager'         => 'hr_manager',
                        'Organization Owner' => 'owner',
                        'Admin'              => 'admin',
                    ];
                    $approverId = $firstApproval->approver_id;
                    $mappedRole = $roleMap[$approverId] ?? null;

                    // Global roles (Admin, HR Manager, Owner) — find anywhere in org
                    if (in_array($approverId, ['Admin', 'Organization Owner', 'HR Manager'])) {
                        $userIdsToNotify = \App\Models\User::where('role', $mappedRole ?? 'admin')
                            ->pluck('id')->toArray();
                    } else {
                        // Department-scoped designation/role — search org-wide if no dept match
                        $deptQuery = \App\Models\User::where(function($q) use ($approverId, $mappedRole) {
                            if ($mappedRole) $q->where('role', $mappedRole);
                            $q->orWhere('designation', $approverId)
                              ->orWhere('role', $approverId);
                        });

                        // Prefer users in the workflow's department or submitter's department
                        $searchDept = $workflow->department ?: $user->department;
                        if ($searchDept) {
                            $deptUsers = (clone $deptQuery)->where('department', $searchDept)->pluck('id')->toArray();
                            $userIdsToNotify = !empty($deptUsers) ? $deptUsers : $deptQuery->pluck('id')->toArray();
                        } else {
                            $userIdsToNotify = $deptQuery->pluck('id')->toArray();
                        }

                        // Last resort fallback: notify admins
                        if (empty($userIdsToNotify)) {
                            $userIdsToNotify = \App\Models\User::where('role', 'admin')->pluck('id')->toArray();
                        }
                    }
                }
            } else {
                // No workflow found at all — create a default admin approval step
                \App\Models\HrmRequestApproval::create([
                    'request_id'    => $memberRequest->id,
                    'step_order'    => 1,
                    'approver_type' => 'Designation',
                    'approver_id'   => 'Admin',
                    'status'        => 'Pending',
                ]);
                $userIdsToNotify = \App\Models\User::where('role', 'admin')->pluck('id')->toArray();
            }

            DB::commit();

            // Notification delivery is best-effort and must never roll back an
            // application that was saved successfully.
            if (!empty($userIdsToNotify)) {
                try {
                    $ns = app(\App\Services\NotificationService::class);
                    $ns->notifyMultiple(
                        array_unique($userIdsToNotify),
                        $user->id,
                        'hrm_application_approval',
                        'hrm_member_request',
                        $memberRequest->id,
                        'Application Requires Approval',
                        $user->name . ' has submitted a ' . $memberRequest->application_type . ' application that requires your approval.',
                        '/hrm/applications?id=' . $memberRequest->id
                    );
                } catch (\Throwable $notificationError) {
                    Log::warning('HRM application saved but approver notification failed', [
                        'request_id' => $memberRequest->id,
                        'error' => $notificationError->getMessage(),
                    ]);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Application submitted successfully',
                'data' => ['request_id' => $memberRequest->id]
            ]);
        } catch (\Exception $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
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


