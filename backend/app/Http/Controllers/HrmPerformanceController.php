<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;

class HrmPerformanceController extends Controller
{
    private function resolveAuth(Request $request)
    {
        return $request->user();
    }

    /**
     * 1. Get Complete Performance & Evaluation Summary
     */
    public function getPerformanceSummary(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $currentMonth = date('Y-m');

        // Fetch all employees
        $users = User::select(
            'id', 'name', 'email', 'role', 'department', 'designation',
            'gross_salary', 'stipend', 'accepted_offer_stipend'
        )->get();

        // Fetch current month attendance for financial utilization calculation
        $attendances = DB::table('hrm_attendances')
            ->where('date', 'like', "{$currentMonth}%")
            ->get();

        // Calculate performance matrix per user
        $userMatrix = $users->map(function ($u) use ($attendances) {
            $userAtts = $attendances->where('user_id', $u->id);
            $workedMins = $userAtts->sum('work_duration_minutes') ?: 10230; // default 170.5h if fresh
            $workedHrs = round($workedMins / 60, 1);
            
            $stipend = (float)($u->accepted_offer_stipend ?: ($u->stipend ?: ($u->gross_salary ?: 3500)));
            $hourlyRate = round($stipend / 176.0, 2);
            $billableHrs = round($workedHrs * 0.85, 1);
            $financialValue = round($billableHrs * ($hourlyRate * 1.6), 2);
            $utilizationRate = round(min(100.0, ($workedHrs / 176.0) * 100), 1);
            $productivityScore = round(min(100.0, ($billableHrs / max(1, $workedHrs)) * 100), 1);

            // Latest appraisal for user
            $appraisal = DB::table('hrm_performance_appraisals')
                ->where('user_id', $u->id)
                ->orderBy('created_at', 'desc')
                ->first();

            // Active goals count
            $goalsCount = DB::table('hrm_performance_goals')
                ->where('user_id', $u->id)
                ->count();

            $completedGoals = DB::table('hrm_performance_goals')
                ->where('user_id', $u->id)
                ->where('status', 'Completed')
                ->count();

            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'department' => $u->department ?: 'Engineering',
                'designation' => $u->designation ?: 'Team Member',
                'stipend' => $stipend,
                'hourly_rate' => $hourlyRate,
                'worked_hours' => $workedHrs,
                'billable_hours' => $billableHrs,
                'financial_value' => $financialValue,
                'utilization_rate' => $utilizationRate,
                'productivity_score' => $productivityScore,
                'overall_score' => $appraisal ? (float)$appraisal->overall_score : 4.5,
                'rating_tier' => $appraisal ? $appraisal->rating_tier : 'Meets Expectations',
                'promotion_eligible' => $appraisal ? (bool)$appraisal->promotion_eligible : ($utilizationRate >= 90),
                'total_goals' => $goalsCount,
                'completed_goals' => $completedGoals,
            ];
        });

        // Fetch OKRs & Goals
        $goals = DB::table('hrm_performance_goals')
            ->join('users', 'hrm_performance_goals.user_id', '=', 'users.id')
            ->select('hrm_performance_goals.*', 'users.name as user_name', 'users.department')
            ->orderBy('hrm_performance_goals.created_at', 'desc')
            ->get();

        // Fetch 360 Appraisals History
        $appraisals = DB::table('hrm_performance_appraisals')
            ->join('users', 'hrm_performance_appraisals.user_id', '=', 'users.id')
            ->leftJoin('users as evaluator', 'hrm_performance_appraisals.evaluator_id', '=', 'evaluator.id')
            ->select(
                'hrm_performance_appraisals.*',
                'users.name as user_name',
                'users.email as user_email',
                'users.department',
                'evaluator.name as evaluator_name'
            )
            ->orderBy('hrm_performance_appraisals.created_at', 'desc')
            ->get();

        // Top Performers (Ranked by Overall Score & Financial Value)
        $topPerformers = $userMatrix->sortByDesc('financial_value')->values()->take(5);

        // Overall Performance KPI Metrics
        $totalFinancialValue = round($userMatrix->sum('financial_value'), 2);
        $avgScore = round($userMatrix->avg('overall_score'), 1);
        $topRatedCount = $userMatrix->where('overall_score', '>=', 4.5)->count();
        $promotionEligibleCount = $userMatrix->where('promotion_eligible', true)->count();

        return response()->json([
            'success' => true,
            'userMatrix' => $userMatrix,
            'goals' => $goals,
            'appraisals' => $appraisals,
            'topPerformers' => $topPerformers,
            'kpis' => [
                'total_financial_value' => $totalFinancialValue,
                'avg_performance_score' => $avgScore,
                'top_rated_count' => $topRatedCount,
                'promotion_eligible_count' => $promotionEligibleCount,
            ]
        ]);
    }

    /**
     * 2. Create OKR / Goal
     */
    public function storeGoal(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'goal_title' => 'required|string',
            'category' => 'required|string',
        ]);

        $id = DB::table('hrm_performance_goals')->insertGetId([
            'user_id' => $request->user_id,
            'goal_title' => $request->goal_title,
            'category' => $request->input('category', 'Technical'),
            'target_value' => $request->input('target_value', 100.00),
            'current_value' => $request->input('current_value', 0.00),
            'unit' => $request->input('unit', '%'),
            'weightage' => $request->input('weightage', 25),
            'status' => $request->input('status', 'On Track'),
            'due_date' => $request->input('due_date', date('Y-m-d', strtotime('+30 days'))),
            'created_by' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Performance OKR Goal created & assigned successfully ✔',
            'goal_id' => $id
        ]);
    }

    /**
     * 3. Update Goal Progress / Status
     */
    public function updateGoal(Request $request, $id)
    {
        $user = $this->resolveAuth($request);
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $updateData = ['updated_at' => now()];

        if ($request->has('current_value')) {
            $updateData['current_value'] = $request->current_value;
        }
        if ($request->has('status')) {
            $updateData['status'] = $request->status;
        }

        DB::table('hrm_performance_goals')->where('id', $id)->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'Goal progress updated successfully ✔'
        ]);
    }

    /**
     * 4. Submit 360-Degree Performance Appraisal Review
     */
    public function storeAppraisal(Request $request)
    {
        $user = $this->resolveAuth($request);
        if (!$user || !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'period_name' => 'required|string',
        ]);

        $tech = (float)$request->input('technical_score', 4.0);
        $time = (float)$request->input('timeliness_score', 4.0);
        $collab = (float)$request->input('collaboration_score', 4.0);
        $prob = (float)$request->input('problem_solving_score', 4.0);
        $comm = (float)$request->input('communication_score', 4.0);

        $overall = round(($tech + $time + $collab + $prob + $comm) / 5.0, 1);

        $ratingTier = 'Meets Expectations';
        if ($overall >= 4.5) {
            $ratingTier = 'Exceeds Expectations 🌟';
        } elseif ($overall >= 3.5) {
            $ratingTier = 'Meets Expectations ✅';
        } elseif ($overall >= 2.5) {
            $ratingTier = 'Needs Improvement ⚠️';
        } else {
            $ratingTier = 'Unsatisfactory / PIP Required 🚨';
        }

        $id = DB::table('hrm_performance_appraisals')->insertGetId([
            'user_id' => $request->user_id,
            'evaluator_id' => $user->id,
            'period_name' => $request->period_name,
            'technical_score' => $tech,
            'timeliness_score' => $time,
            'collaboration_score' => $collab,
            'problem_solving_score' => $prob,
            'communication_score' => $comm,
            'overall_score' => $overall,
            'rating_tier' => $ratingTier,
            'feedback_notes' => $request->input('feedback_notes', 'Great performance and consistent dedication.'),
            'promotion_eligible' => $request->input('promotion_eligible', $overall >= 4.5),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => "360° Performance Appraisal score ({$overall} / 5.0) recorded successfully ✔",
            'appraisal_id' => $id
        ]);
    }
}
