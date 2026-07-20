<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TaskCommentController extends Controller
{
    public function __construct(
        private NotificationService $notificationService
    ) {}

    public function index(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $page = (int) $request->input('page', 1);
        $perPage = (int) $request->input('per_page', 50);

        $query = TaskComment::where('task_id', $task->id)
            ->whereNull('parent_id')
            ->with([
                'user:id,name,role,avatar',
                'replies' => function ($q) {
                    $q->with('user:id,name,role,avatar')->oldest();
                },
            ])
            ->orderBy('created_at', 'asc');

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

    public function store(Request $request, Task $task): JsonResponse
    {
        $user = $request->user();

        if (! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'body' => 'required|string|max:10000',
            'parent_id' => 'nullable|exists:task_comments,id',
            'file' => 'nullable|file|max:20480',
        ]);

        if (! empty($validated['parent_id'])) {
            $parent = TaskComment::where('id', $validated['parent_id'])
                ->where('task_id', $task->id)
                ->first();
            if (! $parent) {
                return response()->json(['success' => false, 'message' => 'Parent comment not found.'], 404);
            }
        }

        $commentData = [
            'task_id' => $task->id,
            'user_id' => $user->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'body' => $validated['body'],
        ];

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = 'comment_'.time().'_'.mt_rand(10000, 99999).'.'.$file->getClientOriginalExtension();
            $path = $file->storeAs('task-comments/'.$task->id, $filename, 'public');
            $commentData['file_path'] = $path;
            $commentData['file_name'] = $file->getClientOriginalName();
            $commentData['file_size'] = $file->getSize();
        }

        $comment = TaskComment::create($commentData);
        $comment->load('user:id,name,role,avatar');

        $this->notifyTaskParticipants($task, $user, $comment);

        return response()->json([
            'success' => true,
            'message' => 'Comment posted successfully.',
            'comment' => $comment,
        ], 201);
    }

    public function update(Request $request, Task $task, TaskComment $comment): JsonResponse
    {
        $user = $request->user();

        if ((int) $comment->user_id !== (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'You can only edit your own comments.'], 403);
        }

        if ((int) $comment->task_id !== (int) $task->id) {
            return response()->json(['success' => false, 'message' => 'Comment does not belong to this task.'], 404);
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

        return response()->json([
            'success' => true,
            'message' => 'Comment updated successfully.',
            'comment' => $comment,
        ]);
    }

    public function destroy(Request $request, Task $task, TaskComment $comment): JsonResponse
    {
        $user = $request->user();

        if ((int) $comment->task_id !== (int) $task->id) {
            return response()->json(['success' => false, 'message' => 'Comment does not belong to this task.'], 404);
        }

        $canDelete = (int) $comment->user_id === (int) $user->id
            || $user->role === 'admin'
            || $user->role === 'manager';

        if (! $canDelete) {
            return response()->json(['success' => false, 'message' => 'You do not have permission to delete this comment.'], 403);
        }

        if ($comment->file_path && Storage::disk('public')->exists($comment->file_path)) {
            Storage::disk('public')->delete($comment->file_path);
        }

        $comment->delete();

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

        $total = TaskComment::where('task_id', $task->id)->count();

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

        $task->load(['assignees:id,name,role,avatar', 'assigner:id,name,role,avatar']);

        $participants = collect();

        if ($task->assigner) {
            $participants->push($task->assigner);
        }

        foreach ($task->assignees as $assignee) {
            if (! $participants->contains('id', $assignee->id)) {
                $participants->push($assignee);
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

        return response()->json([
            'success' => true,
            'participants' => $participants->values(),
        ]);
    }

    public function downloadFile(Request $request, TaskComment $comment)
    {
        $user = $request->user();
        $task = Task::find($comment->task_id);

        if (! $task || ! $this->canAccessTask($user, $task)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        if (! $comment->file_path || ! Storage::disk('public')->exists($comment->file_path)) {
            return response()->json(['success' => false, 'message' => 'File not found.'], 404);
        }

        return Storage::disk('public')->download($comment->file_path, $comment->file_name);
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
        }

        return false;
    }

    private function notifyTaskParticipants(Task $task, User $poster, TaskComment $comment): void
    {
        $notifyUserIds = [];

        if ($task->assigner && (int) $task->assigner->id !== (int) $poster->id) {
            $notifyUserIds[] = $task->assigner->id;
        }

        $task->load('assignees');
        foreach ($task->assignees as $assignee) {
            if ((int) $assignee->id !== (int) $poster->id) {
                $notifyUserIds[] = $assignee->id;
            }
        }

        if ((int) $task->assigned_to && (int) $task->assigned_to !== (int) $poster->id) {
            $notifyUserIds[] = (int) $task->assigned_to;
        }

        $notifyUserIds = array_unique($notifyUserIds);
        $notifyUserIds = array_filter($notifyUserIds);

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
            $link
        );
    }
}
