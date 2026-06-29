<?php

/**
 * Eloquent model for file attachments related to projects.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Represents a file attachment associated with a project.
 * Stores file metadata (name and URL) and links back to the parent project.
 */
class ProjectFile extends Model
{
    protected $fillable = [
        'project_id',
        'name',
        'url',
    ];

    /** The project this file belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
