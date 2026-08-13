<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * OrganizationSubscription model (Master Database).
 *
 * Tracks which plan an organization is subscribed to,
 * including billing period, status, lifecycle dates,
 * and optional per-org custom overrides for pricing/limits.
 *
 * @property int    $id
 * @property int    $organization_id
 * @property int    $plan_id
 * @property string $billing_period
 * @property string $status
 * @property float  $amount
 * @property string $currency
 * @property bool   $is_custom
 * @property float|null $custom_price_monthly
 * @property float|null $custom_price_yearly
 * @property int|null   $custom_max_users
 * @property int|null   $custom_max_projects
 * @property int|null   $custom_max_storage_gb
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
        'is_custom',
        'custom_price_monthly',
        'custom_price_yearly',
        'custom_max_users',
        'custom_max_projects',
        'custom_max_storage_gb',
        'starts_at',
        'ends_at',
        'cancelled_at',
        'trial_ends_at',
        'metadata',
    ];

    protected $casts = [
        'amount'                => 'float',
        'is_custom'             => 'boolean',
        'custom_price_monthly'  => 'float',
        'custom_price_yearly'   => 'float',
        'custom_max_users'      => 'integer',
        'custom_max_projects'   => 'integer',
        'custom_max_storage_gb' => 'integer',
        'starts_at'             => 'datetime',
        'ends_at'               => 'datetime',
        'cancelled_at'          => 'datetime',
        'trial_ends_at'         => 'datetime',
        'metadata'              => 'array',
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

    /*
    |------------------------------------------------------------------
    | Custom Plan Helpers
    |------------------------------------------------------------------
    */

    /** Get the effective monthly price (custom if set, else plan default). */
    public function getEffectivePriceMonthly(): float
    {
        if ($this->is_custom && $this->custom_price_monthly !== null) {
            return $this->custom_price_monthly;
        }
        return $this->plan?->price_monthly ?? 0;
    }

    /** Get the effective yearly price (custom if set, else plan default). */
    public function getEffectivePriceYearly(): float
    {
        if ($this->is_custom && $this->custom_price_yearly !== null) {
            return $this->custom_price_yearly;
        }
        return $this->plan?->price_yearly ?? 0;
    }

    /** Get the effective price for the current billing period. */
    public function getEffectivePrice(): float
    {
        return $this->billing_period === 'yearly'
            ? $this->getEffectivePriceYearly()
            : $this->getEffectivePriceMonthly();
    }

    /** Get the effective max users (custom if set, else plan default). */
    public function getEffectiveMaxUsers(): int
    {
        if ($this->is_custom && $this->custom_max_users !== null) {
            return $this->custom_max_users;
        }
        return $this->plan?->max_users ?? -1;
    }

    /** Get the effective max projects (custom if set, else plan default). */
    public function getEffectiveMaxProjects(): int
    {
        if ($this->is_custom && $this->custom_max_projects !== null) {
            return $this->custom_max_projects;
        }
        return $this->plan?->max_projects ?? -1;
    }

    /** Get the effective max storage (custom if set, else plan default). */
    public function getEffectiveMaxStorageGb(): int
    {
        if ($this->is_custom && $this->custom_max_storage_gb !== null) {
            return $this->custom_max_storage_gb;
        }
        return $this->plan?->max_storage_gb ?? 10;
    }

    /** Get all effective plan details as an array (for API responses). */
    public function getEffectivePlanDetails(): array
    {
        return [
            'price_monthly' => $this->getEffectivePriceMonthly(),
            'price_yearly'  => $this->getEffectivePriceYearly(),
            'max_users'     => $this->getEffectiveMaxUsers(),
            'max_projects'  => $this->getEffectiveMaxProjects(),
            'max_storage_gb'=> $this->getEffectiveMaxStorageGb(),
            'is_custom'     => $this->is_custom,
        ];
    }
}
