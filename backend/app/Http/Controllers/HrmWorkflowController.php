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

    public function index(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $department = $request->query('department');
        
        $query = HrmWorkflow::with(['steps'])
            ->where('organization_id', $user->organization_id ?? 1);

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

        $orgId = $user->organization_id ?? 1;

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
                if ($step->approver_type === 'Role' && strtolower($step->approver_id) === strtolower($user->role ?? '')) {
                    $isApprover = true;
                    break 2;
                }
                // Match by Designation (e.g. "Software Engineer", "HR Manager")
                if ($step->approver_type === 'Designation' && strtolower($step->approver_id) === strtolower($user->designation ?? '')) {
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

        $deptUsers = User::where('department', $department)
            ->select('id', 'name', 'role', 'designation')
            ->get();
        $adminManagers = User::where(function($q) {
                $q->where('role', 'admin')
                  ->orWhere('role', 'owner')
                  ->orWhere('designation', 'like', '%Manager%');
            })
            ->select('id', 'name', 'role', 'designation')
            ->get();

        $users = $deptUsers->merge($adminManagers)->unique('id')->values();

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
            ->pluck('department');
            
        // If empty, return a default list or just empty
        if ($departments->isEmpty()) {
            $departments = collect(["Engineering", "Sales", "HR", "Marketing", "Finance", "Operations", "Design"]);
        }

        return response()->json([
            'success' => true,
            'data' => $departments
        ]);
    }

    public function getOrganizationRoles(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);

        $query = User::whereNotNull('designation');
        if ($request->has('department')) {
            $query->where('department', $request->department);
        }

        // Fetch distinct designations available
        $designations = $query->distinct()->pluck('designation')->toArray();
            
        // If a department is selected, return only its designations.
        // If it has none, fallback to Admin and Manager.
        if ($request->has('department')) {
            if (empty($designations)) {
                $allDesignations = ['Admin', 'Manager'];
            } else {
                $allDesignations = $designations;
            }
        } else {
            $baseDesignations = ['Manager', 'Team Lead', 'Software Engineer', 'HR Manager', 'Admin'];
            $allDesignations = array_unique(array_merge($baseDesignations, $designations));
        }
        
        return response()->json([
            'success' => true,
            'data' => array_values($allDesignations)
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
            $existingWorkflows = HrmWorkflow::where('organization_id', $user->organization_id ?? 1)
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
                'organization_id' => $user->organization_id ?? 1,
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

        $workflow = HrmWorkflow::where('organization_id', $user->organization_id ?? 1)->findOrFail($id);
        $workflow->delete();

        return response()->json([
            'success' => true,
            'message' => 'Workflow deleted successfully.'
        ]);
    }
}
