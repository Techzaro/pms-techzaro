<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks user activity across the system.
 * Records actions like creating, updating, approving, or deleting entities.
 */
class Activity extends Model
{
    protected $fillable = [
        'user_id',
        'activity_type',
        'action',
        'related_module',
        'related_id',
        'entity_name',
        'related_user_id',
        'description',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    /** The user who performed the activity. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The user affected by the activity (e.g., assigned user). */
    public function relatedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'related_user_id');
    }
}
