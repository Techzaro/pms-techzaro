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
 *
 * Future-ready fields: description, owner_id, completed_at, progress.
 */
class ProjectMilestone extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'description',
        'due_date',
        'status',
        'sort_order',
        'owner_id',
        'completed_at',
        'progress',
        'assigned_to',
    ];

    protected $casts = [
        'due_date' => 'date:Y-m-d',
        'completed_at' => 'datetime:Y-m-d\TH:i:s',
    ];

    /** The project this milestone belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user assigned as owner of this milestone. */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /** The user assigned to work on this milestone. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
