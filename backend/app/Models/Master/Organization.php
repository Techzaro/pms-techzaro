<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Organization model (Master Database).
 *
 * Represents a single tenant/organization in the SaaS platform.
 * Each organization has its own isolated database containing
 * all PMS data (users, projects, tasks, etc.).
 *
 * @property int    $id
 * @property string $name
 * @property string $slug
 * @property string|null $admin_name
 * @property string|null $admin_email
 * @property string $database_name
 * @property string $database_host
 * @property int    $database_port
 * @property string $database_username
 * @property string|null $database_password
 * @property string $status
 * @property string $timezone
 * @property string $email_policy
 * @property string|null $logo_path
 * @property array|null  $settings
 * @property \Carbon\Carbon|null $trial_ends_at
 * @property \Carbon\Carbon|null $suspended_at
 * @property \Carbon\Carbon|null $deleted_at
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class Organization extends Model
{
    use SoftDeletes;

    protected $connection = 'mysql_master';

    protected $fillable = [
        'name',
        'slug',
        'admin_name',
        'admin_email',
        'type',
        'database_name',
        'database_host',
        'database_port',
        'database_username',
        'database_password',
        'status',
        'timezone',
        'email_policy',
        'admin_email',
        'logo_path',
        'settings',
        'trial_ends_at',
        'suspended_at',
        'storage_auto_delete',
        'storage_overwrite',
        'storage_warn_threshold',
        'storage_critical_threshold',
        'storage_pin_threshold',
        'storage_driver',
        'storage_s3_prefix',
    ];

    protected $hidden = [
        'database_password',
    ];

    protected $casts = [
        'settings'                   => 'array',
        'database_port'              => 'integer',
        'trial_ends_at'              => 'datetime',
        'suspended_at'               => 'datetime',
        'storage_auto_delete'        => 'boolean',
        'storage_overwrite'          => 'boolean',
        'storage_warn_threshold'     => 'integer',
        'storage_critical_threshold' => 'integer',
        'storage_pin_threshold'      => 'integer',
    ];

    /*
    |------------------------------------------------------------------
    | Relationships
    |------------------------------------------------------------------
    */

    /** The primary domain for this organization. */
    public function primaryDomain(): HasOne
    {
        return $this->hasOne(OrganizationDomain::class)->where('is_primary', true);
    }

    /** All domains/subdomains mapped to this organization. */
    public function domains(): HasMany
    {
        return $this->hasMany(OrganizationDomain::class);
    }

    /** The current active subscription. */
    public function subscription(): HasOne
    {
        return $this->hasOne(OrganizationSubscription::class)->latest();
    }

    /** All historical subscriptions. */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(OrganizationSubscription::class);
    }

    /** The plan this organization is subscribed to (via subscription). */
    public function plan()
    {
        return $this->hasOneThrough(
            OrganizationPlan::class,
            OrganizationSubscription::class,
            'organization_id',  // foreign key on subscriptions
            'id',               // local key on plans
            'id',               // local key on organizations
            'plan_id'           // foreign key on subscriptions
        );
    }

    /** Organization-specific trial configuration override (optional). */
    public function trialSetting(): HasOne
    {
        return $this->hasOne(OrganizationTrialSetting::class);
    }

    /** Subscription history records. */
    public function subscriptionHistory(): HasMany
    {
        return $this->hasMany(OrganizationSubscriptionHistory::class)->orderBy('created_at', 'desc');
    }

    /** Storage notifications for this organization. */
    public function storageNotifications(): HasMany
    {
        return $this->hasMany(OrganizationStorageNotification::class);
    }

    /** Active (non-dismissed) storage notifications. */
    public function activeStorageNotifications(): HasMany
    {
        return $this->storageNotifications()->where('is_dismissed', false)->orderBy('created_at', 'desc');
    }

    /** Get storage settings with defaults. */
    public function getStorageSettings(): array
    {
        return [
            'auto_delete'           => $this->storage_auto_delete ?? false,
            'overwrite'             => $this->storage_overwrite ?? true,
            'warn_threshold'        => $this->storage_warn_threshold ?? 80,
            'critical_threshold'    => $this->storage_critical_threshold ?? 90,
            'pin_threshold'         => $this->storage_pin_threshold ?? 95,
            'driver'                => $this->storage_driver ?? 'local',
            's3_prefix'             => $this->storage_s3_prefix ?? "org-{$this->id}",
        ];
    }

    /*
    |------------------------------------------------------------------
    | Helpers
    |------------------------------------------------------------------
    */

    /** Check if the organization is currently active. */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** Check if this is an owner organization (bypasses all limits). */
    public function isOwner(): bool
    {
        return $this->type === 'owner';
    }

    /** Check if the organization is on a trial. */
    public function isOnTrial(): bool
    {
        return $this->status === 'trial'
            && $this->trial_ends_at
            && $this->trial_ends_at->isFuture();
    }

    /** Check if the organization is suspended. */
    public function isSuspended(): bool
    {
        return $this->status === 'suspended';
    }

    /** Check if the organization uses company_required email policy. */
    public function isCompanyEmailRequired(): bool
    {
        return $this->email_policy === 'company_required';
    }

    /** Get the email policy with fallback to standard. */
    public function getEmailPolicy(): string
    {
        return $this->email_policy ?? 'standard';
    }

    /** Get the full database connection config for this organization. */
    public function getDatabaseConfig(): array
    {
        return [
            'driver'    => 'mysql',
            'host'      => $this->database_host,
            'port'      => $this->database_port,
            'database'  => $this->database_name,
            'username'  => $this->database_username,
            'password'  => $this->database_password ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ];
    }
}
