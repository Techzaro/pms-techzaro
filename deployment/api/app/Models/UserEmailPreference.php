<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stores per-user notification channel preferences.
 * Controls which notification types are enabled for email, browser, and mobile push channels.
 */
class UserEmailPreference extends Model
{
    protected $fillable = [
        'user_id',
        'task_notifications',
        'deliverable_notifications',
        'project_notifications',
        'event_notifications',
        'team_notifications',
        'system_notifications',
        'browser_notifications',
        'mobile_push_notifications',
    ];

    protected $casts = [
        'task_notifications' => 'boolean',
        'deliverable_notifications' => 'boolean',
        'project_notifications' => 'boolean',
        'event_notifications' => 'boolean',
        'team_notifications' => 'boolean',
        'system_notifications' => 'boolean',
        'browser_notifications' => 'boolean',
        'mobile_push_notifications' => 'boolean',
    ];

    /** The user these preferences belong to. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
