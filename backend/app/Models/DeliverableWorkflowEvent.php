<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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

    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
