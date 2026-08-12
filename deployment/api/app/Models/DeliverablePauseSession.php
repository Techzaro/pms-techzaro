<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliverablePauseSession extends Model
{
    protected $fillable = [
        'deliverable_id',
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

    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resumedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resumed_by');
    }

    public function getReasonLabelAttribute(): string
    {
        return Deliverable::pauseReasons()[$this->reason] ?? $this->reason;
    }

    public function getFormattedDurationAttribute(): string
    {
        return Deliverable::formatDuration($this->duration_seconds);
    }
}
