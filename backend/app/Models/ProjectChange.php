<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Records field-level changes made to a project.
 * Stores old and new values for auditing and change tracking.
 */
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

    /** The project this change belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user who made this change. */
    public function modifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'modified_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'modified_by');
    }
}
