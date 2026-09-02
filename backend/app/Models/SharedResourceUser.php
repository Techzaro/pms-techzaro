<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SharedResourceUser model (Tenant Database).
 *
 * Tracks individual user access to shared resources.
 * Allows per-user permission overrides on shared resources.
 */
class SharedResourceUser extends Model
{
    protected $fillable = [
        'shared_resource_id',
        'user_id',
        'permission_override',
        'can_download',
        'status',
        'granted_at',
        'expires_at',
        'granted_by_user_id',
    ];

    protected $casts = [
        'can_download' => 'boolean',
        'granted_at'   => 'datetime',
        'expires_at'   => 'datetime',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    public function sharedResource(): BelongsTo
    {
        return $this->belongsTo(SharedResource::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function grantedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_user_id');
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    public function getEffectivePermission(): string
    {
        return $this->permission_override ?? $this->sharedResource->permission ?? 'view';
    }

    public function getEffectiveCanDownload(): bool
    {
        if ($this->can_download !== null) {
            return $this->can_download;
        }
        return $this->sharedResource->can_download ?? false;
    }

    public function isActive(): bool
    {
        return $this->status === 'active'
            && (!$this->expires_at || $this->expires_at->isFuture());
    }
}
