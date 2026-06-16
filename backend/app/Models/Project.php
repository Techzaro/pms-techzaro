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
        'submitted_at',
        'approved_at',
        'rejected_at',
        'rejection_comment',
        'approved_by',
        'rejected_by',
        'reopened_at',
        'reopened_by',
        'reopen_comment',
        'reopen_instructions',
        'reopen_new_deadline',
        'reopen_file_path',
        'reopen_file_name',
    ];

    protected $casts = [
        'assigned_users' => 'array',
        'goals_checklist' => 'array',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'budget' => 'decimal:2',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'reopened_at' => 'datetime',
        'reopen_new_deadline' => 'datetime',
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

    public function visibility()
    {
        return $this->hasMany(ProjectVisibility::class);
    }

    public function manuallyVisibleTo()
    {
        return $this->hasMany(ProjectVisibility::class)->where('is_visible', true);
    }

    /**
     * Project submissions (workflow).
     */
    public function submissions()
    {
        return $this->hasMany(ProjectSubmission::class);
    }

    /**
     * Latest submission for the project.
     */
    public function latestSubmission()
    {
        return $this->hasOne(ProjectSubmission::class)->latestOfMany();
    }

    /**
     * Workflow events (submit, approve, reject, reopen).
     */
    public function workflowEvents()
    {
        return $this->hasMany(ProjectWorkflowEvent::class)->latest();
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejectedBy()
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function reopenedBy()
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /**
     * Resolve assigned_users JSON array to User models.
     */
    public function getAssignedUsersResolvedAttribute()
    {
        $ids = $this->assigned_users ?? [];
        if (empty($ids)) {
            return [];
        }
        return User::whereIn('id', $ids)->select('id', 'name', 'role')->get();
    }
}
