<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SharedResourceActivityLog model (Tenant Database).
 *
 * Records all sharing-related activities for audit and transparency.
 */
class SharedResourceActivityLog extends Model
{
    protected $fillable = [
        'connection_id',
        'shared_resource_id',
        'user_id',
        'action',
        'resource_type',
        'resource_id',
        'old_permission',
        'new_permission',
        'ip_address',
        'details',
        'acted_at',
    ];

    protected $casts = [
        'details'  => 'array',
        'acted_at' => 'datetime',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sharedResource(): BelongsTo
    {
        return $this->belongsTo(SharedResource::class);
    }

    /*
    |------------------------------------------------------------------
    | Scopes
    |------------------------------------------------------------------
    */

    public function scopeForConnection($query, int $connectionId)
    {
        return $query->where('connection_id', $connectionId);
    }

    public function scopeForOrganization($query, int $organizationId)
    {
        return $query->whereHas('sharedResource', function ($q) use ($organizationId) {
            $q->where('shared_by_organization_id', $organizationId)
              ->orWhere('shared_with_organization_id', $organizationId);
        });
    }

    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('acted_at', '>=', now()->subDays($days));
    }
}
