<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stores per-user notes attached to a task.
 * Allows individual users to maintain private notes about a task.
 */
class TaskUserNote extends Model
{
    protected $fillable = [
        'task_id',
        'user_id',
        'note',
    ];

    /** The task this note belongs to. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** The user who wrote this note. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
