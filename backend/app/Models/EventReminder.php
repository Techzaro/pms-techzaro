<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EventReminder extends Model
{
    protected $fillable = [
        'event_id',
        'user_id',
        'value',
        'unit',
        'is_sent',
        'sent_at',
    ];

    protected $casts = [
        'value' => 'integer',
        'is_sent' => 'boolean',
        'sent_at' => 'datetime',
    ];

    /**
     * Parent event for this reminder.
     */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /**
     * Target user for this reminder (if user-specific).
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
