<?php

namespace App\Services;

use App\Models\Feedback;
use App\Models\FeedbackActivityLog;
use App\Models\FeedbackNote;
use App\Models\User;
use App\Models\Master\OrganizationSupportTicket;
use App\Models\Master\OrganizationSupportMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use App\Services\StorageDiskResolver;

class FeedbackService
{
    /**
     * Submit a new feedback entry with auto-captured metadata and file attachments.
     */
    public function submitFeedback(array $data, User $user, Request $request): Feedback
    {
        $refNumber = $this->generateReferenceNumber();

        // Resolve organization first (needed for storage disk resolution)
        $organization = $request->attributes->get('currentOrganization');
        $organizationId = $organization?->id ?? $data['organization_id'] ?? null;
        $organizationName = $organization?->name ?? $data['organization_name'] ?? $user->company_name ?? 'TechXaro';

        $screenshotPath = null;
        $recordingPath = null;
        $attachmentPath = null;

        // Store files using StorageDiskResolver (S3 or local, same pattern as Tasks/Deliverables)
        if ($request->hasFile('screenshot')) {
            $screenshotPath = $organization
                ? StorageDiskResolver::store($organization, $request->file('screenshot'), 'feedback/screenshots')
                : $request->file('screenshot')->store('feedback/screenshots', 'public');
        }
        if ($request->hasFile('recording')) {
            $recordingPath = $organization
                ? StorageDiskResolver::store($organization, $request->file('recording'), 'feedback/recordings')
                : $request->file('recording')->store('feedback/recordings', 'public');
        }
        if ($request->hasFile('attachment')) {
            $attachmentPath = $organization
                ? StorageDiskResolver::store($organization, $request->file('attachment'), 'feedback/attachments')
                : $request->file('attachment')->store('feedback/attachments', 'public');
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
            'organization_id'   => $organizationId,
            'organization_name' => $organizationName,
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

        $this->logActivity(
            $feedback,
            $user,
            'submitted',
            "Feedback submitted with reference number {$refNumber} from " . ($data['current_page'] ?? '/')
        );

        // Auto-create support ticket in master DB for super admin review
        $this->createSupportTicketFromFeedback($feedback, $data, $user, $organization);

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

    /**
     * Auto-create a support ticket in the master DB when feedback is submitted.
     * This allows super admin to see and respond to feedback in the support system.
     */
    private function createSupportTicketFromFeedback(Feedback $feedback, array $data, User $user, $organization): void
    {
        try {
            $organizationId = $organization?->id ?? $data['organization_id'] ?? null;
            if (!$organizationId) {
                \Log::warning("Feedback support ticket skipped: no organization_id resolved", [
                    'feedback_id' => $feedback->id,
                    'user_id' => $user->id,
                ]);
                return;
            }

            $categoryMap = [
                'Bug Report' => 'bug_report',
                'Feature Request' => 'feature_request',
                'General Suggestion' => 'general',
                'Feature Rating' => 'general',
                'General Feedback' => 'general',
            ];

            $priorityMap = [
                'Low' => 'low',
                'Medium' => 'medium',
                'High' => 'high',
                'Urgent' => 'urgent',
            ];

            $ticketNumber = 'FBT-' . strtoupper(Str::random(4)) . '-' . date('YmdHis');

            $feedbackMetadata = [
                'feedback_id' => $feedback->id,
                'reference_number' => $feedback->reference_number,
                'feedback_type' => $feedback->feedback_type,
                'description' => $feedback->description,
                'module' => $feedback->module,
                'current_page' => $feedback->current_page,
                'browser' => $feedback->browser,
                'operating_system' => $feedback->operating_system,
                'device_type' => $feedback->device_type,
                'ip_address' => $feedback->ip_address,
                'user_name' => $feedback->user_name,
                'user_role' => $feedback->user_role,
                'rating' => $feedback->rating,
                'screenshot_path' => $feedback->screenshot_path,
                'recording_path' => $feedback->recording_path,
                'attachment_path' => $feedback->attachment_path,
            ];

            // user_id has FK on master DB users table — tenant user won't exist there
            // Store user info in feedback_metadata instead; set user_id = null
            $ticket = OrganizationSupportTicket::on('mysql_master')->create([
                'organization_id' => $organizationId,
                'user_id' => null,
                'ticket_number' => $ticketNumber,
                'subject' => $feedback->subject,
                'message' => $this->buildFeedbackTicketMessage($feedback),
                'status' => 'open',
                'priority' => $priorityMap[$feedback->priority] ?? 'medium',
                'category' => $categoryMap[$feedback->feedback_type] ?? 'general',
                'source' => 'feedback',
                'tenant_feedback_id' => $feedback->id,
                'feedback_reference_number' => $feedback->reference_number,
                'feedback_metadata' => $feedbackMetadata,
            ]);

            // Log to ActivityLog (master DB)
            \App\Models\Master\ActivityLog::create([
                'user' => $user->name,
                'action' => "Feedback submitted - Support ticket {$ticketNumber} auto-created",
                'target' => $feedback->subject,
                'ip' => $feedback->ip_address,
                'status' => 'success',
            ]);

            // Log to tenant AuditLog using actual database_name from Organization model
            if ($organization) {
                try {
                    $dbHost = $organization->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                    $dbPort = (int) ($organization->database_port ?: config('database.connections.mysql_master.port', 3306));
                    $dbName = $organization->database_name;
                    $dbUser = $organization->database_username ?: config('database.connections.mysql_master.username', 'root');
                    $dbPass = $organization->database_password ?? config('database.connections.mysql_master.password', '');

                    $pdo = new \PDO(
                        "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",
                        $dbUser,
                        $dbPass,
                        [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_TIMEOUT => 5]
                    );
                    $stmt = $pdo->prepare("
                        INSERT INTO audit_logs (user_id, module, action, entity_type, entity_id, description, new_values, status, ip_address, user_agent, browser, os, device, request_method, request_url, created_at, updated_at)
                        VALUES (?, 'Feedback', 'Submitted', 'Feedback', ?, ?, ?, 'success', ?, ?, ?, ?, ?, 'POST', ?, NOW(), NOW())
                    ");
                    $stmt->execute([
                        $user->id,
                        $feedback->id,
                        "Feedback {$feedback->reference_number} submitted: {$feedback->subject}",
                        json_encode(['reference_number' => $feedback->reference_number, 'ticket_number' => $ticketNumber]),
                        $feedback->ip_address,
                        $feedback->browser ?? 'Unknown',
                        $feedback->operating_system ?? 'Unknown',
                        $feedback->device_type ?? 'Desktop',
                        $data['current_page'] ?? '/',
                    ]);
                    $pdo = null;
                } catch (\Throwable $e) {
                    \Log::warning("Failed to write tenant audit log for feedback submission: " . $e->getMessage());
                }
            }

            \Log::info("Feedback submitted and support ticket auto-created", [
                'user' => $user->name,
                'user_id' => $user->id,
                'feedback_id' => $feedback->id,
                'reference_number' => $feedback->reference_number,
                'ticket_number' => $ticketNumber,
                'organization_id' => $organizationId,
            ]);

        } catch (\Throwable $e) {
            \Log::error("Failed to create support ticket from feedback: " . $e->getMessage(), [
                'feedback_id' => $feedback->id ?? null,
                'organization_id' => $organization?->id ?? $data['organization_id'] ?? null,
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }

    /**
     * Build the support ticket message from feedback data.
     */
    private function buildFeedbackTicketMessage(Feedback $feedback): string
    {
        $parts = [
            "📝 **Feedback Submission** (Ref: {$feedback->reference_number})",
            "",
            "**Type:** {$feedback->feedback_type}",
            "**Module:** {$feedback->module}",
            "**Priority:** {$feedback->priority}",
        ];

        if ($feedback->rating) {
            $parts[] = "**Rating:** {$feedback->rating}/5 stars";
        }

        $parts[] = "";
        $parts[] = "**Description:**";
        $parts[] = strip_tags($feedback->description);
        $parts[] = "";
        $parts[] = "---";
        $parts[] = "**Submitted by:** {$feedback->user_name} ({$feedback->user_role})";
        $parts[] = "**Organization:** {$feedback->organization_name}";
        $parts[] = "**Page:** {$feedback->current_page}";
        $parts[] = "**Browser:** {$feedback->browser}";
        $parts[] = "**OS:** {$feedback->operating_system}";
        $parts[] = "**Date:** {$feedback->submitted_at->format('M d, Y h:i A')}";

        return implode("\n", $parts);
    }
}
