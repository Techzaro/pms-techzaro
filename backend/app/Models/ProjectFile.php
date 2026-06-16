<?php

/**
 * Eloquent model for file attachments related to projects.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Eloquent model for project file attachments.
 */
class ProjectFile extends Model
{
    protected $fillable = [
        'project_id',
        'name',
        'url',
    ];

    /**
     * Perform the project.
     */

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
