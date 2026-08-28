<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * OrganizationTrialSetting model (Master Database).
 *
 * Stores optional organization-specific trial configuration overrides.
 * If no record exists, the organization uses the global/default trial
 * configuration from the OrganizationPlan.
 *
 * @property int    $id
 * @property int    $organization_id
 * @property int    $trial_duration
 * @property string $trial_duration_unit
 * @property int    $max_users
 * @property int    $max_projects
 * @property float  $max_storage_gb
 * @property string $storage_unit
 */
class OrganizationTrialSetting extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'trial_duration',
        'trial_duration_unit',
        'max_users',
        'max_projects',
        'max_storage_gb',
        'storage_unit',
    ];

    protected $casts = [
        'trial_duration' => 'integer',
        'max_users'      => 'integer',
        'max_projects'   => 'integer',
        'max_storage_gb' => 'float',
        'storage_unit' => 'string',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    /** Convert trial duration to minutes. */
    public function getTrialMinutes(): int
    {
        return match ($this->trial_duration_unit) {
            'minutes' => $this->trial_duration,
            'hours'   => $this->trial_duration * 60,
            'days'    => $this->trial_duration * 24 * 60,
            default   => $this->trial_duration * 24 * 60,
        };
    }

    /** Get human-readable trial duration label. */
    public function getTrialLabel(): string
    {
        $unit = $this->trial_duration === 1
            ? rtrim($this->trial_duration_unit, 's')
            : $this->trial_duration_unit;
        return "{$this->trial_duration} {$unit}";
    }
}
