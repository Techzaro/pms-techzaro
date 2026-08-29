<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\Deliverable;
use App\Models\Message;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Master\Organization;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Services\StorageDiskResolver;

class ChatController extends Controller
{
    public function __construct(
        private NotificationService $notificationService
    ) {}

    public function index(Request $request)
    {
        $user = $request->user();

        $conversations = Conversation::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
            ->with(['project:id,title', 'task:id,title', 'deliverable:id,title', 'creator:id,name,role', 'organization:id,name', 'latestMessage' => function ($q) {
                $q->with('user:id,name,role');
            }])
            ->withCount('messages')
            ->latest('updated_at')
            ->get();

        foreach ($conversations as $conversation) {
            $conversation->unread_messages_count = $conversation->unreadCountForUser($user->id);
        }

        return response()->json(['success' => true, 'conversations' => $conversations]);
    }

    public function chatItems(Request $request)
    {
        $user = $request->user();

        if ($user->role === 'guest') {
            $guestProjectIds = Project::whereJsonContains('guest_ids', $user->id)->pluck('id');

            $projects = Project::select('id', 'title')
                ->whereIn('id', $guestProjectIds)
                ->orderBy('title')
                ->get();

            $tasks = Task::select('id', 'title', 'project_id')
                ->whereIn('project_id', $guestProjectIds)
                ->orderBy('title')
                ->get();

            $deliverables = Deliverable::select('id', 'title', 'project_id')
                ->whereIn('project_id', $guestProjectIds)
                ->orderBy('title')
                ->get();

            $organizations = collect();
        } else {
            $projects = Project::select('id', 'title')
                ->orderBy('title')
                ->get();

            $tasks = Task::select('id', 'title', 'project_id')
                ->orderBy('title')
                ->get();

            $deliverables = Deliverable::select('id', 'title', 'project_id')
                ->orderBy('title')
                ->get();

            $organizations = in_array($user->role, ['admin', 'manager'])
                ? Organization::select('id', 'name')->where('status', 'active')->orderBy('name')->get()
                : collect();
        }

        return response()->json([
            'success' => true,
            'projects' => $projects,
            'tasks' => $tasks,
            'deliverables' => $deliverables,
            'organizations' => $organizations,
        ]);
    }

    public function show(Request $request, Conversation $conversation)
    {
        $user = $request->user();

        if (!$conversation->participants()->where('user_id', $user->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Mark as read
        $conversation->participants()->updateExistingPivot($user->id, [
            'is_read' => true,
            'last_read_at' => now(),
        ]);

        $conversation->load([
            'project:id,title',
            'task:id,title',
            'deliverable:id,title',
            'creator:id,name,role',
            'organization:id,name',
            'participants:id,name,role,avatar',
            'messages' => function ($q) {
                $q->with('user:id,name,role,avatar')->oldest();
            },
        ]);

        return response()->json(['success' => true, 'conversation' => $conversation]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'subject' => 'nullable|string|max:255',
            'project_id' => 'nullable|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'deliverable_id' => 'nullable|exists:deliverables,id',
            'org_id' => 'nullable|integer',
            'participant_ids' => 'required|array|min:1',
            'participant_ids.*' => 'exists:users,id',
            'message' => 'required|string|max:5000',
        ]);

        $user = $request->user();

        // Only admin/manager can create org conversations
        if (!empty($validated['org_id']) && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Only admin or manager can chat with organizations.'], 403);
        }

        // Validate org exists in master DB
        if (!empty($validated['org_id'])) {
            $org = Organization::find($validated['org_id']);
            if (!$org) {
                return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
            }
        }

        // Verify guest can only create conversations for their own projects
        if ($user->role === 'guest' && !empty($validated['project_id'])) {
            $project = Project::find($validated['project_id']);
            if (!$project || !$project->isAccessibleByGuest($user)) {
                return response()->json(['success' => false, 'message' => 'You can only create conversations for your own projects.'], 403);
            }
        }

        // Ensure the creator is included as a participant
        $participantIds = array_unique(array_merge($validated['participant_ids'], [$user->id]));

        $conversation = Conversation::create([
            'subject' => $validated['subject'],
            'project_id' => $validated['project_id'] ?? null,
            'task_id' => $validated['task_id'] ?? null,
            'deliverable_id' => $validated['deliverable_id'] ?? null,
            'org_id' => $validated['org_id'] ?? null,
            'created_by' => $user->id,
        ]);

        $conversation->participants()->attach($participantIds, ['is_read' => false]);

        $message = $conversation->messages()->create([
            'user_id' => $user->id,
            'body' => $validated['message'],
        ]);

        // Notify other participants
        foreach ($participantIds as $participantId) {
            if ((int) $participantId !== (int) $user->id) {
                $this->notificationService->create([
                    'user_id' => (int) $participantId,
                    'type' => 'chat_message',
                    'title' => 'New Message',
                    'message' => "{$user->name} sent a message in conversation: {$conversation->subject}",
                    'related_module' => 'chat',
                    'related_id' => $conversation->id,
                    'link' => "/chat/{$conversation->id}",
                    'sender_user_id' => $user->id,
                ]);
            }
        }

        $conversation->load(['project:id,title', 'creator:id,name,role', 'organization:id,name', 'participants:id,name,role,avatar', 'latestMessage' => function ($q) { $q->with('user:id,name,role'); }]);

        return response()->json([
            'success' => true,
            'message' => 'Conversation created successfully',
            'conversation' => $conversation,
        ], 201);
    }

    public function sendMessage(Request $request, Conversation $conversation)
    {
        $user = $request->user();

        if (!$conversation->participants()->where('user_id', $user->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'body' => 'required|string|max:5000',
            'file' => 'nullable|file|max:10240',
        ]);

        $messageData = [
            'user_id' => $user->id,
            'body' => $validated['body'],
        ];

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = 'chat_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $path = StorageDiskResolver::store($org, $file, 'chat_files/' . $conversation->id, $filename);
            } else {
                $path = $file->storeAs('chat_files/' . $conversation->id, $filename, 'public');
            }
            $messageData['file_path'] = $path;
            $messageData['file_name'] = $file->getClientOriginalName();
        }

        $message = $conversation->messages()->create($messageData);
        $conversation->touch();

        // Notify other participants
        $participantIds = $conversation->participants()->pluck('users.id')->toArray();
        foreach ($participantIds as $participantId) {
            if ((int) $participantId !== (int) $user->id) {
                $this->notificationService->create([
                    'user_id' => (int) $participantId,
                    'type' => 'chat_message',
                    'title' => 'New Message',
                    'message' => "{$user->name} sent a message in: {$conversation->subject}",
                    'related_module' => 'chat',
                    'related_id' => $conversation->id,
                    'link' => "/chat/{$conversation->id}",
                    'sender_user_id' => $user->id,
                ]);
            }
        }

        $message->load('user:id,name,role,avatar');

        return response()->json([
            'success' => true,
            'message' => $message,
        ]);
    }

    public function downloadFile(Request $request, Message $message)
    {
        $user = $request->user();

        if (!$message->conversation->participants()->where('user_id', $user->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            $exists = StorageDiskResolver::exists($org, $message->file_path);
        } else {
            $exists = Storage::disk('public')->exists($message->file_path);
        }
        if (!$message->file_path || !$exists) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        if ($org) {
            $disk = StorageDiskResolver::getDisk($org);
            if ($disk === 's3') {
                try {
                    $temporaryUrl = StorageDiskResolver::getTemporaryUrl($org, $message->file_path, 60);
                    $disposition = 'attachment; filename="' . $message->file_name . '"';
                    $temporaryUrl .= '&response-content-disposition=' . urlencode($disposition);
                    return redirect()->away($temporaryUrl);
                } catch (\Throwable $e) {
                    \Log::error('S3 redirect failed for chat file', ['file_path' => $message->file_path, 'error' => $e->getMessage()]);
                }
            }
            return Storage::disk($disk)->download($message->file_path, $message->file_name);
        }
        return Storage::disk('public')->download($message->file_path, $message->file_name);
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();

        $conversations = Conversation::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))->get();

        $count = 0;
        foreach ($conversations as $conversation) {
            $count += $conversation->unreadCountForUser($user->id);
        }

        return response()->json(['unread_count' => $count]);
    }
}
