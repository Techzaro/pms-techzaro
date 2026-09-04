<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\StorageDiskResolver;

class TaskCommentController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    public function index(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return $this->getComments($request, null, $task->id);
    }

    public function indexByDeliverable(Request $request, Deliverable $deliverable): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessDeliverable($user, $deliverable)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return $this->getComments($request, $deliverable->id, null);
    }

    private function getComments(Request $request, ?int $deliverableId, ?int $taskId): JsonResponse
    {
        $user = $request->user();
        $page = (int) $request->input('page', 1);
        $perPage = (int) $request->input('per_page', 50);

        $query = TaskComment::whereNull('parent_id')
            ->with([
                'user:id,name,role,avatar',
                'quotedComment:id,user_id,body,file_name',
                'quotedComment.user:id,name,avatar',
                'replies' => function ($q) {
                    $q->with([
                        'user:id,name,role,avatar',
                        'quotedComment:id,user_id,body,file_name',
                        'quotedComment.user:id,name,avatar',
                    ])->oldest();
                },
            ])
            ->orderBy('created_at', 'asc');

        if ($deliverableId) {
            $query->where('deliverable_id', $deliverableId);
        } else {
            $query->where('task_id', $taskId)->whereNull('deliverable_id');
        }

        // Chat separation: if the user is a transferee, only show their delegation's comments
        $activeDelegation = $this->getActiveDelegation($user->id, $deliverableId, $taskId);
        if ($activeDelegation) {
            $query->where('delegation_id', $activeDelegation->id);
        }

        $total = (clone $query)->count();
        $comments = $query->skip(($page - 1) * $perPage)->take($perPage)->get();

        return response()->json([
            'success' => true,
            'comments' => $comments,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => (int) ceil($total / $perPage),
        ]);
    }

    private function getActiveDelegation(int $userId, ?int $deliverableId, ?int $taskId): ?TaskDelegation
    {
        $query = TaskDelegation::where('delegated_to', $userId)->where('status', 'accepted');
        if ($deliverableId) {
            $query->where('deliverable_id', $deliverableId);
        } elseif ($taskId) {
            $query->where('task_id', $taskId)->whereNull('deliverable_id');
        }
        return $query->latest()->first();
    }

    public function store(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return $this->createComment($request, $task->id, null, $user);
    }

    public function storeByDeliverable(Request $request, Deliverable $deliverable): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessDeliverable($user, $deliverable)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return $this->createComment($request, null, $deliverable->id, $user, $deliverable);
    }

    private function createComment(Request $request, ?int $taskId, ?int $deliverableId, User $user, ?Deliverable $deliverable = null): JsonResponse
    {
        $validated = $request->validate([
            'body' => 'required|string|max:10000',
            'parent_id' => 'nullable|exists:task_comments,id',
            'quoted_message_id' => 'nullable|exists:task_comments,id',
            'quoted_text' => 'nullable|string|max:5000',
            'file' => 'nullable|file|max:20480',
            'mentioned_user_ids' => 'nullable|array',
            'mentioned_user_ids.*' => 'integer|exists:users,id',
        ]);

        if (! empty($validated['parent_id'])) {
            $parentQuery = TaskComment::where('id', $validated['parent_id']);
            if ($deliverableId) {
                $parentQuery->where('deliverable_id', $deliverableId);
            } else {
                $parentQuery->where('task_id', $taskId)->whereNull('deliverable_id');
            }
            if (! $parentQuery->first()) {
                return response()->json(['success' => false, 'message' => 'Parent comment not found.'], 404);
            }
        }

        // Tag comment with active delegation for chat separation
        $activeDelegation = $this->getActiveDelegation($user->id, $deliverableId, $taskId);

        $commentData = [
            'user_id' => $user->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'quoted_message_id' => $validated['quoted_message_id'] ?? null,
            'quoted_text' => $validated['quoted_text'] ?? null,
            'body' => $validated['body'],
            'delegation_id' => $activeDelegation?->id,
        ];

        if ($deliverableId) {
            $commentData['task_id'] = $deliverable?->task_id;
            $commentData['deliverable_id'] = $deliverableId;
        } else {
            $commentData['task_id'] = $taskId;
        }

        $storageDir = $deliverableId ? 'deliverable-comments/'.$deliverableId : 'task-comments/'.$taskId;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = 'comment_'.time().'_'.mt_rand(10000, 99999).'.'.$file->getClientOriginalExtension();
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $path = StorageDiskResolver::store($org, $file, $storageDir, $filename);
            } else {
                $path = $file->storeAs($storageDir, $filename, 'public');
            }
            $commentData['file_path'] = $path;
            $commentData['file_name'] = $file->getClientOriginalName();
            $commentData['file_size'] = $file->getSize();
        }

        $comment = TaskComment::create($commentData);
        $comment->load([
            'user:id,name,role,avatar',
            'quotedComment:id,user_id,body,file_name',
            'quotedComment.user:id,name,avatar',
        ]);

        // Mention notifications
        if (! empty($validated['mentioned_user_ids'])) {
            $this->notifyMentionedUsers($validated['mentioned_user_ids'], $user, $comment, $taskId, $deliverableId, $deliverable);
        }

        if ($deliverableId && $deliverable) {
            $this->notifyDeliverableParticipants($deliverable, $user, $comment);
        } elseif ($taskId) {
            $task = Task::find($taskId);
            if ($task) {
                $this->notifyTaskParticipants($task, $user, $comment);
            }
        }

        $targetTaskId = $taskId ?: ($deliverable ? $deliverable->task_id : null);
        $moduleName = $deliverableId ? 'Subtask Management' : 'Task Management';
        $entityType = $deliverableId ? 'deliverable' : 'task';
        $entityId = $deliverableId ?: $targetTaskId;
        $commentDesc = $deliverableId ? 'Added a comment to subtask' : 'Added a comment to task';

        if ($targetTaskId) {
            $this->activityService->log(
                $user->id,
                'task_comment_added',
                $commentDesc,
                'task',
                $targetTaskId,
                'comment_added',
                null,
                null,
                ['comment_id' => $comment->id, 'deliverable_id' => $deliverableId]
            );
        }

        try {
            $this->auditService->log(
                module: $moduleName,
                action: 'Comment Added',
                description: $commentDesc,
                user: $user,
                entityType: $entityType,
                entityId: $entityId,
                newValues: ['comment_id' => $comment->id, 'task_id' => $targetTaskId, 'deliverable_id' => $deliverableId],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit for comment', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Comment posted successfully.',
            'comment' => $comment,
        ], 201);
    }

    public function update(Request $request, TaskComment $comment): JsonResponse
    {
        $user = $request->user();

        if ((int) $comment->user_id !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'You can only edit your own comments.'], 403);
        }

        $editWindowMinutes = 15;
        $createdAt = $comment->created_at;
        if ($createdAt && $createdAt->diffInMinutes(now()) > $editWindowMinutes) {
            if ($user->role !== 'admin' && $user->role !== 'manager') {
                return response()->json(['success' => false, 'message' => 'Edit time window expired. Comments can only be edited within 15 minutes of posting.'], 403);
            }
        }

        $validated = $request->validate([
            'body' => 'required|string|max:10000',
        ]);

        $comment->update([
            'body' => $validated['body'],
            'is_edited' => true,
            'edited_at' => now(),
        ]);

        $comment->load('user:id,name,role,avatar');

        $targetTaskId = $comment->task_id ?: ($comment->deliverable ? $comment->deliverable->task_id : null);
        $moduleName = $comment->deliverable_id ? 'Subtask Management' : 'Task Management';
        $entityType = $comment->deliverable_id ? 'deliverable' : 'task';
        $entityId = $comment->deliverable_id ?: $targetTaskId;
        $commentDesc = $comment->deliverable_id ? 'Edited a comment on subtask' : 'Edited a comment on task';

        if ($targetTaskId) {
            $this->activityService->log(
                $user->id,
                'task_comment_edited',
                $commentDesc,
                'task',
                $targetTaskId,
                'comment_edited',
                null,
                null,
                ['comment_id' => $comment->id]
            );
        }

        try {
            $this->auditService->log(
                module: $moduleName,
                action: 'Comment Edited',
                description: $commentDesc,
                user: $user,
                entityType: $entityType,
                entityId: $entityId,
                newValues: ['comment_id' => $comment->id, 'task_id' => $targetTaskId, 'deliverable_id' => $comment->deliverable_id],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit for comment update', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Comment updated successfully.',
            'comment' => $comment,
        ]);
    }

    public function destroy(Request $request, TaskComment $comment): JsonResponse
    {
        $user = $request->user();

        $canDelete = (int) $comment->user_id === (int) $user->id
            || $user->role === 'admin'
            || $user->role === 'manager';

        if (! $canDelete) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to delete this comment.'], 403);
        }

        if ($comment->file_path) {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                StorageDiskResolver::delete($org, $comment->file_path);
            } elseif (Storage::disk('public')->exists($comment->file_path)) {
                Storage::disk('public')->delete($comment->file_path);
            }
        }

        $targetTaskId = $comment->task_id ?: ($comment->deliverable ? $comment->deliverable->task_id : null);
        $moduleName = $comment->deliverable_id ? 'Subtask Management' : 'Task Management';
        $entityType = $comment->deliverable_id ? 'deliverable' : 'task';
        $entityId = $comment->deliverable_id ?: $targetTaskId;
        $commentDesc = $comment->deliverable_id ? 'Deleted a comment from subtask' : 'Deleted a comment from task';

        if ($targetTaskId) {
            $this->activityService->log(
                $user->id,
                'task_comment_deleted',
                $commentDesc,
                'task',
                $targetTaskId,
                'comment_deleted',
                null,
                null,
                ['comment_id' => $comment->id, 'deliverable_id' => $comment->deliverable_id]
            );
        }

        $comment->delete();

        try {
            $this->auditService->log(
                module: $moduleName,
                action: 'Comment Deleted',
                description: $commentDesc,
                user: $user,
                entityType: $entityType,
                entityId: $entityId,
                oldValues: ['comment_id' => $comment->id, 'task_id' => $targetTaskId, 'deliverable_id' => $comment->deliverable_id],
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit for comment deletion', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Comment deleted successfully.',
        ]);
    }

    public function count(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $total = TaskComment::where('task_id', $task->id)->whereNull('deliverable_id')->count();

        return response()->json([
            'success' => true,
            'total' => $total,
        ]);
    }

    public function countByDeliverable(Request $request, Deliverable $deliverable): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessDeliverable($user, $deliverable)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $total = TaskComment::where('deliverable_id', $deliverable->id)->count();

        return response()->json([
            'success' => true,
            'total' => $total,
        ]);
    }

    public function participants(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'success' => true,
            'participants' => $this->getTaskParticipants($task),
        ]);
    }

    public function participantsByDeliverable(Request $request, Deliverable $deliverable): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessDeliverable($user, $deliverable)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $deliverable->load(['assignees:id,name,role,avatar', 'creator:id,name,role,avatar', 'task:id,title,assigned_by']);

        $participants = collect();

        if ($deliverable->creator) {
            $participants->push($deliverable->creator);
        }

        foreach ($deliverable->assignees as $assignee) {
            if (! $participants->contains('id', $assignee->id)) {
                $participants->push($assignee);
            }
        }

        if ($deliverable->task && $deliverable->task->assigned_by) {
            $taskCreator = User::find($deliverable->task->assigned_by);
            if ($taskCreator && ! $participants->contains('id', $taskCreator->id)) {
                $participants->push($taskCreator);
            }
        }

        if ($deliverable->project && $deliverable->project->team_id) {
            $teamMembers = User::whereHas('teams', function ($q) use ($deliverable) {
                $q->where('teams.id', $deliverable->project->team_id);
            })->get(['id', 'name', 'role', 'avatar']);

            foreach ($teamMembers as $member) {
                if (! $participants->contains('id', $member->id)) {
                    $participants->push($member);
                }
            }
        }

        $admins = User::whereIn('role', ['admin', 'manager'])->get(['id', 'name', 'role', 'avatar']);
        foreach ($admins as $admin) {
            if (! $participants->contains('id', $admin->id)) {
                $participants->push($admin);
            }
        }

        return response()->json([
            'success' => true,
            'participants' => $participants->values(),
        ]);
    }

    public function downloadFile(Request $request, TaskComment $comment)
    {
        $user = $request->user();

        if ($comment->task_id) {
            $task = Task::find($comment->task_id);
            if (! $task || ! $this->canAccessTask($user, $task)) {
                return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
            }
        } elseif ($comment->deliverable_id) {
            $deliverable = Deliverable::find($comment->deliverable_id);
            if (! $deliverable || ! $this->canAccessDeliverable($user, $deliverable)) {
                return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
            }
        }

        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            $exists = StorageDiskResolver::exists($org, $comment->file_path);
        } else {
            $exists = Storage::disk('public')->exists($comment->file_path);
        }
        if (! $comment->file_path || ! $exists) {
            return response()->json(['success' => false, 'message' => 'File not found.'], 404);
        }

        if ($org) {
            $disk = StorageDiskResolver::getDisk($org);
            if ($disk === 's3') {
                try {
                    $temporaryUrl = StorageDiskResolver::getTemporaryUrl($org, $comment->file_path, 60);
                    $disposition = 'attachment; filename="' . $comment->file_name . '"';
                    $temporaryUrl .= '&response-content-disposition=' . urlencode($disposition);
                    return redirect()->away($temporaryUrl);
                } catch (\Throwable $e) {
                    \Log::error('S3 redirect failed for task comment file', ['file_path' => $comment->file_path, 'error' => $e->getMessage()]);
                }
            }
            return Storage::disk($disk)->download($comment->file_path, $comment->file_name);
        }
        return Storage::disk('public')->download($comment->file_path, $comment->file_name);
    }

    private function getTaskParticipants(Task $task): Collection
    {
        $task->load(['assignees:id,name,role,avatar', 'assigner:id,name,role,avatar', 'followers:id,name,role,avatar']);

        $participants = collect();

        if ($task->assigner) {
            $participants->push($task->assigner);
        }

        foreach ($task->assignees as $assignee) {
            if (! $participants->contains('id', $assignee->id)) {
                $participants->push($assignee);
            }
        }

        foreach ($task->followers as $follower) {
            if (! $participants->contains('id', $follower->id)) {
                $participants->push($follower);
            }
        }

        if ($task->project && $task->project->team_id) {
            $teamMembers = User::whereHas('teams', function ($q) use ($task) {
                $q->where('teams.id', $task->project->team_id);
            })->get(['id', 'name', 'role', 'avatar']);

            foreach ($teamMembers as $member) {
                if (! $participants->contains('id', $member->id)) {
                    $participants->push($member);
                }
            }
        }

        $admins = User::whereIn('role', ['admin', 'manager'])->get(['id', 'name', 'role', 'avatar']);
        foreach ($admins as $admin) {
            if (! $participants->contains('id', $admin->id)) {
                $participants->push($admin);
            }
        }

        return $participants->values();
    }

    private function canAccessTask(User $user, Task $task): bool
    {
        if (in_array($user->role, ['admin', 'manager'])) {
            return true;
        }

        if ((int) $task->assigned_by === (int) $user->id) {
            return true;
        }

        if ($task->assignees()->where('users.id', $user->id)->exists()) {
            return true;
        }

        if ($task->followers()->where('users.id', $user->id)->exists()) {
            return true;
        }

        if ((int) $task->assigned_to === (int) $user->id) {
            return true;
        }

        if ($task->project) {
            if ((int) $task->project->created_by === (int) $user->id) {
                return true;
            }

            if ($task->project->team_id) {
                if ($user->teams()->where('teams.id', $task->project->team_id)->exists()) {
                    return true;
                }
            }

            if ($user->role === 'guest' && $task->project->isAccessibleByGuest($user)) {
                return true;
            }
        }

        return false;
    }

    private function canAccessDeliverable(User $user, Deliverable $deliverable): bool
    {
        if (in_array($user->role, ['admin', 'manager'])) {
            return true;
        }

        if ((int) $deliverable->created_by === (int) $user->id) {
            return true;
        }

        if ((int) $deliverable->assigned_to === (int) $user->id) {
            return true;
        }

        if ($deliverable->assignees()->where('users.id', $user->id)->exists()) {
            return true;
        }

        if ($deliverable->task) {
            return $this->canAccessTask($user, $deliverable->task);
        }

        if ($deliverable->project) {
            if ((int) $deliverable->project->created_by === (int) $user->id) {
                return true;
            }

            if ($deliverable->project->team_id) {
                if ($user->teams()->where('teams.id', $deliverable->project->team_id)->exists()) {
                    return true;
                }
            }
        }

        return false;
    }

    private function notifyMentionedUsers(array $mentionedUserIds, User $poster, TaskComment $comment, ?int $taskId, ?int $deliverableId, ?Deliverable $deliverable = null): void
    {
        $filteredIds = array_unique(array_filter(
            $mentionedUserIds,
            fn ($id) => ! empty($id) && (int) $id !== (int) $poster->id
        ));

        if (empty($filteredIds)) {
            return;
        }

        $task = null;
        if ($taskId) {
            $task = Task::with('project')->find($taskId);
        } elseif ($deliverableId && $deliverable) {
            $deliverable->load('task.project');
            $task = $deliverable->task;
        }

        $entityTitle = $task ? $task->title : ($deliverable ? $deliverable->title : 'Task');
        $module = $taskId ? 'task' : 'deliverable';
        $relatedId = $taskId ?: $deliverableId;
        $title = 'You were mentioned in a comment';
        $message = "{$poster->name} mentioned you in a comment on " . ($taskId ? "task \"{$entityTitle}\"" : "subtask \"{$entityTitle}\"");
        $link = $taskId ? "/tasks/task-details/{$taskId}" : "/deliveries/deliverable-details/{$deliverableId}";

        $this->notificationService->notifyMultiple(
            array_values($filteredIds),
            $poster->id,
            'task_mention',
            $module,
            $relatedId,
            $title,
            $message,
            $link,
            [
                'comment_text' => $comment->body,
                'comment_by' => $poster->name,
                'comment_at' => $comment->created_at ? $comment->created_at->format('d M Y, g:i A') : now()->format('d M Y, g:i A'),
                'task_name' => $entityTitle,
                'project_name' => $task?->project?->title ?? null,
            ]
        );
    }

    private function notifyTaskParticipants(Task $task, User $poster, TaskComment $comment): void
    {
        $notifyUserIds = [];

        if ($task->assigner && (int) $task->assigner->id !== (int) $poster->id) {
            $notifyUserIds[] = $task->assigner->id;
        }

        $task->load(['assignees', 'followers']);
        foreach ($task->assignees as $assignee) {
            if ((int) $assignee->id !== (int) $poster->id) {
                $notifyUserIds[] = $assignee->id;
            }
        }

        foreach ($task->followers as $follower) {
            if ((int) $follower->id !== (int) $poster->id) {
                $notifyUserIds[] = $follower->id;
            }
        }

        if ($comment->parent_id) {
            $parentComment = TaskComment::find($comment->parent_id);
            if ($parentComment && $parentComment->user_id && (int) $parentComment->user_id !== (int) $poster->id) {
                $notifyUserIds[] = (int) $parentComment->user_id;
            }
        }

        if ($comment->quoted_message_id) {
            $quotedComment = TaskComment::find($comment->quoted_message_id);
            if ($quotedComment && $quotedComment->user_id && (int) $quotedComment->user_id !== (int) $poster->id) {
                $notifyUserIds[] = (int) $quotedComment->user_id;
            }
        }

        $notifyUserIds = array_unique(array_filter($notifyUserIds));

        if (empty($notifyUserIds)) {
            return;
        }

        $actionType = $comment->parent_id ? 'replied' : 'commented';
        $title = 'New Comment on Task';
        $message = "{$poster->name} {$actionType} on task \"{$task->title}\"";
        $link = "/tasks/task-details/{$task->id}";

        $this->notificationService->notifyMultiple(
            array_values($notifyUserIds),
            $poster->id,
            'task_comment',
            'task',
            $task->id,
            $title,
            $message,
            $link,
            [
                'comment_text' => $comment->body,
                'comment_by' => $poster->name,
                'comment_at' => $comment->created_at ? $comment->created_at->format('d M Y, g:i A') : now()->format('d M Y, g:i A'),
                'task_name' => $task->title,
                'project_name' => $task->project->title ?? null,
            ]
        );
    }

    private function notifyDeliverableParticipants(Deliverable $deliverable, User $poster, TaskComment $comment): void
    {
        $notifyUserIds = [];

        if ($deliverable->creator && (int) $deliverable->creator->id !== (int) $poster->id) {
            $notifyUserIds[] = $deliverable->creator->id;
        }

        if ((int) $deliverable->assigned_to && (int) $deliverable->assigned_to !== (int) $poster->id) {
            $notifyUserIds[] = (int) $deliverable->assigned_to;
        }

        $deliverable->load('assignees');
        foreach ($deliverable->assignees as $assignee) {
            if ((int) $assignee->id !== (int) $poster->id) {
                $notifyUserIds[] = $assignee->id;
            }
        }

        if ($deliverable->task) {
            $task = $deliverable->task;
            if ($task->assigner && (int) $task->assigner->id !== (int) $poster->id) {
                $notifyUserIds[] = $task->assigner->id;
            }
        }

        if ($comment->parent_id) {
            $parentComment = TaskComment::find($comment->parent_id);
            if ($parentComment && $parentComment->user_id && (int) $parentComment->user_id !== (int) $poster->id) {
                $notifyUserIds[] = (int) $parentComment->user_id;
            }
        }

        if ($comment->quoted_message_id) {
            $quotedComment = TaskComment::find($comment->quoted_message_id);
            if ($quotedComment && $quotedComment->user_id && (int) $quotedComment->user_id !== (int) $poster->id) {
                $notifyUserIds[] = (int) $quotedComment->user_id;
            }
        }

        $notifyUserIds = array_unique(array_filter($notifyUserIds));

        if (empty($notifyUserIds)) {
            return;
        }

        $actionType = $comment->parent_id ? 'replied' : 'commented';
        $title = 'New Comment on Subtask';
        $message = "{$poster->name} {$actionType} on subtask \"{$deliverable->title}\"";
        $link = "/deliveries/deliverable-details/{$deliverable->id}";

        $this->notificationService->notifyMultiple(
            array_values($notifyUserIds),
            $poster->id,
            'deliverable_comment',
            'deliverable',
            $deliverable->id,
            $title,
            $message,
            $link,
            [
                'comment_text' => $comment->body,
                'comment_by' => $poster->name,
                'comment_at' => $comment->created_at ? $comment->created_at->format('d M Y, g:i A') : now()->format('d M Y, g:i A'),
                'task_name' => $deliverable->title,
                'project_name' => $deliverable->project->title ?? null,
            ]
        );
    }
}
