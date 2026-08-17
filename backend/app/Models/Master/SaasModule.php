<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * SaasModule model (Master Database).
 *
 * Defines a feature module available in the platform.
 * Modules are linked to plans via the plan_modules pivot table
 * to control which features each plan includes.
 *
 * @property int    $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string $category
 * @property bool   $is_active
 * @property bool   $is_default
 * @property int    $sort_order
 */
class SaasModule extends Model
{
    protected $connection = 'mysql_master';

    protected $table = 'saas_modules';

    protected $fillable = [
        'name',
        'slug',
        'description',
        'category',
        'is_active',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    /** Plans that include this module. */
    public function plans(): BelongsToMany
    {
        return $this->belongsToMany(OrganizationPlan::class, 'plan_modules', 'module_id', 'plan_id')
            ->withPivot('is_enabled')
            ->withTimestamps();
    }

    /*
    |------------------------------------------------------------------
    | Scopes
    |------------------------------------------------------------------
    */

    /** Scope to only active modules. */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /** Scope to modules that are included by default. */
    public function scopeDefault($query)
    {
        return $query->where('is_default', true);
    }
}
