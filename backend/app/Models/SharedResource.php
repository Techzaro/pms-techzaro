<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * SharedResource model (Tenant Database).
 *
 * Represents a resource (project, task, document, event, etc.)
 * that has been shared with an external organization.
 */
class SharedResource extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'connection_id',
        'shared_by_organization_id',
        'shared_with_organization_id',
        'resource_type',
        'resource_id',
        'resource_name',
        'permission',
        'can_download',
        'status',
        'shared_by_user_id',
        'approved_by_user_id',
        'notes',
        'shared_at',
        'expires_at',
        'revoked_at',
        'metadata',
    ];

    protected $casts = [
        'can_download' => 'boolean',
        'metadata'     => 'array',
        'shared_at'    => 'datetime',
        'expires_at'   => 'datetime',
        'revoked_at'   => 'datetime',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    public function sharedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'shared_by_user_id');
    }

    public function approvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(SharedResourceUser::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(SharedResourceActivityLog::class);
    }

    /*
    |------------------------------------------------------------------
    | Resource Accessors
    |------------------------------------------------------------------
    */

    /**
     * Get the actual resource model based on resource_type.
     */
    public function getResource()
    {
        return match ($this->resource_type) {
            'project'        => \App\Models\Project::find($this->resource_id),
            'task'           => \App\Models\Task::find($this->resource_id),
            'document'       => null, // Company documents handled differently
            'event'          => \App\Models\Event::find($this->resource_id),
            'knowledge_base' => \App\Models\KnowledgeBase::find($this->resource_id),
            default          => null,
        };
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    public function isActive(): bool
    {
        return $this->status === 'active'
            && (!$this->expires_at || $this->expires_at->isFuture());
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

    public function canCollaborate(): bool
    {
        return $this->permission === 'collaborate';
    }

    public function canComment(): bool
    {
        return in_array($this->permission, ['comment', 'collaborate']);
    }

    /**
     * Scope: get active shared resources for an organization (as owner).
     */
    public function scopeSharedByOrganization($query, int $organizationId)
    {
        return $query->where('shared_by_organization_id', $organizationId)
                     ->where('status', 'active')
                     ->where(function ($q) {
                         $q->whereNull('expires_at')
                           ->orWhere('expires_at', '>', now());
                     });
    }

    /**
     * Scope: get resources shared with an organization.
     */
    public function scopeSharedWithOrganization($query, int $organizationId)
    {
        return $query->where('shared_with_organization_id', $organizationId)
                     ->where('status', 'active')
                     ->where(function ($q) {
                         $q->whereNull('expires_at')
                           ->orWhere('expires_at', '>', now());
                     });
    }

    /**
     * Scope: filter by resource type.
     */
    public function scopeOfType($query, string $type)
    {
        return $query->where('resource_type', $type);
    }
}
