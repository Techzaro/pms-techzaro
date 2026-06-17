<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserEmailPreference extends Model
{
    protected $fillable = [
        'user_id',
        'task_notifications',
        'deliverable_notifications',
        'project_notifications',
        'event_notifications',
        'system_notifications',
        'browser_notifications',
        'mobile_push_notifications',
    ];

    protected $casts = [
        'task_notifications' => 'boolean',
        'deliverable_notifications' => 'boolean',
        'project_notifications' => 'boolean',
        'event_notifications' => 'boolean',
        'system_notifications' => 'boolean',
        'browser_notifications' => 'boolean',
        'mobile_push_notifications' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
