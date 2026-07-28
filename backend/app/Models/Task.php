<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Services\BusinessIdService;
use Illuminate\Support\Facades\Log;

/**
 * Represents a task within a project.
 * Tracks individual work items through their lifecycle (draft, submitted, approved, rejected, reopened).
 */
class Task extends Model
{
    protected $fillable = [
        'task_number',
        'business_id',
        'project_id',
        'title',
        'description',
        'requirements',
        'status',
        'priority',
        'start_date',
        'end_date',
        'assigned_to',
        'assigned_by',
        'updated_by',
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
        'acknowledged_at',
        'acknowledged_by',
        'paused_at',
        'paused_by',
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
        'task_type',
        'recurrence_settings',
        'recurrence_status',
        'deliverables_generated',
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

        $service = app(BusinessIdService::class);
        if ($this->project_id && $this->project && !empty($this->project->project_code) && !empty($this->project->project_number)) {
            $bizId = $service->generateTaskBusinessId($this->project);
            $taskNumber = (int) substr(strrchr($bizId, '.'), 1);
        } else {
            $bizId = 'TASK-' . $this->id;
            $taskNumber = $this->id;
        }

        try {
            $this->updateQuietly([
                'task_number' => $taskNumber,
                'business_id' => $bizId,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to auto-generate business_id for task', [
                'task_id' => $this->id,
                'error' => $e->getMessage(),
            ]);
        }

        return $bizId;
    }

    protected static function booted(): void
    {
        static::creating(function (Task $task) {
            if (empty($task->business_id)) {
                if ($task->project_id && $task->project) {
                    $task->business_id = app(BusinessIdService::class)->generateTaskBusinessId($task->project);
                    $task->task_number = (int) substr(strrchr($task->business_id, '.'), 1);
                } else {
                    $task->business_id = 'TASK-' . $task->id;
                    $task->task_number = $task->id;
                }
            }
        });

        static::created(function (Task $task) {
            if (empty($task->business_id) || $task->business_id === 'TASK-') {
                $task->business_id = 'TASK-' . $task->id;
                $task->task_number = $task->id;
                $task->saveQuietly();
            }
        });
    }

    protected $casts = [
        'requirements' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'recurrence_settings' => 'array',
        'deliverables_generated' => 'integer',
        'reopen_count' => 'integer',
        'submission_count' => 'integer',
        'assigner_paused' => 'boolean',
        'allow_transfer' => 'boolean',
        'total_work_seconds' => 'integer',
        'elapsed_seconds' => 'integer',
        'pause_count' => 'integer',
        'total_pause_seconds' => 'integer',
        'resume_count' => 'integer',
        'work_started_at' => 'datetime:Y-m-d\TH:i:s',
        'last_timer_event_at' => 'datetime:Y-m-d\TH:i:s',
        'work_completed_at' => 'datetime:Y-m-d\TH:i:s',
        'delegation_chain' => 'array',
        'approval_chain' => 'array',
        'delegation_count' => 'integer',
    ];

    /** Apply filters for querying tasks. */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }
        if (! empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }
        if (! empty($filters['project_id'])) {
            $query->where('project_id', $filters['project_id']);
        }
        if (! empty($filters['search'])) {
            $query->where(function ($q) use ($filters) {
                $q->where('title', 'like', '%'.$filters['search'].'%')
                    ->orWhere('business_id', 'like', '%'.$filters['search'].'%');
            });
        }
        if (! empty($filters['start_date_from'])) {
            $query->where('start_date', '>=', $filters['start_date_from']);
        }
        if (! empty($filters['start_date_to'])) {
            $query->where('start_date', '<=', $filters['start_date_to']);
        }

        return $query;
    }

    /** The project this task belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user assigned to complete this task. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** The user who assigned this task. */
    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    /** The user who last updated this task. */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** All users assigned to this task (many-to-many). */
    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_user')->withPivot('due_date', 'status', 'submitted_at')->withTimestamps();
    }

    /** Deliverables belonging to this task, ordered by sort order. */
    public function deliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class)->orderBy('sort_order')->latest('updated_at');
    }

    /** Deliverable templates for recurring task generation. */
    public function deliverableTemplates(): HasMany
    {
        return $this->hasMany(DeliverableTemplate::class)->orderBy('sort_order');
    }

    /** File attachments for this task. */
    public function files()
    {
        return $this->hasMany(TaskFile::class)->orderBy('sort_order');
    }

    /** All submissions for this task. */
    public function submissions()
    {
        return $this->hasMany(TaskSubmission::class);
    }

    /** The most recent submission for this task. */
    public function latestSubmission()
    {
        return $this->hasOne(TaskSubmission::class)->latestOfMany();
    }

    /** Workflow events tracking state changes for this task. */
    public function workflowEvents()
    {
        return $this->hasMany(TaskWorkflowEvent::class)->latest();
    }

    /** The user who approved this task. */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who rejected this task. */
    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /** The user who reopened this task for rework. */
    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** The user who acknowledged this task. */
    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    /** The user who paused this task. */
    public function pausedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paused_by');
    }

    /** The user who locked this task (assigner pause). */
    public function assignerPausedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigner_paused_by');
    }

    /** Field-level changes made to this task. */
    public function changes()
    {
        return $this->hasMany(TaskChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(TaskChange::class)->where('is_viewed', false);
    }

    /** Discussion comments on this task. */
    public function comments()
    {
        return $this->hasMany(TaskComment::class)->latest();
    }

    /** Access credentials attached to this task. */
    public function accessCredentials()
    {
        return $this->hasMany(TaskAccessCredential::class);
    }

    /** Pause sessions for this task. */
    public function pauseSessions()
    {
        return $this->hasMany(TaskPauseSession::class)->orderBy('paused_at');
    }

    /** All delegations for this task. */
    public function delegations()
    {
        return $this->hasMany(TaskDelegation::class)->latest();
    }

    /** The user who currently owns (is responsible for) this task. */
    public function currentOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_owner');
    }

    /** The user who originally assigned this task. */
    public function originalAssigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'original_assigner');
    }

    /** Get the pending delegation chain for this task. */
    public function pendingDelegations()
    {
        return $this->hasMany(TaskDelegation::class)->where('status', 'pending')->latest();
    }

    /** Get the latest delegation for this task. */
    public function latestDelegation()
    {
        return $this->hasOne(TaskDelegation::class)->latestOfMany();
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

        // Compute total elapsed since acknowledge
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

        // Create pause session
        TaskPauseSession::create([
            'task_id' => $this->id,
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

        // Close the latest open pause session
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

        // Update total elapsed since acknowledge
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

        // Close any open pause session
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
        if (! $this->acknowledged_at) {
            return 0;
        }

        $base = max(0, abs((int) now()->diffInSeconds($this->acknowledged_at)));

        return $base;
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
