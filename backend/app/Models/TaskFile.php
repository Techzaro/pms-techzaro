<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Represents a file attachment associated with a task.
 * Stores file metadata (name and URL) and links back to the parent task.
 */
class TaskFile extends Model
{
    protected $fillable = [
        'task_id',
        'name',
        'url',
    ];

    /** The task this file belongs to. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}