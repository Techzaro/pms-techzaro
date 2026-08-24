<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\User;
use App\Services\BusinessIdService;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

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
        'states',
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
        'recurrence_start_date',
        'recurrence_end_date',
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

    
    protected $appends = [
        'due_state',
    ];

    /**
     * Calculate dynamic due state (SRS Sections 2, 3, & 6).
     * Returns: 'Overdue', 'Due Today', 'Due This Week', 'Due This Month', 'Upcoming', or 'No due date'.
     */
    public function getDueStateAttribute(): string
    {
        $dueDate = $this->end_date ?? $this->due_date ?? null;
        if (! $dueDate) {
            return 'No due date';
        }

        try {
            $due = $dueDate instanceof Carbon ? $dueDate : Carbon::parse($dueDate);
        } catch (\Throwable $e) {
            return 'No due date';
        }

        $now = Carbon::now();
        $today = $now->copy()->startOfDay();
        $dueDay = $due->copy()->startOfDay();

        if ($dueDay->lt($today)) {
            return 'Overdue';
        }

        if ($dueDay->eq($today)) {
            return 'Due Today';
        }

        $endOfWeek = $now->copy()->endOfWeek();
        if ($dueDay->lte($endOfWeek->copy()->startOfDay())) {
            return 'Due This Week';
        }

        $endOfMonth = $now->copy()->endOfMonth();
        if ($dueDay->lte($endOfMonth->copy()->startOfDay())) {
            return 'Due This Month';
        }

        return 'Upcoming';
    }

    protected $casts = [
        'requirements' => 'array',
        'states' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'recurrence_settings' => 'array',
        'recurrence_start_date' => 'datetime:Y-m-d\TH:i:s',
        'recurrence_end_date' => 'datetime:Y-m-d\TH:i:s',
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

    /** Apply filters for querying tasks (SRS Sections 4, 5, 8, 9). */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        // ── 1. STATUSES FILTER (OR within statuses) ──
        $rawStatuses = $filters['statuses'] ?? $filters['status'] ?? [];
        if (is_string($rawStatuses) && str_contains($rawStatuses, ',')) {
            $rawStatuses = explode(',', $rawStatuses);
        }
        if (! is_array($rawStatuses) && ! empty($rawStatuses)) {
            $rawStatuses = [$rawStatuses];
        }
        if (is_array($rawStatuses) && ! empty($rawStatuses)) {
            $expandedStatuses = [];
            $hasDueToday = false;
            $hasTransferred = false;
            $hasReopened = false;

            foreach ($rawStatuses as $st) {
                $st = trim((string) $st);
                $stLower = strtolower($st);

                if ($stLower === 'due_today') {
                    $hasDueToday = true;
                } elseif ($stLower === 'transferred') {
                    $hasTransferred = true;
                } elseif ($stLower === 'reopened') {
                    $hasReopened = true;
                } elseif (in_array($stLower, ['pending', 'planned', 'planning'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Pending', 'pending', 'planned', 'Planning', 'Planned']);
                } elseif (in_array($stLower, ['in_progress', 'in progress', 'in-progress', 'doing'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['In Progress', 'in_progress', 'in-progress', 'doing']);
                } elseif (in_array($stLower, ['submitted', 'review', 'in_review'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Submitted', 'submitted', 'review', 'in_review']);
                } elseif (in_array($stLower, ['approved', 'completed', 'done'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Approved', 'approved', 'completed', 'done']);
                } elseif (in_array($stLower, ['paused', 'pause'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Paused', 'paused', 'pause']);
                } elseif (in_array($stLower, ['declined', 'rejected', 'failed'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Declined', 'declined', 'rejected', 'failed']);
                } elseif (in_array($stLower, ['abandoned', 'abandon_requested'])) {
                    $expandedStatuses = array_merge($expandedStatuses, ['Abandoned', 'abandoned', 'abandon_requested']);
                } elseif (! empty($st)) {
                    $expandedStatuses[] = $st;
                }
            }

            $expandedStatuses = array_values(array_unique($expandedStatuses));
            if (! empty($expandedStatuses) || $hasDueToday || $hasTransferred || $hasReopened) {
                $query->where(function ($sq) use ($expandedStatuses, $hasDueToday, $hasTransferred, $hasReopened) {
                    $hasCondition = false;
                    if (! empty($expandedStatuses)) {
                        $sq->whereIn('tasks.status', $expandedStatuses);
                        $hasCondition = true;
                    }
                    if ($hasDueToday) {
                        $today = now()->toDateString();
                        $clause = function ($ddq) use ($today) {
                            $ddq->whereDate('tasks.end_date', $today)->orWhereDate('tasks.start_date', $today);
                        };
                        if ($hasCondition) {
                            $sq->orWhere($clause);
                        } else {
                            $sq->where($clause);
                            $hasCondition = true;
                        }
                    }
                    if ($hasTransferred) {
                        $transferCondition = function ($tq) {
                            $tq->whereJsonContains('tasks.states', 'Transferred')->orWhereJsonContains('tasks.states', 'transferred')
                               ->orWhere(function ($dtq) {
                                   $dtq->whereNotNull('tasks.delegation_chain')->where('tasks.delegation_chain', '!=', '[]');
                               });
                        };
                        if ($hasCondition) {
                            $sq->orWhere($transferCondition);
                        } else {
                            $sq->where($transferCondition);
                            $hasCondition = true;
                        }
                    }
                    if ($hasReopened) {
                        $reopenCondition = function ($rq) {
                            $rq->whereJsonContains('tasks.states', 'Reopened')->orWhereJsonContains('tasks.states', 'reopened')
                               ->orWhere('tasks.status', 'reopened')
                               ->orWhere('tasks.reopen_count', '>', 0)
                               ->orWhereNotNull('tasks.reopened_at');
                        };
                        if ($hasCondition) {
                            $sq->orWhere($reopenCondition);
                        } else {
                            $sq->where($reopenCondition);
                            $hasCondition = true;
                        }
                    }
                });
            }
        }

        // ── 2. STATES FILTER (OR within states, AND with other filters) ──
        $rawStates = $filters['states'] ?? $filters['state'] ?? [];
        if (is_string($rawStates) && str_contains($rawStates, ',')) {
            $rawStates = explode(',', $rawStates);
        }
        if (! is_array($rawStates) && ! empty($rawStates)) {
            $rawStates = [$rawStates];
        }
        if (is_array($rawStates) && ! empty($rawStates)) {
            $rawStates = array_values(array_filter(array_map('trim', $rawStates)));
            if (! empty($rawStates)) {
                $query->where(function ($stateQuery) use ($rawStates) {
                    foreach ($rawStates as $idx => $stateItem) {
                        $stateItemLower = strtolower($stateItem);
                        $clause = function ($sq) use ($stateItem, $stateItemLower) {
                            if ($stateItemLower === 'reopened') {
                                $sq->whereJsonContains('tasks.states', 'Reopened')->orWhereJsonContains('tasks.states', 'reopened')
                                   ->orWhere('tasks.status', 'reopened')
                                   ->orWhere('tasks.reopen_count', '>', 0)
                                   ->orWhereNotNull('tasks.reopened_at');
                            } elseif ($stateItemLower === 'transferred') {
                                $sq->whereJsonContains('tasks.states', 'Transferred')->orWhereJsonContains('tasks.states', 'transferred')
                                   ->orWhere(function ($dtq) {
                                       $dtq->whereNotNull('tasks.delegation_chain')->where('tasks.delegation_chain', '!=', '[]');
                                   });
                            } else {
                                $escaped = json_encode($stateItem);
                                $sq->whereJsonContains('tasks.states', $stateItem);
                            }
                        };

                        if ($idx === 0) {
                            $stateQuery->where($clause);
                        } else {
                            $stateQuery->orWhere($clause);
                        }
                    }
                });
            }
        }

        // ── 3. DUE STATES FILTER (OR within due states, AND with other filters) ──
        $rawDueStates = $filters['due_states'] ?? $filters['due_state'] ?? $filters['dueStates'] ?? [];
        if (is_string($rawDueStates) && str_contains($rawDueStates, ',')) {
            $rawDueStates = explode(',', $rawDueStates);
        }
        if (! is_array($rawDueStates) && ! empty($rawDueStates)) {
            $rawDueStates = [$rawDueStates];
        }
        if (is_array($rawDueStates) && ! empty($rawDueStates)) {
            $rawDueStates = array_values(array_filter(array_map('trim', $rawDueStates)));
            if (! empty($rawDueStates)) {
                $query->where(function ($dueQuery) use ($rawDueStates) {
                    $now = \Carbon\Carbon::now();
                    $todayStart = $now->copy()->startOfDay();
                    $todayEnd = $now->copy()->endOfDay();
                    $weekStart = $now->copy()->startOfWeek()->startOfDay();
                    $weekEnd = $now->copy()->endOfWeek()->endOfDay();
                    $monthStart = $now->copy()->startOfMonth()->startOfDay();
                    $monthEnd = $now->copy()->endOfMonth()->endOfDay();

                    foreach ($rawDueStates as $idx => $dueItem) {
                        $dueItemLower = strtolower($dueItem);
                        $clause = function ($dq) use ($dueItemLower, $todayStart, $todayEnd, $weekStart, $weekEnd, $monthStart, $monthEnd) {
                            if (in_array($dueItemLower, ['overdue', 'over_due', 'past_due'])) {
                                $dq->whereNotNull('tasks.end_date')
                                   ->where('tasks.end_date', '<', $todayStart);
                            } elseif (in_array($dueItemLower, ['due today', 'due_today', 'today'])) {
                                $dq->whereNotNull('tasks.end_date')
                                   ->whereBetween('tasks.end_date', [$todayStart, $todayEnd]);
                            } elseif (in_array($dueItemLower, ['due this week', 'due_this_week', 'this_week', 'week'])) {
                                $dq->whereNotNull('tasks.end_date')
                                   ->whereBetween('tasks.end_date', [$weekStart, $weekEnd]);
                            } elseif (in_array($dueItemLower, ['due this month', 'due_this_month', 'this_month', 'month'])) {
                                $dq->whereNotNull('tasks.end_date')
                                   ->whereBetween('tasks.end_date', [$monthStart, $monthEnd]);
                            } elseif (in_array($dueItemLower, ['upcoming', 'future'])) {
                                $dq->whereNotNull('tasks.end_date')
                                   ->where('tasks.end_date', '>', $monthEnd);
                            } elseif (in_array($dueItemLower, ['no due date', 'no_due_date', 'none', 'null'])) {
                                $dq->whereNull('tasks.end_date');
                            }
                        };

                        if ($idx === 0) {
                            $dueQuery->where($clause);
                        } else {
                            $dueQuery->orWhere($clause);
                        }
                    }
                });
            }
        }

        if (! empty($filters['priority'])) {
            $query->where('tasks.priority', $filters['priority']);
        }
        $userIds = $filters['user_id'] ?? $filters['assigned_to'] ?? null;
        if (! empty($userIds)) {
            $ids = is_array($userIds) ? $userIds : explode(',', (string) $userIds);
            $ids = array_values(array_filter(array_map('intval', $ids)));
            if (! empty($ids)) {
                $query->where(function ($q) use ($ids) {
                    $q->whereIn('tasks.assigned_to', $ids)
                      ->orWhereHas('assignees', fn ($aq) => $aq->whereIn('users.id', $ids));
                });
            }
        }
        if (! empty($filters['project_id'])) {
            $projectIds = is_array($filters['project_id']) ? $filters['project_id'] : explode(',', (string) $filters['project_id']);
            $projectIds = array_values(array_filter(array_map('intval', $projectIds)));
            if (! empty($projectIds)) {
                $query->whereIn('tasks.project_id', $projectIds);
            }
        }
        if (! empty($filters['search'])) {
            $query->where(function ($q) use ($filters) {
                $q->where('tasks.title', 'like', '%'.$filters['search'].'%')
                    ->orWhere('tasks.business_id', 'like', '%'.$filters['search'].'%');
            });
        }
        if (! empty($filters['start_date_from'])) {
            $query->where('tasks.start_date', '>=', $filters['start_date_from']);
        }
        if (! empty($filters['start_date_to'])) {
            $query->where('tasks.start_date', '<=', $filters['start_date_to']);
        }
        if (! empty($filters['start_date'])) {
            $query->whereDate('tasks.start_date', '>=', $filters['start_date']);
        }
        if (! empty($filters['end_date'])) {
            $query->whereDate('tasks.end_date', '<=', $filters['end_date']);
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

    /** All users following this task (many-to-many). */
    public function followers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_followers')->withTimestamps();
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

    /** The user who requested to abandon this task. */
    public function abandonRequestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandon_requested_by');
    }

    /** The user who approved/abandoned this task. */
    public function abandonedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandoned_by');
    }

    /** The user who declined the abandon request. */
    public function abandonDeclinedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'abandon_declined_by');
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

    /**
     * Compute task progress percentage (0 - 100).
     * If status is approved, completed, submitted, or done, progress is always 100%.
     * If deliverables exist, computes ratio of approved deliverables.
     */
    public function computeProgress(): int
    {
        $status = strtolower($this->status ?? '');
        if (in_array($status, ['approved', 'completed', 'submitted', 'submitted_late', 'done'])) {
            return 100;
        }

        $total = (int) ($this->total_deliverables ?? ($this->deliverables()->count()));
        if ($total > 0) {
            $completed = (int) ($this->completed_deliverables ?? ($this->deliverables()->where('status', 'approved')->count()));
            return (int) round(($completed / $total) * 100);
        }

        return 0;
    }

    public function getDeliverablesProgressAttribute($value)
    {
        $status = strtolower($this->status ?? '');
        if (in_array($status, ['approved', 'completed', 'submitted', 'submitted_late', 'done'])) {
            return 100;
        }
        if ($value !== null && $value !== '') {
            return (int) $value;
        }
        return $this->computeProgress();
    }
}
