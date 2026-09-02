<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;

/**
 * OrganizationSharingSetting model (Master Database).
 *
 * Stores sharing configuration per organization.
 */
class OrganizationSharingSetting extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'sharing_enabled',
        'auto_approve_connections',
        'max_connections',
        'allowed_resource_types',
        'default_permissions',
        'require_approval_for_sharing',
        'default_access_duration_days',
    ];

    protected $casts = [
        'sharing_enabled'              => 'boolean',
        'auto_approve_connections'     => 'boolean',
        'max_connections'              => 'integer',
        'allowed_resource_types'       => 'array',
        'default_permissions'          => 'array',
        'require_approval_for_sharing' => 'boolean',
        'default_access_duration_days' => 'integer',
    ];

    /**
     * Get or create sharing settings for an organization.
     */
    public static function getForOrganization(int $organizationId): self
    {
        return static::firstOrCreate(
            ['organization_id' => $organizationId],
            [
                'sharing_enabled'          => true,
                'auto_approve_connections' => false,
                'max_connections'          => 50,
                'allowed_resource_types'   => ['project', 'task', 'document', 'event', 'knowledge_base'],
                'default_permissions'      => ['view'],
                'require_approval_for_sharing' => true,
            ]
        );
    }
}
