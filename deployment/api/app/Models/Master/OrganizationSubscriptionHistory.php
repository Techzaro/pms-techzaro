<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationSubscriptionHistory extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'organization_subscription_history';

    protected $fillable = [
        'organization_id',
        'plan_id',
        'previous_plan_id',
        'event_type',
        'status',
        'billing_period',
        'amount',
        'started_at',
        'ended_at',
        'changed_by',
        'metadata',
    ];

    protected $casts = [
        'amount'     => 'float',
        'started_at' => 'datetime',
        'ended_at'   => 'datetime',
        'metadata'   => 'array',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(OrganizationPlan::class, 'plan_id');
    }

    public function previousPlan(): BelongsTo
    {
        return $this->belongsTo(OrganizationPlan::class, 'previous_plan_id');
    }
}
