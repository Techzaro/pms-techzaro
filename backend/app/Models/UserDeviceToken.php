<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stores device tokens for push notification delivery.
 * Each record represents a registered device (e.g., mobile or web) for a user.
 */
class UserDeviceToken extends Model
{
    protected $fillable = [
        'user_id',
        'device_token',
        'device_type',
        'last_active_at',
    ];

    protected $casts = [
        'last_active_at' => 'datetime',
    ];

    /** The user this device token belongs to. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
