<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskFile extends Model
{
    protected $fillable = [
        'task_id',
        'name',
        'url',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}