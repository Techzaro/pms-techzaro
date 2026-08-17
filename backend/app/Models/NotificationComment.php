<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Comments left by users on notification activities / email threads in the portal.
 */
class NotificationComment extends Model
{
    protected $fillable = [
        'notification_id',
        'user_id',
        'comment',
    ];

    /** Notification relationship */
    public function notification(): BelongsTo
    {
        return $this->belongsTo(Notification::class);
    }

    /** User who posted the comment */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
