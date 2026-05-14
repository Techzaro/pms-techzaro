<?php

/**
 * Eloquent model for project milestones and due dates.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Eloquent model for a single project milestone.
 */
class ProjectMilestone extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'due_date',
        'status',
        'sort_order',
    ];

    protected $casts = [
        'due_date' => 'date',
    ];

    /**
     * Perform the project.
     */

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
