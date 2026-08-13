<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationStorageUsage extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'organization_storage_usage';

    protected $fillable = [
        'organization_id',
        'category',
        'file_path',
        'file_name',
        'mime_type',
        'file_size_bytes',
        'uploaded_by_name',
        'uploaded_by_id',
    ];

    protected $casts = [
        'file_size_bytes' => 'integer',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function getFileSizeKbAttribute(): float
    {
        return round($this->file_size_bytes / 1024, 2);
    }

    public function getFileSizeMbAttribute(): float
    {
        return round($this->file_size_bytes / (1024 * 1024), 2);
    }

    public function getFileSizeGbAttribute(): float
    {
        return round($this->file_size_bytes / (1024 * 1024 * 1024), 4);
    }
}
