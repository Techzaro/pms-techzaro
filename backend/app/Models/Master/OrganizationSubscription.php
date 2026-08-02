<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * OrganizationSubscription model (Master Database).
 *
 * Tracks which plan an organization is subscribed to,
 * including billing period, status, and lifecycle dates.
 *
 * @property int    $id
 * @property int    $organization_id
 * @property int    $plan_id
 * @property string $billing_period
 * @property string $status
 * @property float  $amount
 * @property string $currency
 * @property \Carbon\Carbon $starts_at
 * @property \Carbon\Carbon|null $ends_at
 * @property \Carbon\Carbon|null $cancelled_at
 * @property \Carbon\Carbon|null $trial_ends_at
 * @property array|null $metadata
 */
class OrganizationSubscription extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'plan_id',
        'billing_period',
        'status',
        'amount',
        'currency',
        'starts_at',
        'ends_at',
        'cancelled_at',
        'trial_ends_at',
        'metadata',
    ];

    protected $casts = [
        'amount'        => 'float',
        'starts_at'     => 'datetime',
        'ends_at'       => 'datetime',
        'cancelled_at'  => 'datetime',
        'trial_ends_at' => 'datetime',
        'metadata'      => 'array',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    /** The organization this subscription belongs to. */
    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /** The plan for this subscription. */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(OrganizationPlan::class, 'plan_id');
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    /** Check if the subscription is currently active. */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** Check if the subscription is in trial period. */
    public function isOnTrial(): bool
    {
        return $this->status === 'trial'
            && $this->trial_ends_at
            && $this->trial_ends_at->isFuture();
    }

    /** Check if the subscription has expired. */
    public function isExpired(): bool
    {
        return $this->ends_at && $this->ends_at->isPast();
    }
}
