<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * OrganizationDomain model (Master Database).
 *
 * Maps custom domains and subdomains to organizations.
 * Used for tenant resolution via subdomain or custom domain routing.
 *
 * @property int    $id
 * @property int    $organization_id
 * @property string $domain
 * @property bool   $is_primary
 * @property bool   $is_verified
 * @property \Carbon\Carbon|null $verified_at
 */
class OrganizationDomain extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'domain',
        'is_primary',
        'is_verified',
        'verified_at',
    ];

    protected $casts = [
        'is_primary'  => 'boolean',
        'is_verified' => 'boolean',
        'verified_at' => 'datetime',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    /** The organization this domain belongs to. */
    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /*
    |------------------------------------------------------------------
    | Scopes
    |------------------------------------------------------------------
    */

    /** Scope to verified domains only. */
    public function scopeVerified($query)
    {
        return $query->where('is_verified', true);
    }

    /** Scope to primary domains only. */
    public function scopePrimary($query)
    {
        return $query->where('is_primary', true);
    }
}
