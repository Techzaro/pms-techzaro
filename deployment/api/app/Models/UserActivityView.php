<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserActivityView extends Model
{
    protected $fillable = [
        'user_id',
        'entity_type',
        'entity_id',
        'last_viewed_activity_id',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
