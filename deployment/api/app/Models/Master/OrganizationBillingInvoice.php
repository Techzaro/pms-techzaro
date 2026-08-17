<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationBillingInvoice extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'subscription_id',
        'plan_id',
        'invoice_number',
        'status',
        'amount',
        'tax_amount',
        'total_amount',
        'currency',
        'billing_period',
        'billing_period_start',
        'billing_period_end',
        'payment_method',
        'description',
        'notes',
        'renewal_reference',
        'paid_at',
        'due_at',
        'approved_at',
        'approved_by',
        'rejection_reason',
        'metadata',
    ];

    protected $casts = [
        'amount'               => 'float',
        'tax_amount'           => 'float',
        'total_amount'         => 'float',
        'paid_at'              => 'datetime',
        'due_at'               => 'datetime',
        'approved_at'          => 'datetime',
        'billing_period_start' => 'datetime',
        'billing_period_end'   => 'datetime',
        'metadata'             => 'array',
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

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(OrganizationSubscription::class, 'subscription_id');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(OrganizationPlan::class, 'plan_id');
    }

    /*
    |------------------------------------------------------------------
    | Status Helpers
    |------------------------------------------------------------------
    */

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isPaid(): bool
    {
        return $this->status === 'paid';
    }

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    public function isRejected(): bool
    {
        return $this->status === 'rejected';
    }

    public function isCancelled(): bool
    {
        return $this->status === 'cancelled';
    }

    /*
    |------------------------------------------------------------------
    | Scopes
    |------------------------------------------------------------------
    */

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopePaidOrApproved($query)
    {
        return $query->whereIn('status', ['paid', 'approved']);
    }
}
