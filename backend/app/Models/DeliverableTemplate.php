<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliverableTemplate extends Model
{
    protected $fillable = [
        'task_id',
        'title',
        'description',
        'quantity',
        'combined',
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'combined' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}
