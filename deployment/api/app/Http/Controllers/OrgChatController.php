<?php

namespace App\Http\Controllers;

use App\Models\Master\OrgChatConversation;
use App\Models\Master\OrgChatMessage;
use App\Models\Master\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class OrgChatController extends Controller
{
    /**
     * Super Admin: List all org chat conversations.
     */
    public function superAdminIndex(Request $request): JsonResponse
    {
        $conversations = OrgChatConversation::with(['organization:id,name', 'latestMessage'])
            ->withCount('messages')
            ->latest('updated_at')
            ->get();

        return response()->json(['success' => true, 'conversations' => $conversations]);
    }

    /**
     * Super Admin: View a specific org chat conversation with messages.
     */
    public function superAdminShow(Request $request, int $conversationId): JsonResponse
    {
        $conversation = OrgChatConversation::with([
            'organization:id,name',
            'messages' => function ($q) {
                $q->with('organization:id,name')->oldest();
            },
        ])->findOrFail($conversationId);

        return response()->json(['success' => true, 'conversation' => $conversation]);
    }

    /**
     * Super Admin: Create a new org chat conversation.
     */
    public function superAdminStore(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'organization_id' => 'required|exists:organizations,id',
            'subject' => 'nullable|string|max:255',
            'message' => 'required|string|max:5000',
        ]);

        $user = $request->user();

        $conversation = OrgChatConversation::create([
            'subject' => $validated['subject'] ?? null,
            'organization_id' => $validated['organization_id'],
            'created_by_user_id' => $user->id,
        ]);

        OrgChatMessage::create([
            'conversation_id' => $conversation->id,
            'user_id' => $user->id,
            'body' => $validated['message'],
        ]);

        $conversation->load(['organization:id,name', 'latestMessage']);

        return response()->json([
            'success' => true,
            'message' => 'Conversation created',
            'conversation' => $conversation,
        ], 201);
    }

    /**
     * Super Admin: Send a message in an org chat conversation.
     */
    public function superAdminSend(Request $request, int $conversationId): JsonResponse
    {
        $conversation = OrgChatConversation::findOrFail($conversationId);

        $validated = $request->validate([
            'body' => 'required|string|max:5000',
            'file' => 'nullable|file|max:10240',
        ]);

        $user = $request->user();

        $messageData = [
            'conversation_id' => $conversation->id,
            'user_id' => $user->id,
            'body' => $validated['body'],
        ];

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = 'org_chat_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
            $path = $file->storeAs('org_chat_files/' . $conversation->id, $filename, 'public');
            $messageData['file_path'] = $path;
            $messageData['file_name'] = $file->getClientOriginalName();
        }

        $message = OrgChatMessage::create($messageData);
        $conversation->touch();

        $message->load('organization:id,name');

        return response()->json(['success' => true, 'message' => $message]);
    }

    /**
     * Organization: List their org chat conversations.
     */
    public function orgIndex(Request $request): JsonResponse
    {
        $org = $request->attributes->get('currentOrganization');

        $conversations = OrgChatConversation::where('organization_id', $org->id)
            ->with(['organization:id,name', 'latestMessage'])
            ->withCount('messages')
            ->latest('updated_at')
            ->get();

        return response()->json(['success' => true, 'conversations' => $conversations]);
    }

    /**
     * Organization: View a specific conversation with messages.
     */
    public function orgShow(Request $request, int $conversationId): JsonResponse
    {
        $org = $request->attributes->get('currentOrganization');

        $conversation = OrgChatConversation::where('organization_id', $org->id)
            ->with([
                'organization:id,name',
                'messages' => function ($q) {
                    $q->with('organization:id,name')->oldest();
                },
            ])
            ->findOrFail($conversationId);

        return response()->json(['success' => true, 'conversation' => $conversation]);
    }

    /**
     * Organization: Send a message in a conversation.
     */
    public function orgSend(Request $request, int $conversationId): JsonResponse
    {
        $org = $request->attributes->get('currentOrganization');

        $conversation = OrgChatConversation::where('organization_id', $org->id)
            ->findOrFail($conversationId);

        $validated = $request->validate([
            'body' => 'required|string|max:5000',
            'file' => 'nullable|file|max:10240',
        ]);

        $messageData = [
            'conversation_id' => $conversation->id,
            'organization_id' => $org->id,
            'body' => $validated['body'],
        ];

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = 'org_chat_' . time() . '_' . mt_rand(10000, 99999) . '_' . $file->getClientOriginalName();
            $path = $file->storeAs('org_chat_files/' . $conversation->id, $filename, 'public');
            $messageData['file_path'] = $path;
            $messageData['file_name'] = $file->getClientOriginalName();
        }

        $message = OrgChatMessage::create($messageData);
        $conversation->touch();

        $message->load('organization:id,name');

        return response()->json(['success' => true, 'message' => $message]);
    }

    /**
     * Download file attachment from org chat message.
     */
    public function downloadFile(Request $request, int $messageId): JsonResponse|\Symfony\Component\HttpFoundation\StreamedResponse
    {
        $message = OrgChatMessage::findOrFail($messageId);

        if (!$message->file_path || !Storage::disk('public')->exists($message->file_path)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        return Storage::disk('public')->download($message->file_path, $message->file_name);
    }

    /**
     * Super Admin: Get unread count across all org conversations.
     */
    public function superAdminUnreadCount(Request $request): JsonResponse
    {
        $count = OrgChatConversation::has('messages')->count();
        return response()->json(['unread_count' => $count]);
    }

    /**
     * Organization: Get unread count for their org conversations.
     */
    public function orgUnreadCount(Request $request): JsonResponse
    {
        $org = $request->attributes->get('currentOrganization');
        $count = OrgChatConversation::where('organization_id', $org->id)
            ->has('messages')
            ->count();
        return response()->json(['unread_count' => $count]);
    }
}
