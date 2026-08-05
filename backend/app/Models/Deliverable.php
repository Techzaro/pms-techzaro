<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;
use App\Services\BusinessIdService;

/**
 * Represents a deliverable (subtask) within a project or task.
 * Tracks individual work items through their lifecycle (draft, submitted, approved, rejected, reopened).
 */
class Deliverable extends Model
{
    protected $fillable = [
        'subtask_number',
        'business_id',
        'project_id',
        'task_id',
        'title',
        'description',
        'status',
        'priority',
        'start_date',
        'due_date',
        'assigned_to',
        'created_by',
        'updated_by',
        'estimated_hours',
        'estimated_minutes',
        'labels',
        'tags',
        'followers',
        'dependencies',
        'submitted_at',
        'approved_at',
        'rejected_at',
        'rejection_comment',
        'approved_by',
        'rejected_by',
        'reopened_at',
        'reopened_by',
        'reopen_comment',
        'reopen_instructions',
        'reopen_new_deadline',
        'reopen_file_path',
        'reopen_file_name',
        'reopen_count',
        'reopen_reason',
        'submission_count',
        'rework_comment',
        'rework_instructions',
        'rework_new_deadline',
        'rework_file_path',
        'rework_file_name',
        'acknowledged_by',
        'acknowledged_at',
        'paused_by',
        'paused_at',
        'assigner_paused',
        'assigner_paused_at',
        'assigner_paused_by',
        'work_started_at',
        'total_work_seconds',
        'elapsed_seconds',
        'pause_count',
        'total_pause_seconds',
        'resume_count',
        'timer_state',
        'last_timer_event_at',
        'work_completed_at',
        'sort_order',
        'current_owner',
        'original_assigner',
        'delegation_chain',
        'approval_chain',
        'delegation_count',
        'allow_transfer',
    ];

    /**
     * Auto-generate business_id if missing (for old data without migration).
     */
    public function getBusinessIdAttribute($value)
    {
        if ($value) return $value;

        // Auto-infer project_id from task if missing
        if (empty($this->project_id) && !empty($this->task_id)) {
            $task = $this->task ?? \App\Models\Task::find($this->task_id);
            if ($task && $task->project_id) {
                $this->project_id = $task->project_id;
            }
        }

        $service = app(BusinessIdService::class);
        if ($this->task_id && $this->task) {
            $bizId = $service->generateSubtaskBusinessId($this->task);
        } elseif ($this->project_id && $this->project) {
            $bizId = $service->generateProjectDeliverableBusinessId($this->project, $this->id);
        } else {
            $bizId = 'SUB-' . $this->id;
        }
        $parts = explode('.', $bizId);
        $this->updateQuietly([
            'subtask_number' => (int) end($parts),
            'business_id' => $bizId,
            'project_id' => $this->project_id,
        ]);

        return $bizId;
    }

    protected static function booted(): void
    {
        static::saving(function (Deliverable $deliverable) {
            // Auto-infer project_id from parent task when not set
            if (empty($deliverable->project_id) && !empty($deliverable->task_id)) {
                $task = $deliverable->task ?? \App\Models\Task::find($deliverable->task_id);
                if ($task && $task->project_id) {
                    $deliverable->project_id = $task->project_id;
                }
            }
        });

        static::created(function (Deliverable $deliverable) {
            // Auto-infer project_id after save if still missing
            if (empty($deliverable->project_id) && !empty($deliverable->task_id)) {
                $task = $deliverable->task;
                if ($task && $task->project_id) {
                    $deliverable->project_id = $task->project_id;
                    $deliverable->saveQuietly();
                }
            }

            if (empty($deliverable->business_id)) {
                if ($deliverable->task_id && $deliverable->task) {
                    $deliverable->business_id = app(BusinessIdService::class)->generateSubtaskBusinessId($deliverable->task);
                } elseif ($deliverable->project_id && $deliverable->project) {
                    $deliverable->business_id = app(BusinessIdService::class)->generateProjectDeliverableBusinessId($deliverable->project, $deliverable->id);
                } else {
                    $deliverable->business_id = 'SUB-' . $deliverable->id;
                }
                $parts = explode('.', $deliverable->business_id);
                $deliverable->subtask_number = (int) end($parts);
                $deliverable->saveQuietly();
            }
        });
    }

    protected $casts = [
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'due_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'rework_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'acknowledged_at' => 'datetime:Y-m-d\TH:i:s',
        'paused_at' => 'datetime:Y-m-d\TH:i:s',
        'assigner_paused_at' => 'datetime:Y-m-d\TH:i:s',
        'work_started_at' => 'datetime:Y-m-d\TH:i:s',
        'last_timer_event_at' => 'datetime:Y-m-d\TH:i:s',
        'work_completed_at' => 'datetime:Y-m-d\TH:i:s',
        'labels' => 'array',
        'tags' => 'array',
        'followers' => 'array',
        'dependencies' => 'array',
        'estimated_hours' => 'integer',
        'estimated_minutes' => 'integer',
        'total_work_seconds' => 'integer',
        'elapsed_seconds' => 'integer',
        'pause_count' => 'integer',
        'total_pause_seconds' => 'integer',
        'resume_count' => 'integer',
        'assigner_paused' => 'boolean',
        'allow_transfer' => 'boolean',
        'reopen_count' => 'integer',
        'submission_count' => 'integer',
        'delegation_chain' => 'array',
        'approval_chain' => 'array',
        'delegation_count' => 'integer',
    ];

    /** Apply filters for querying deliverables. */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (!empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }

        if (!empty($filters['project_id'])) {
            $query->where('project_id', $filters['project_id']);
        }

        if (!empty($filters['task_id'])) {
            $query->where('task_id', $filters['task_id']);
        }

        if (!empty($filters['created_by'])) {
            $query->where('created_by', $filters['created_by']);
        }

        if (!empty($filters['search'])) {
            $query->where(function ($q) use ($filters) {
                $q->where('title', 'like', '%' . $filters['search'] . '%')
                    ->orWhere('business_id', 'like', '%' . $filters['search'] . '%');
            });
        }

        if (!empty($filters['start_date_from'])) {
            $query->where('start_date', '>=', $filters['start_date_from']);
        }

        if (!empty($filters['start_date_to'])) {
            $query->where('start_date', '<=', $filters['start_date_to']);
        }

        return $query;
    }

    /** The project this deliverable belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user assigned to complete this deliverable. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** The user who created this deliverable. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The user who last updated this deliverable. */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** The parent task this deliverable belongs to (optional). */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** All submissions for this deliverable. */
    public function submissions(): HasMany
    {
        return $this->hasMany(DeliverableSubmission::class);
    }

    /** The most recent submission for this deliverable. */
    public function latestSubmission()
    {
        return $this->hasOne(DeliverableSubmission::class)->latestOfMany();
    }

    /** The user who approved this deliverable. */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who rejected this deliverable. */
    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /** The user who reopened this deliverable for rework. */
    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** The user who requested to abandon this deliverable. */
    public function abandonRequestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandon_requested_by');
    }

    /** The user who approved/abandoned this deliverable. */
    public function abandonedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandoned_by');
    }

    /** The user who declined the abandon request. */
    public function abandonDeclinedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandon_declined_by');
    }

    /** The user who acknowledged this deliverable. */
    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    /** The user who paused this deliverable. */
    public function pausedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paused_by');
    }

    /** The user who locked this deliverable (assigner pause). */
    public function assignerPausedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigner_paused_by');
    }

    /** Workflow events tracking state changes for this deliverable. */
    public function workflowEvents(): HasMany
    {
        return $this->hasMany(DeliverableWorkflowEvent::class)->latest();
    }

    /** Field-level changes made to this deliverable. */
    public function changes()
    {
        return $this->hasMany(DeliverableChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(DeliverableChange::class)->where('is_viewed', false);
    }

    /** All users assigned to this deliverable (many-to-many). */
    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'deliverable_user')
            ->withPivot('due_date', 'status', 'submitted_at')
            ->withTimestamps();
    }

    /** File attachments for this deliverable. */
    public function files(): HasMany
    {
        return $this->hasMany(DeliverableFile::class)->orderBy('sort_order');
    }

    /** Pause sessions for this deliverable. */
    public function pauseSessions(): HasMany
    {
        return $this->hasMany(DeliverablePauseSession::class)->orderBy('paused_at');
    }

    /** All delegations for this deliverable. */
    public function delegations()
    {
        return $this->hasMany(TaskDelegation::class, 'deliverable_id')->latest();
    }

    /** The user who currently owns this deliverable. */
    public function currentOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_owner');
    }

    /** The user who originally assigned this deliverable. */
    public function originalAssigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'original_assigner');
    }

    /** Get the pending delegations for this deliverable. */
    public function pendingDelegations()
    {
        return $this->hasMany(TaskDelegation::class, 'deliverable_id')->where('status', 'pending')->latest();
    }

    /** Get the latest delegation for this deliverable. */
    public function latestDelegation()
    {
        return $this->hasOne(TaskDelegation::class, 'deliverable_id')->latestOfMany();
    }

    /** Personal user notes on this deliverable. */
    public function userNotes(): HasMany
    {
        return $this->hasMany(DeliverableUserNote::class);
    }

    /** Discussion comments on this deliverable. */
    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class)->latest();
    }

    /** Start the work timer. */
    public function startTimer(): void
    {
        $this->update([
            'work_started_at' => now(),
            'elapsed_seconds' => 0,
            'total_work_seconds' => 0,
            'pause_count' => 0,
            'total_pause_seconds' => 0,
            'resume_count' => 0,
            'timer_state' => 'running',
            'last_timer_event_at' => now(),
            'work_completed_at' => null,
        ]);
    }

    /** Pause the running timer, accumulating elapsed and work seconds. */
    public function pauseTimer(?string $reason = null, ?string $reasonDetail = null, bool $isAutoPaused = false, ?int $userId = null): void
    {
        if ($this->timer_state !== 'running') {
            return;
        }

        $now = now();
        $elapsed = $this->last_timer_event_at
            ? max(0, abs((int) $now->diffInSeconds($this->last_timer_event_at)))
            : 0;

        $totalElapsed = $this->last_timer_event_at && $this->acknowledged_at
            ? max(0, abs((int) $now->diffInSeconds($this->acknowledged_at)))
            : ($this->elapsed_seconds ?? 0);

        $this->update([
            'total_work_seconds' => max(0, $this->total_work_seconds + $elapsed),
            'elapsed_seconds' => $totalElapsed,
            'timer_state' => 'paused',
            'last_timer_event_at' => $now,
            'pause_count' => ($this->pause_count ?? 0) + 1,
        ]);

        DeliverablePauseSession::create([
            'deliverable_id' => $this->id,
            'user_id' => $userId ?? $this->paused_by,
            'reason' => $reason ?? 'Other',
            'reason_detail' => $reasonDetail,
            'paused_at' => $now,
            'is_auto_paused' => $isAutoPaused,
        ]);
    }

    /** Resume a paused timer. */
    public function resumeTimer(?int $resumedBy = null): void
    {
        if ($this->timer_state !== 'paused') {
            return;
        }

        $session = $this->pauseSessions()->whereNull('resumed_at')->latest()->first();
        if ($session) {
            $duration = max(0, abs((int) now()->diffInSeconds($session->paused_at)));
            $session->update([
                'resumed_at' => now(),
                'duration_seconds' => $duration,
                'resumed_by' => $resumedBy,
            ]);

            $this->update([
                'total_pause_seconds' => ($this->total_pause_seconds ?? 0) + $duration,
            ]);
        }

        $totalElapsed = $this->acknowledged_at
            ? max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)))
            : ($this->elapsed_seconds ?? 0);

        $this->update([
            'timer_state' => 'running',
            'last_timer_event_at' => now(),
            'elapsed_seconds' => $totalElapsed,
            'resume_count' => ($this->resume_count ?? 0) + 1,
        ]);
    }

    /** Stop the timer permanently (on submit). */
    public function stopTimer(): void
    {
        $now = now();

        if ($this->timer_state === 'running') {
            $elapsed = $this->last_timer_event_at
                ? max(0, abs((int) $now->diffInSeconds($this->last_timer_event_at)))
                : 0;

            $totalElapsed = $this->acknowledged_at
                ? max(0, abs((int) $now->diffInSeconds($this->acknowledged_at)))
                : ($this->elapsed_seconds ?? 0);

            $this->update([
                'total_work_seconds' => max(0, $this->total_work_seconds + $elapsed),
                'elapsed_seconds' => $totalElapsed,
                'timer_state' => 'completed',
                'last_timer_event_at' => $now,
                'work_completed_at' => $now,
            ]);
        } else {
            $totalElapsed = $this->acknowledged_at
                ? max(0, abs((int) $now->diffInSeconds($this->acknowledged_at)))
                : ($this->elapsed_seconds ?? 0);

            $this->update([
                'elapsed_seconds' => $totalElapsed,
                'timer_state' => 'completed',
                'work_completed_at' => $now,
            ]);
        }

        $openSession = $this->pauseSessions()->whereNull('resumed_at')->latest()->first();
        if ($openSession) {
            $duration = max(0, abs((int) $now->diffInSeconds($openSession->paused_at)));
            $openSession->update([
                'resumed_at' => $now,
                'duration_seconds' => $duration,
            ]);
            $this->update([
                'total_pause_seconds' => ($this->total_pause_seconds ?? 0) + $duration,
            ]);
        }
    }

    /** Get current work duration in seconds (computed from persisted state). */
    public function getCurrentWorkSeconds(): int
    {
        $base = $this->total_work_seconds ?? 0;

        if ($this->timer_state === 'running' && $this->last_timer_event_at) {
            $base += max(0, abs((int) now()->diffInSeconds($this->last_timer_event_at)));
        }

        return max(0, $base);
    }

    /** Get current elapsed seconds since acknowledge (computed live). */
    public function getCurrentElapsedSeconds(): int
    {
        if (!$this->acknowledged_at) {
            return 0;
        }

        return max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)));
    }

    /** Format seconds into HH:MM:SS. */
    public static function formatDuration(int $seconds): string
    {
        $seconds = max(0, $seconds);
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);
        $s = $seconds % 60;

        return sprintf('%02d:%02d:%02d', $h, $m, $s);
    }

    /** Get pause reason labels map. */
    public static function pauseReasons(): array
    {
        return [
            'waiting_client' => 'Waiting for Client',
            'waiting_approval' => 'Waiting for Manager Approval',
            'waiting_dependency' => 'Waiting for Dependency',
            'technical_issue' => 'Technical Issue',
            'personal_break' => 'Personal Break',
            'meeting' => 'Meeting',
            'internet_issue' => 'Internet or System Issue',
            'auto_paused' => 'Auto Paused Due To Inactivity',
            'other' => 'Other',
        ];
    }
}
