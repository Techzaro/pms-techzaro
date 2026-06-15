<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
