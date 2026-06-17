<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskChange extends Model
{
    protected $fillable = [
        'task_id',
        'field_name',
        'old_value',
        'new_value',
        'modified_by',
        'is_viewed',
    ];

    protected $casts = [
        'is_viewed' => 'boolean',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function modifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'modified_by');
    }
}
