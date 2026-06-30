<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks workflow events for a task (e.g., submitted, approved, rejected, reopened).
 * Stores event details including comments, instructions, and optional file attachments.
 */
class TaskWorkflowEvent extends Model
{
    protected $fillable = [
        'task_id',
        'user_id',
        'action',
        'comment',
        'instructions',
        'new_deadline',
        'file_path',
        'file_name',
    ];

    protected $casts = [
        'new_deadline' => 'date',
    ];

    /** The task this event belongs to. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** The user who triggered this workflow event. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
