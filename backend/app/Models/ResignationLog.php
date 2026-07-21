<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResignationLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'resigned_by',
        'resigned_at',
        'ip_address',
        'user_agent',
        'total_projects_returned',
        'total_tasks_returned',
        'total_deliverables_returned',
        'total_events_returned',
        'total_drafts_created',
        'total_notifications_sent',
        'draft_owners',
        'affected_items',
    ];

    protected $casts = [
        'resigned_at' => 'datetime',
        'draft_owners' => 'array',
        'affected_items' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resignedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resigned_by');
    }
}
