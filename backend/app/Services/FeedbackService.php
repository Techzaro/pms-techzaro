<?php

namespace App\Services;

use App\Models\Feedback;
use App\Models\FeedbackActivityLog;
use App\Models\FeedbackNote;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;

class FeedbackService
{
    /**
     * Submit a new feedback entry with auto-captured metadata and file attachments.
     */
    public function submitFeedback(array $data, User $user, Request $request): Feedback
    {
        $refNumber = $this->generateReferenceNumber();

        // Handle file uploads
        $screenshotPath = null;
        $recordingPath = null;
        $attachmentPath = null;

        if ($request->hasFile('screenshot')) {
            $screenshotPath = $request->file('screenshot')->store('feedback/screenshots', 'public');
        }
        if ($request->hasFile('recording')) {
            $recordingPath = $request->file('recording')->store('feedback/recordings', 'public');
        }
        if ($request->hasFile('attachment')) {
            $attachmentPath = $request->file('attachment')->store('feedback/attachments', 'public');
        }

        $feedback = Feedback::create([
            'reference_number'  => $refNumber,
            'feedback_type'     => $data['feedback_type'] ?? 'General Feedback',
            'subject'           => $data['subject'] ?? 'No Subject',
            'description'       => $data['description'] ?? '',
            'priority'          => $data['priority'] ?? 'Medium',
            'rating'            => isset($data['rating']) && is_numeric($data['rating']) ? (int) $data['rating'] : null,
            'status'            => 'New',
            'screenshot_path'   => $screenshotPath,
            'recording_path'    => $recordingPath,
            'attachment_path'   => $attachmentPath,

            // Auto-captured data
            'organization_id'   => $data['organization_id'] ?? $user->company_id ?? null,
            'organization_name' => $data['organization_name'] ?? $user->company_name ?? 'TechXaro',
            'user_id'           => $user->id,
            'user_name'         => $user->name,
            'user_role'         => $user->role,
            'module'            => $data['module'] ?? 'General',
            'current_page'      => $data['current_page'] ?? $request->header('Referer') ?? '/',
            'submitted_at'      => Carbon::now(),
            'browser'           => $data['browser'] ?? $this->detectBrowser($request->header('User-Agent')),
            'operating_system'  => $data['operating_system'] ?? $this->detectOS($request->header('User-Agent')),
            'device_type'       => $data['device_type'] ?? 'Desktop',
            'ip_address'        => $request->ip(),
            'app_version'       => $data['app_version'] ?? '1.0.0',
        ]);

        // Log initial submission activity
        $this->logActivity(
            $feedback,
            $user,
            'submitted',
            "Feedback submitted with reference number {$refNumber} from " . ($data['current_page'] ?? '/')
        );

        return $feedback;
    }

    /**
     * Log an action in the FeedbackActivityLog table.
     */
    public function logActivity(Feedback $feedback, ?User $user, string $action, ?string $details = null): FeedbackActivityLog
    {
        return FeedbackActivityLog::create([
            'feedback_id' => $feedback->id,
            'user_id'     => $user ? $user->id : null,
            'action'      => $action,
            'details'     => $details,
        ]);
    }

    /**
     * Get list of feedback with advanced filtering for Admin view.
     */
    public function getFeedbackList(array $filters, User $user)
    {
        $query = Feedback::with(['user:id,name,email,role', 'assignee:id,name,email,role']);

        if (!empty($filters['feedback_type'])) {
            $query->where('feedback_type', $filters['feedback_type']);
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (!empty($filters['module'])) {
            $query->where('module', $filters['module']);
        }

        if (!empty($filters['organization_id'])) {
            $query->where('organization_id', $filters['organization_id']);
        }

        if (!empty($filters['organization'])) {
            $query->where('organization_name', 'like', '%' . $filters['organization'] . '%');
        }

        if (!empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }

        if (!empty($filters['date_start'])) {
            $query->where('created_at', '>=', Carbon::parse($filters['date_start'])->startOfDay());
        }

        if (!empty($filters['date_end'])) {
            $query->where('created_at', '<=', Carbon::parse($filters['date_end'])->endOfDay());
        }

        if (!empty($filters['search'])) {
            $term = '%' . trim($filters['search']) . '%';
            $query->where(function ($q) use ($term) {
                $q->where('reference_number', 'like', $term)
                  ->orWhere('subject', 'like', $term)
                  ->orWhere('description', 'like', $term)
                  ->orWhere('user_name', 'like', $term)
                  ->orWhere('organization_name', 'like', $term);
            });
        }

        return $query->orderBy('created_at', 'desc')->paginate($filters['per_page'] ?? 20);
    }

    /**
     * Get detailed feedback record and log 'viewed' activity.
     */
    public function getFeedbackDetail(int $id, User $user): Feedback
    {
        $feedback = Feedback::with([
            'user:id,name,email,role',
            'assignee:id,name,email,role',
            'activityLogs.user:id,name,email,role',
            'notes.user:id,name,email,role',
        ])->findOrFail($id);

        // Log 'viewed' activity if admin/manager views it
        $lastView = FeedbackActivityLog::where('feedback_id', $feedback->id)
            ->where('user_id', $user->id)
            ->where('action', 'viewed')
            ->where('created_at', '>=', Carbon::now()->subMinutes(30))
            ->first();

        if (!$lastView) {
            $this->logActivity($feedback, $user, 'viewed', "Feedback viewed by {$user->name} ({$user->role})");
        }

        return $feedback;
    }

    /**
     * Update status, priority, or assignee for feedback and log lifecycle actions.
     */
    public function updateFeedback(Feedback $feedback, User $user, array $data): Feedback
    {
        $oldStatus   = $feedback->status;
        $oldPriority = $feedback->priority;
        $oldAssignee = $feedback->assigned_to;

        if (isset($data['status']) && $data['status'] !== $oldStatus) {
            $feedback->status = $data['status'];
            $this->logActivity(
                $feedback,
                $user,
                'status_changed',
                "Status changed from '{$oldStatus}' to '{$data['status']}' by {$user->name}"
            );
        }

        if (isset($data['priority']) && $data['priority'] !== $oldPriority) {
            $feedback->priority = $data['priority'];
            $this->logActivity(
                $feedback,
                $user,
                'priority_changed',
                "Priority changed from '{$oldPriority}' to '{$data['priority']}' by {$user->name}"
            );
        }

        if (array_key_exists('assigned_to', $data) && $data['assigned_to'] != $oldAssignee) {
            $feedback->assigned_to = $data['assigned_to'];
            $assigneeName = $data['assigned_to'] ? User::find($data['assigned_to'])?->name ?? 'User #' . $data['assigned_to'] : 'Unassigned';
            $this->logActivity(
                $feedback,
                $user,
                'assigned',
                "Assigned to {$assigneeName} by {$user->name}"
            );
        }

        $feedback->save();

        return $feedback->fresh(['user', 'assignee', 'activityLogs.user', 'notes.user']);
    }

    /**
     * Add an internal note to feedback and log action.
     */
    public function addNote(Feedback $feedback, User $user, string $noteText): FeedbackNote
    {
        $note = FeedbackNote::create([
            'feedback_id' => $feedback->id,
            'user_id'     => $user->id,
            'note'        => $noteText,
        ]);

        $this->logActivity(
            $feedback,
            $user,
            'note_added',
            "Internal note added by {$user->name}"
        );

        return $note->load('user:id,name,email,role');
    }

    /**
     * Get previous feedback submissions from the same user or organization.
     */
    public function getFeedbackHistory(Feedback $feedback)
    {
        return Feedback::where('id', '!=', $feedback->id)
            ->where(function ($q) use ($feedback) {
                $q->where('user_id', $feedback->user_id);
                if ($feedback->organization_id) {
                    $q->orWhere('organization_id', $feedback->organization_id);
                }
            })
            ->select('id', 'reference_number', 'feedback_type', 'subject', 'status', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();
    }

    /**
     * Generate unique reference number: FB-YYYYMMDD-XXXX
     */
    private function generateReferenceNumber(): string
    {
        $dateStr = Carbon::now()->format('Ymd');
        $random = strtoupper(Str::random(4));
        $ref = "FB-{$dateStr}-{$random}";

        while (Feedback::where('reference_number', $ref)->exists()) {
            $random = strtoupper(Str::random(4));
            $ref = "FB-{$dateStr}-{$random}";
        }

        return $ref;
    }

    private function detectBrowser(?string $ua): string
    {
        if (!$ua) return 'Unknown Browser';
        if (str_contains($ua, 'Edg')) return 'Microsoft Edge';
        if (str_contains($ua, 'Chrome')) return 'Google Chrome';
        if (str_contains($ua, 'Safari')) return 'Safari';
        if (str_contains($ua, 'Firefox')) return 'Mozilla Firefox';
        return 'Other Browser';
    }

    private function detectOS(?string $ua): string
    {
        if (!$ua) return 'Unknown OS';
        if (str_contains($ua, 'Windows')) return 'Windows';
        if (str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS')) return 'macOS';
        if (str_contains($ua, 'Linux')) return 'Linux';
        if (str_contains($ua, 'Android')) return 'Android';
        if (str_contains($ua, 'iPhone') || str_contains($ua, 'iPad')) return 'iOS';
        return 'Other OS';
    }
}
