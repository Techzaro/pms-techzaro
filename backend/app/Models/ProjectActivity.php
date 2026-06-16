<?php

/**
 * Eloquent model for audit or activity logs belonging to a project.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Eloquent model for project activity logs.
 */
class ProjectActivity extends Model
{
    protected $fillable = [
        'project_id',
        'user_id',
        'summary',
    ];

    /**
     * Perform the project.
     */

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * Perform the user.
     */

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
