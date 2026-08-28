<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrganizationSupportTicket extends Model
{
    protected $connection = 'mysql_master';

    protected $fillable = [
        'organization_id',
        'user_id',
        'ticket_number',
        'subject',
        'message',
        'status',
        'priority',
        'category',
        'source',
        'tenant_feedback_id',
        'feedback_reference_number',
        'feedback_metadata',
        'assigned_to_name',
        'resolved_at',
        'closed_at',
    ];

    protected $casts = [
        'feedback_metadata' => 'array',
        'resolved_at' => 'datetime',
        'closed_at'   => 'datetime',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(OrganizationSupportMessage::class, 'ticket_id');
    }
}
