<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SharingNotification model (Tenant Database).
 *
 * Notifications specifically for sharing-related events.
 */
class SharingNotification extends Model
{
    protected $fillable = [
        'organization_id',
        'user_id',
        'from_organization_id',
        'type',
        'title',
        'message',
        'data',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'data'    => 'array',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
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

    /*
    |------------------------------------------------------------------
    | Scopes
    |------------------------------------------------------------------
    */

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where(function ($q) use ($userId) {
            $q->where('user_id', $userId)
              ->orWhereNull('user_id');
        });
    }

    public function scopeOfType($query, string $type)
    {
        return $query->where('type', $type);
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    public function markAsRead(): void
    {
        $this->update(['is_read' => true, 'read_at' => now()]);
    }

    /**
     * Get the notification icon based on type.
     */
    public function getIcon(): string
    {
        return match ($this->type) {
            'connection_request'    => 'link',
            'connection_approved'   => 'check-circle',
            'connection_rejected'   => 'x-circle',
            'access_requested'      => 'key',
            'access_approved'       => 'unlock',
            'access_rejected'       => 'lock',
            'resource_shared'       => 'share-2',
            'permission_changed'    => 'settings',
            'access_expiring'       => 'alert-triangle',
            'access_expired'        => 'alert-circle',
            'access_revoked'        => 'x-octagon',
            'organization_disconnected' => 'unlink',
            default                 => 'bell',
        };
    }
}
