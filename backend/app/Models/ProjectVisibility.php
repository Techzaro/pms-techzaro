<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Controls per-user visibility for a project.
 * Allows explicit granting or revoking of project access for individual users.
 */
class ProjectVisibility extends Model
{
    protected $table = 'project_visibility';

    protected $fillable = [
        'project_id',
        'user_id',
        'is_visible',
    ];

    protected $casts = [
        'is_visible' => 'boolean',
    ];

    /** The project this visibility rule applies to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user whose visibility is being controlled. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
