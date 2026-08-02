<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * OrganizationPlan model (Master Database).
 *
 * Defines a subscription plan available for organizations.
 * Plans control user limits, project limits, storage, and module access.
 *
 * @property int    $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property float  $price_monthly
 * @property float  $price_yearly
 * @property int    $max_users
 * @property int    $max_projects
 * @property int    $max_storage_gb
 * @property bool   $is_active
 * @property bool   $is_default
 * @property int    $sort_order
 */
class OrganizationPlan extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'name',
        'slug',
        'description',
        'price_monthly',
        'price_yearly',
        'max_users',
        'max_projects',
        'max_storage_gb',
        'is_active',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'price_monthly' => 'float',
        'price_yearly'  => 'float',
        'max_users'     => 'integer',
        'max_projects'  => 'integer',
        'max_storage_gb' => 'integer',
        'is_active'     => 'boolean',
        'is_default'    => 'boolean',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    /** Modules included in this plan. */
    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(SaasModule::class, 'plan_modules', 'plan_id', 'module_id')
            ->withPivot('is_enabled')
            ->withTimestamps();
    }

    /** Organizations subscribed to this plan. */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(OrganizationSubscription::class, 'plan_id');
    }

    /** Organizations subscribed to this plan. */
    public function organizations(): HasMany
    {
        return $this->hasMany(Organization::class, 'id'); // via subscription
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    /** Check if a specific module is included in this plan. */
    public function hasModule(string $moduleSlug): bool
    {
        return $this->modules()
            ->where('slug', $moduleSlug)
            ->where('is_active', true)
            ->wherePivot('is_enabled', true)
            ->exists();
    }

    /** Get the price for a billing period. */
    public function getPrice(string $period = 'monthly'): float
    {
        return $period === 'yearly' ? $this->price_yearly : $this->price_monthly;
    }
}
