<?php

/**
 * Eloquent model representing a project with tasks, milestones, files, and activities.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * Eloquent model for projects.
 * Includes metadata, assigned users, and relationships to tasks and milestones.
 */
class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'goals',
        'goals_checklist',
        'sheets_documents',
        'website_name',
        'website_link',
        'client_name',
        'category',
        'budget',
        'priority',
        'sidebar_notes',
        'team_id',
        'assigned_users',
        'status',
        'start_date',
        'end_date',
        'created_by',
    ];

    protected $casts = [
        'assigned_users' => 'array',
        'goals_checklist' => 'array',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'budget' => 'decimal:2',
    ];

    /**
     * Project creator relationship.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Team assigned to the project.
     */
    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * Perform the tasks.
     */

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    /**
     * Project milestone relationship, ordered by sort order.
     */
    public function milestones()
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * Project activity log relationship.
     */
    public function activities()
    {
        return $this->hasMany(ProjectActivity::class)->latest();
    }

    /**
     * Perform the files.
     */

    public function files()
    {
        return $this->hasMany(ProjectFile::class)->latest();
    }

    /**
     * Deliverables belonging to this project.
     */
    public function deliverables()
    {
        return $this->hasMany(Deliverable::class)->latest();
    }
}
