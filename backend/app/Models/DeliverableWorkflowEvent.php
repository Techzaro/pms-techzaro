<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks workflow events for a deliverable (e.g., submitted, approved, rejected, reopened).
 * Stores event details including comments, instructions, and optional file attachments.
 */
class DeliverableWorkflowEvent extends Model
{
    protected $fillable = [
        'deliverable_id',
        'event_type',
        'user_id',
        'comment',
        'instructions',
        'new_deadline',
        'file_path',
        'file_name',
    ];

    protected $casts = [
        'new_deadline' => 'date',
    ];

    /** The deliverable this event belongs to. */
    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    /** The user who triggered this workflow event. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
