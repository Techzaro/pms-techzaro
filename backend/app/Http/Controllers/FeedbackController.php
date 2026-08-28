<?php

namespace App\Http\Controllers;

use App\Models\Feedback;
use App\Services\FeedbackService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FeedbackController extends Controller
{
    public function __construct(
        private FeedbackService $feedbackService
    ) {}

    /**
     * Submit new user feedback.
     * POST /api/feedback
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'feedback_type'     => ['required', Rule::in(['Bug Report', 'Feature Request', 'General Suggestion', 'Feature Rating', 'General Feedback'])],
            'subject'           => ['required', 'string', 'max:255'],
            'description'       => ['required', 'string'],
            'priority'          => ['nullable', Rule::in(['Low', 'Medium', 'High', 'Urgent'])],
            'rating'            => ['nullable', 'integer', 'min:1', 'max:5'],
            'module'            => ['nullable', 'string', 'max:100'],
            'current_page'      => ['nullable', 'string', 'max:255'],
            'browser'           => ['nullable', 'string', 'max:100'],
            'operating_system'  => ['nullable', 'string', 'max:100'],
            'device_type'       => ['nullable', 'string', 'max:50'],
            'app_version'       => ['nullable', 'string', 'max:50'],
            'organization_id'   => ['nullable', 'integer'],
            'organization_name' => ['nullable', 'string', 'max:255'],
            'screenshot'        => ['nullable', 'file', 'mimes:jpeg,jpg,png,gif,webp', 'max:10240'], // 10MB
            'recording'         => ['nullable', 'file', 'mimes:mp4,webm,avi,mov,mkv', 'max:51200'],  // 50MB
            'attachment'        => ['nullable', 'file', 'mimes:pdf,doc,docx,zip,txt,png,jpg,jpeg', 'max:20480'], // 20MB
        ]);

        $user = $request->user();
        $feedback = $this->feedbackService->submitFeedback($request->all(), $user, $request);

        return response()->json([
            'success' => true,
            'message' => 'Feedback submitted successfully.',
            'data'    => [
                'id'               => $feedback->id,
                'reference_number' => $feedback->reference_number,
                'feedback_type'    => $feedback->feedback_type,
                'subject'          => $feedback->subject,
                'status'           => $feedback->status,
                'submitted_at'     => $feedback->submitted_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Get list of feedback entries (Admin / Manager portal).
     * GET /api/feedback
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $filters = $request->only([
            'feedback_type', 'status', 'priority', 'module',
            'organization_id', 'organization', 'user_id',
            'date_start', 'date_end', 'search', 'per_page'
        ]);

        // Non-admin / non-manager users only see their own feedback
        if (!in_array($user->role, ['admin', 'manager'])) {
            $filters['user_id'] = $user->id;
        }

        $feedbacks = $this->feedbackService->getFeedbackList($filters, $user);

        return response()->json([
            'success' => true,
            'data'    => $feedbacks->items(),
            'total'   => $feedbacks->total(),
            'page'    => $feedbacks->currentPage(),
            'per_page'=> $feedbacks->perPage(),
            'last_page'=> $feedbacks->lastPage(),
        ]);
    }

    /**
     * Get single feedback detail view.
     * GET /api/feedback/{id}
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $feedback = $this->feedbackService->getFeedbackDetail($id, $user);
        $history = $this->feedbackService->getFeedbackHistory($feedback);

        return response()->json([
            'success'  => true,
            'data'     => $feedback,
            'history'  => $history,
        ]);
    }

    /**
     * Update feedback status, priority, or assignee.
     * PATCH /api/feedback/{id}
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status'      => ['nullable', Rule::in([
                'New', 'Under Review', 'Accepted', 'Planned',
                'In Development', 'Testing', 'Resolved', 'Closed', 'Rejected'
            ])],
            'priority'    => ['nullable', Rule::in(['Low', 'Medium', 'High', 'Urgent'])],
            'assigned_to' => ['nullable', 'exists:users,id'],
        ]);

        $user = $request->user();
        $feedback = Feedback::findOrFail($id);
        $updated = $this->feedbackService->updateFeedback($feedback, $user, $validated);

        return response()->json([
            'success' => true,
            'message' => 'Feedback updated successfully.',
            'data'    => $updated,
        ]);
    }

    /**
     * Add an internal note to feedback.
     * POST /api/feedback/{id}/notes
     */
    public function addNote(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'note' => ['required', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        $feedback = Feedback::findOrFail($id);
        $note = $this->feedbackService->addNote($feedback, $user, $validated['note']);

        return response()->json([
            'success' => true,
            'message' => 'Note added successfully.',
            'data'    => $note,
        ], 201);
    }

    /**
     * Get chat messages for a feedback ticket.
     * GET /api/feedback/{id}/messages
     */
    public function getMessages(Request $request, int $id): JsonResponse
    {
        $feedback = Feedback::findOrFail($id);

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->where('tenant_feedback_id', $id)
            ->first();

        if (!$ticket) {
            return response()->json([
                'success' => true,
                'messages' => [],
            ]);
        }

        $messages = \App\Models\Master\OrganizationSupportMessage::on('mysql_master')
            ->where('ticket_id', $ticket->id)
            ->with('user:id,name,email')
            ->orderBy('created_at', 'asc')
            ->get()
            ->filter(function ($msg) use ($ticket) {
                return $msg->message !== $ticket->message;
            })->values()
            ->map(function ($msg) {
                return [
                    'id' => $msg->id,
                    'message' => $msg->message,
                    'sender_type' => $msg->sender_type,
                    'is_read' => $msg->is_read,
                    'user' => $msg->user ? [
                        'id' => $msg->user->id,
                        'name' => $msg->user->name,
                    ] : null,
                    'created_at' => $msg->created_at?->toISOString(),
                ];
            });

        return response()->json([
            'success' => true,
            'messages' => $messages,
            'ticket_status' => $ticket->status,
        ]);
    }

    /**
     * Send a chat message on a feedback ticket.
     * POST /api/feedback/{id}/messages
     */
    public function sendMessage(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        $feedback = Feedback::findOrFail($id);

        $ticket = \App\Models\Master\OrganizationSupportTicket::on('mysql_master')
            ->where('source', 'feedback')
            ->where('tenant_feedback_id', $id)
            ->first();

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Support ticket not found.'], 404);
        }

        if ($ticket->status === 'closed') {
            return response()->json(['success' => false, 'message' => 'Cannot reply to a closed ticket.'], 400);
        }

        $senderType = 'organization';

        $msg = \App\Models\Master\OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id' => $ticket->id,
            'user_id' => null,
            'message' => $validated['message'],
            'sender_type' => $senderType,
        ]);

        if ($ticket->status === 'open') {
            $ticket->update(['status' => 'pending']);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $msg->id,
                'message' => $msg->message,
                'sender_type' => $msg->sender_type,
                'is_read' => $msg->is_read,
                'user' => ['id' => $user->id, 'name' => $user->name],
                'created_at' => $msg->created_at?->toISOString(),
            ],
        ], 201);
    }
}
