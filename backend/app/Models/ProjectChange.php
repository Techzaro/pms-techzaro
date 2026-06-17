<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectChange extends Model
{
    protected $fillable = [
        'project_id',
        'field_name',
        'old_value',
        'new_value',
        'modified_by',
        'is_viewed',
    ];

    protected $casts = [
        'is_viewed' => 'boolean',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function modifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'modified_by');
    }
}
