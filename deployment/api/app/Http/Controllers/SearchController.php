<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\Deliverable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Controller for global search across PMS entities.
 * Supports searching by business codes (PRJ-X, TSK-X.Y, SUB-X.Y.Z) and titles.
 */
class SearchController extends Controller
{
    /**
     * Search across projects, tasks, and deliverables by business code or title.
     *
     * @param  Request  $request  Query parameter: q (search term).
     * @return JsonResponse JSON response with grouped search results.
     */
    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        if (strlen($query) < 2) {
            return response()->json([
                'success' => true,
                'projects' => [],
                'tasks' => [],
                'deliverables' => [],
            ]);
        }

        $user = $request->user();
        $isAdminOrManager = in_array($user->role, ['admin', 'manager']);

        // Search projects by code or title
        $projects = Project::query()
            ->where(function ($q) use ($query) {
                $q->where('business_id', 'like', '%'.$query.'%')
                    ->orWhere('title', 'like', '%'.$query.'%');
            })
            ->when(! $isAdminOrManager, function ($q) use ($user) {
                $q->where(function ($q2) use ($user) {
                    $q2->where('created_by', $user->id)
                        ->orWhereJsonContains('assigned_users', $user->id)
                        ->orWhereHas('manuallyVisibleTo', fn ($q3) => $q3->where('user_id', $user->id));
                });
            })
            ->limit(10)
            ->get(['id', 'business_id', 'title', 'status']);

        // Search tasks by code or title
        $tasks = Task::query()
            ->where(function ($q) use ($query) {
                $q->where('business_id', 'like', '%'.$query.'%')
                    ->orWhere('title', 'like', '%'.$query.'%');
            })
            ->when(! $isAdminOrManager, function ($q) use ($user) {
                $q->where(function ($q2) use ($user) {
                    $q2->where('assigned_to', $user->id)
                        ->orWhere('assigned_by', $user->id)
                        ->orWhereHas('assignees', fn ($q3) => $q3->where('users.id', $user->id));
                });
            })
            ->with(['project:id,business_id,title'])
            ->limit(10)
            ->get(['id', 'business_id', 'project_id', 'title', 'status']);

        // Search deliverables by code or title
        $deliverables = Deliverable::query()
            ->where(function ($q) use ($query) {
                $q->where('business_id', 'like', '%'.$query.'%')
                    ->orWhere('title', 'like', '%'.$query.'%');
            })
            ->when(! $isAdminOrManager, function ($q) use ($user) {
                $q->where(function ($q2) use ($user) {
                    $q2->where('assigned_to', $user->id)
                        ->orWhere('created_by', $user->id);
                });
            })
            ->with(['project:id,business_id,title', 'task:id,business_id,title'])
            ->limit(10)
            ->get(['id', 'business_id', 'project_id', 'task_id', 'title', 'status']);

        return response()->json([
            'success' => true,
            'projects' => $projects,
            'tasks' => $tasks,
            'deliverables' => $deliverables,
        ]);
    }
}
