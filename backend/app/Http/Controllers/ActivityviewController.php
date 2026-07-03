<?php

namespace App\Http\Controllers;

use App\Models\DeliverableChange;
use App\Models\ProjectChange;
use App\Models\TaskChange;
use App\Models\TaskWorkflowEvent;
use App\Models\UserActivityView;
use App\Models\UserChange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityviewController extends Controller
{
    /**
     * Get unread activity status for multiple entities at once.
     * POST /api/activity-views/check
     * Body: { entities: [{ type: "project", id: 1 }, { type: "task", id: 5 }] }
     * Returns: { views: { "project:1": { hasUnread: true, unreadCount: 3 }, ... } }
     */
    public function check(Request $request): JsonResponse
    {
        $user = $request->user();
        $entities = $request->input('entities', []);
        $result = [];

        if (empty($entities)) {
            return response()->json(['success' => true, 'views' => []]);
        }

        $entityTypes = [];
        $entityIds = [];
        foreach ($entities as $entity) {
            $type = $entity['type'] ?? null;
            $id = $entity['id'] ?? null;
            if (! $type || ! $id) { continue; }
            $entityTypes[$type][] = $id;
            $entityIds[] = $id;
        }

        $views = UserActivityView::where('user_id', $user->id)
            ->whereIn('entity_id', $entityIds)
            ->get()
            ->keyBy(fn ($v) => "{$v->entity_type}:{$v->entity_id}");

        $maxIds = $this->batchGetMaxActivityIds($entityTypes);

        $unreadCounts = $this->batchCountUnread($entityTypes, $views);

        foreach ($entities as $entity) {
            $type = $entity['type'] ?? null;
            $id = $entity['id'] ?? null;
            if (! $type || ! $id) { continue; }

            $key = "{$type}:{$id}";
            $maxId = $maxIds[$type][$id] ?? 0;
            $view = $views->get($key);
            $lastViewed = $view?->last_viewed_activity_id ?? 0;
            $hasUnread = $maxId > $lastViewed;
            $unreadCount = $hasUnread ? ($unreadCounts[$type][$id] ?? 0) : 0;

            $result[$key] = [
                'hasUnread' => $hasUnread,
                'unreadCount' => $unreadCount,
                'lastViewedId' => $lastViewed,
                'maxId' => $maxId,
            ];
        }

        return response()->json(['success' => true, 'views' => $result]);
    }

    /**
     * Mark activities as viewed for a specific entity.
     * POST /api/activity-views/mark-viewed
     * Body: { type: "project", id: 1 }
     */
    public function markViewed(Request $request): JsonResponse
    {
        $user = $request->user();
        $type = $request->input('type');
        $id = $request->input('id');

        if (! $type || ! $id) {
            return response()->json(['success' => false, 'message' => 'type and id required'], 422);
        }

        $maxId = $this->getMaxActivityId($type, $id);

        UserActivityView::updateOrCreate(
            ['user_id' => $user->id, 'entity_type' => $type, 'entity_id' => $id],
            ['last_viewed_activity_id' => $maxId]
        );

        return response()->json(['success' => true, 'lastViewedId' => $maxId]);
    }

    private function batchGetMaxActivityIds(array $entityTypes): array
    {
        $result = [];
        foreach ($entityTypes as $type => $ids) {
            $result[$type] = match ($type) {
                'project' => ProjectChange::whereIn('project_id', $ids)
                    ->groupBy('project_id')
                    ->pluck(DB::raw('MAX(id)'), 'project_id')
                    ->map(fn ($v) => (int) $v)
                    ->toArray(),
                'task' => collect(DB::select(
                    'SELECT u.task_id, GREATEST(COALESCE(MAX(tc.id),0), COALESCE(MAX(twe.id),0)) as max_id FROM ' .
                    '(SELECT ? AS task_id UNION SELECT ? FROM DUAL) u ' .
                    'LEFT JOIN task_changes tc ON tc.task_id = u.task_id ' .
                    'LEFT JOIN task_workflow_events twe ON twe.task_id = u.task_id GROUP BY u.task_id',
                    array_merge($ids, $ids)
                ))->pluck('max_id', 'task_id')->map(fn ($v) => (int) $v)->toArray(),
                'deliverable' => DeliverableChange::whereIn('deliverable_id', $ids)
                    ->groupBy('deliverable_id')
                    ->pluck(DB::raw('MAX(id)'), 'deliverable_id')
                    ->map(fn ($v) => (int) $v)
                    ->toArray(),
                'user' => UserChange::whereIn('user_id', $ids)
                    ->groupBy('user_id')
                    ->pluck(DB::raw('MAX(id)'), 'user_id')
                    ->map(fn ($v) => (int) $v)
                    ->toArray(),
                default => [],
            };
        }
        return $result;
    }

    private function batchCountUnread(array $entityTypes, $views): array
    {
        $result = [];
        foreach ($entityTypes as $type => $ids) {
            $result[$type] = [];
            foreach ($ids as $id) {
                $key = "{$type}:{$id}";
                $view = $views->get($key);
                $lastViewed = $view?->last_viewed_activity_id ?? 0;
                $result[$type][$id] = match ($type) {
                    'project' => ProjectChange::where('project_id', $id)->where('id', '>', $lastViewed)->count(),
                    'task' => TaskChange::where('task_id', $id)->where('id', '>', $lastViewed)->count()
                        + TaskWorkflowEvent::where('task_id', $id)->where('id', '>', $lastViewed)->count(),
                    'deliverable' => DeliverableChange::where('deliverable_id', $id)->where('id', '>', $lastViewed)->count(),
                    'user' => UserChange::where('user_id', $id)->where('id', '>', $lastViewed)->count(),
                    default => 0,
                };
            }
        }
        return $result;
    }

    /**
     * Get the maximum activity ID for a given entity type and ID.
     */
    private function getMaxActivityId(string $type, int $id): int
    {
        return match ($type) {
            'project' => max(
                (int) ProjectChange::where('project_id', $id)->max('id'),
                0
            ),
            'task' => max(
                (int) TaskChange::where('task_id', $id)->max('id'),
                (int) TaskWorkflowEvent::where('task_id', $id)->max('id'),
                0
            ),
            'deliverable' => max(
                (int) DeliverableChange::where('deliverable_id', $id)->max('id'),
                0
            ),
            'user' => max(
                (int) UserChange::where('user_id', $id)->max('id'),
                0
            ),
            default => 0,
        };
    }
}
