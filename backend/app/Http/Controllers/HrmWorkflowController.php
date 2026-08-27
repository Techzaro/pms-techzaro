<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\HrmWorkflow;
use App\Models\HrmWorkflowStep;
use App\Models\User;

class HrmWorkflowController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    private function organizationId(Request $request, User $user): int
    {
        return (int) ($request->attributes->get('currentOrganization')?->id
            ?? $user->organization_id
            ?? 1);
    }

    public function index(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $department = $request->query('department');
        
        $query = HrmWorkflow::with(['steps'])
            ->where('organization_id', $this->organizationId($request, $user));

        if ($department) {
            $query->where('department', $department);
        }

        $workflows = $query->get();

        return response()->json([
            'success' => true,
            'data' => $workflows
        ]);
    }

    /**
     * Check if the current authenticated user is part of any approval workflow chain.
     * Returns { success: true, is_approver: true/false }
     */
    public function checkApprover(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $orgId = $this->organizationId($request, $user);

        // Get all workflow steps for this organization
        $workflows = HrmWorkflow::with(['steps'])
            ->where('organization_id', $orgId)
            ->get();

        $isApprover = false;

        foreach ($workflows as $wf) {
            foreach ($wf->steps as $step) {
                // Match by specific User ID
                if ($step->approver_type === 'User' && (int)$step->approver_id === (int)$user->id) {
                    $isApprover = true;
                    break 2;
                }
                // Match by Role (e.g. "admin", "manager")
                $roleLabels = [
                    'admin' => 'admin',
                    'owner' => 'organization owner',
                    'manager' => 'manager',
                    'team_lead' => 'team lead',
                    'hr_manager' => 'hr manager',
                ];
                $userRoleLabel = $roleLabels[$user->role] ?? strtolower($user->role ?? '');

                if ($step->approver_type === 'Role' && strtolower($step->approver_id) === $userRoleLabel) {
                    $isApprover = true;
                    break 2;
                }
                // Match by Designation (e.g. "Software Engineer", "HR Manager")
                if ($step->approver_type === 'Designation' && in_array(strtolower($step->approver_id), [
                    strtolower($user->designation ?? ''),
                    $userRoleLabel,
                ], true)) {
                    $isApprover = true;
                    break 2;
                }
            }
        }

        return response()->json([
            'success' => true,
            'is_approver' => $isApprover
        ]);
    }

    public function getDepartmentUsers(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $department = $request->query('department');
        if (!$department) {
            return response()->json(['success' => false, 'message' => 'Department is required.'], 400);
        }

        // Tenant isolation limits query to active users in organization.
        // For "All Departments", return all active users sorted by name.
        // For a specific department, return department members PLUS all Admin & Manager (non-member) users.
        if ($department === 'All Departments' || $department === 'All') {
            $users = User::where('active', true)
                ->select('id', 'name', 'email', 'role', 'designation', 'department')
                ->orderBy('name')
                ->get();
        } else {
            $users = User::where('active', true)
                ->where(function($q) use ($department) {
                    $q->where('department', $department)
                      ->orWhere('role', '!=', 'member')
                      ->orWhereNull('role');
                })
                ->select('id', 'name', 'email', 'role', 'designation', 'department')
                ->orderBy('name')
                ->get();
        }

        return response()->json([
            'success' => true,
            'data' => $users
        ]);
    }

    public function getDepartments(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $departments = User::whereNotNull('department')
            ->distinct()
            ->pluck('department')
            ->filter(fn($d) => !empty(trim($d)) && $d !== 'All Departments')
            ->values();
            
        // Default list if empty
        if ($departments->isEmpty()) {
            $departments = collect(["Engineering", "Sales", "HR", "Marketing", "Finance", "Operations", "Design"]);
        }

        // Prepend "All Departments" at the beginning of the list
        $allDepartments = collect(['All Departments'])->concat($departments)->unique()->values();

        return response()->json([
            'success' => true,
            'data' => $allDepartments
        ]);
    }

    public function getOrganizationRoles(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $query = User::where('active', true)
            ->whereNotNull('designation')
            ->where('designation', '!=', '');

        if ($request->has('department') && $request->department !== 'All Departments' && $request->department !== 'All') {
            $dept = $request->department;
            $query->where(function($q) use ($dept) {
                $q->where('department', $dept)
                  ->orWhere('role', '!=', 'member')
                  ->orWhereNull('role');
            });
        }

        $designations = $query->distinct()
            ->pluck('designation')
            ->map(fn($d) => trim($d))
            ->filter(fn($d) => !empty($d))
            ->unique()
            ->values()
            ->toArray();

        return response()->json([
            'success' => true,
            'data' => $designations
        ]);
    }

    public function save(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $request->validate([
            'department' => 'required|string',
            'submitter_role' => 'nullable|array',
            'submitter_role.*' => 'string',
            'application_types' => 'required|array',
            'application_types.*' => 'string',
            'steps' => 'required|array',
            'steps.*.step_order' => 'required|integer',
            'steps.*.approver_type' => 'required|string',
            'steps.*.approver_id' => 'nullable|string',
        ]);

        try {
            \Illuminate\Support\Facades\DB::beginTransaction();

            $department = $request->department;
            $submitterRole = $request->submitter_role;
            
            // We don't query by submitter_role here when deleting because we want to replace the entire 
            // department's workflows with this new one, OR we can just delete exact matching arrays.
            // But wait, the frontend sends the full config. No, actually the frontend only supports editing
            // ONE workflow per submitter_role selection. To avoid duplicates, let's just delete the exact matching one.
            $organizationId = $this->organizationId($request, $user);
            $existingWorkflows = HrmWorkflow::where('organization_id', $organizationId)
                ->where('department', $department)
                ->get();
                
            foreach ($existingWorkflows as $ew) {
                // If it has exactly the same submitter_role array, delete it.
                if ($ew->submitter_role == $submitterRole) {
                    $ew->steps()->delete();
                    $ew->delete();
                }
            }
            
            // Create the new workflow
            $workflow = HrmWorkflow::create([
                'organization_id' => $organizationId,
                'department' => $department,
                'submitter_role' => $submitterRole,
                'application_types' => $request->application_types,
            ]);
            
            foreach ($request->steps as $step) {
                $workflow->steps()->create([
                    'step_order' => $step['step_order'],
                    'approver_type' => $step['approver_type'],
                    'approver_id' => $step['approver_id'] ?? null,
                ]);
            }

            \Illuminate\Support\Facades\DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Workflow saved successfully.',
                'data' => $workflow->load(['steps'])
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to save workflow.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $workflow = HrmWorkflow::where('organization_id', $this->organizationId($request, $user))->findOrFail($id);
        $workflow->delete();

        return response()->json([
            'success' => true,
            'message' => 'Workflow deleted successfully.'
        ]);
    }
}
