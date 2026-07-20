<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskPauseSession extends Model
{
    protected $fillable = [
        'task_id',
        'user_id',
        'reason',
        'reason_detail',
        'paused_at',
        'resumed_at',
        'duration_seconds',
        'resumed_by',
        'is_auto_paused',
    ];

    protected $casts = [
        'paused_at' => 'datetime:Y-m-d\TH:i:s',
        'resumed_at' => 'datetime:Y-m-d\TH:i:s',
        'duration_seconds' => 'integer',
        'is_auto_paused' => 'boolean',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resumedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resumed_by');
    }

    /** Get human-readable reason label. */
    public function getReasonLabelAttribute(): string
    {
        return Task::pauseReasons()[$this->reason] ?? $this->reason;
    }

    /** Get formatted duration. */
    public function getFormattedDurationAttribute(): string
    {
        return Task::formatDuration($this->duration_seconds);
    }
}
