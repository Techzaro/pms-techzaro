<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationStorageNotification extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'organization_storage_notifications';

    protected $fillable = [
        'organization_id',
        'type',
        'severity',
        'title',
        'message',
        'metadata',
        'is_read',
        'is_dismissed',
        'email_sent',
        'read_at',
        'dismissed_at',
    ];

    protected $casts = [
        'metadata'    => 'array',
        'is_read'     => 'boolean',
        'is_dismissed'=> 'boolean',
        'email_sent'  => 'boolean',
        'read_at'     => 'datetime',
        'dismissed_at'=> 'datetime',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function markRead(): void
    {
        $this->update(['is_read' => true, 'read_at' => now()]);
    }

    public function dismiss(): void
    {
        $this->update(['is_dismissed' => true, 'dismissed_at' => now()]);
    }
}
