<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SharedProjectMember extends Model
{
    protected $fillable = [
        'shared_resource_id',
        'user_id',
        'organization_id',
        'added_by',
    ];

    public function sharedResource(): BelongsTo
    {
        return $this->belongsTo(SharedResource::class, 'shared_resource_id');
    }
}
