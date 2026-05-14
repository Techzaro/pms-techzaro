<?php

/**
 * Eloquent model that represents a task within a project.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Eloquent model for tasks attached to projects.
 */
class Task extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'description',
        'status',
        'priority',
        'start_date',
        'end_date',
        'assigned_to',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
    ];

    /**
     * Perform the project.
     */

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * Perform the assignee.
     */

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
