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

        foreach ($entities as $entity) {
            $type = $entity['type'] ?? null;
            $id = $entity['id'] ?? null;
            if (! $type || ! $id) {
                continue;
            }

            $key = "{$type}:{$id}";
            $maxId = $this->getMaxActivityId($type, $id);
            $view = UserActivityView::where('user_id', $user->id)
                ->where('entity_type', $type)
                ->where('entity_id', $id)
                ->first();

            $lastViewed = $view?->last_viewed_activity_id ?? 0;
            $hasUnread = $maxId > $lastViewed;
            $unreadCount = $hasUnread ? $this->countUnread($type, $id, $lastViewed) : 0;

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

    /**
     * Count unread activities for a given entity.
     */
    private function countUnread(string $type, int $id, int $lastViewedId): int
    {
        return match ($type) {
            'project' => ProjectChange::where('project_id', $id)
                ->where('id', '>', $lastViewedId)
                ->count(),
            'task' => TaskChange::where('task_id', $id)
                ->where('id', '>', $lastViewedId)
                ->count()
                + TaskWorkflowEvent::where('task_id', $id)
                    ->where('id', '>', $lastViewedId)
                    ->count(),
            'deliverable' => DeliverableChange::where('deliverable_id', $id)
                ->where('id', '>', $lastViewedId)
                ->count(),
            'user' => UserChange::where('user_id', $id)
                ->where('id', '>', $lastViewedId)
                ->count(),
            default => 0,
        };
    }
}
