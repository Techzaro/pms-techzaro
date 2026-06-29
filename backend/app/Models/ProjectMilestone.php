<?php

/**
 * Eloquent model for project milestones and due dates.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Represents a milestone within a project.
 * Defines a checkpoint with a title, due date, and status, ordered by sort_order.
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
        'due_date' => 'date:Y-m-d',
    ];

    /** The project this milestone belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
