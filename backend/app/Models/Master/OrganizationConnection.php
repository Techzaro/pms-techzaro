<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * OrganizationConnection model (Master Database).
 *
 * Represents a connection between two organizations.
 * Tracks the request/approval lifecycle and connection status.
 */
class OrganizationConnection extends Model
{
    use SoftDeletes;

    protected $connection = 'mysql_master';

    protected $fillable = [
        'requesting_organization_id',
        'receiving_organization_id',
        'requested_by_user_id',
        'approved_by_user_id',
        'connection_code',
        'status',
        'request_message',
        'rejection_reason',
        'requested_at',
        'approved_at',
        'rejected_at',
        'expires_at',
        'suspended_at',
        'revoked_at',
        'metadata',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'requested_at' => 'datetime',
        'approved_at'  => 'datetime',
        'rejected_at'  => 'datetime',
        'expires_at'   => 'datetime',
        'suspended_at' => 'datetime',
        'revoked_at'   => 'datetime',
    ];

    protected $hidden = [
        'metadata',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    public function requestingOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'requesting_organization_id');
    }

    public function receivingOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'receiving_organization_id');
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isExpired(): bool
    {
        return $this->status === 'expired'
            || ($this->expires_at && $this->expires_at->isPast());
    }

    public function isRevoked(): bool
    {
        return $this->status === 'revoked';
    }

    /**
     * Get the other organization in this connection.
     */
    public function getOtherOrganization(int $organizationId): ?Organization
    {
        if ($this->requesting_organization_id === $organizationId) {
            return $this->receivingOrganization;
        }
        if ($this->receiving_organization_id === $organizationId) {
            return $this->requestingOrganization;
        }
        return null;
    }

    /**
     * Generate a unique connection code in TXO-XXXXXXXX format.
     */
    public static function generateConnectionCode(): string
    {
        do {
            $code = 'TXO-' . strtoupper(substr(sha1(uniqid(mt_rand(), true)), 0, 8));
        } while (static::where('connection_code', $code)->exists());

        return $code;
    }

    /**
     * Scope: get active connections for an organization.
     */
    public function scopeActiveForOrganization($query, int $organizationId)
    {
        return $query->where(function ($q) use ($organizationId) {
            $q->where('requesting_organization_id', $organizationId)
              ->orWhere('receiving_organization_id', $organizationId);
        })->where('status', 'active');
    }

    /**
     * Scope: get all connections (any status) for an organization.
     */
    public function scopeForOrganization($query, int $organizationId)
    {
        return $query->where(function ($q) use ($organizationId) {
            $q->where('requesting_organization_id', $organizationId)
              ->orWhere('receiving_organization_id', $organizationId);
        });
    }
}
