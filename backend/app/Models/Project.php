<?php

/**
 * Eloquent model representing a project with tasks, milestones, files, and activities.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * Core project model that ties together all project-related entities.
 * Manages metadata, assigned users, workflow states, and relationships to tasks, milestones, and deliverables.
 */
class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
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
        'user_due_dates',
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
        'sort_order',
    ];

    protected $casts = [
        'assigned_users' => 'array',
        'user_due_dates' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'budget' => 'decimal:2',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
    ];

    /** All tasks belonging to this project. */
    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    /** The user who created this project. */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The team assigned to this project. */
    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    /** Milestones for this project, ordered by sort order. */
    public function milestones()
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('sort_order')->latest('updated_at');
    }

    /** File attachments for this project. */
    public function files()
    {
        return $this->hasMany(ProjectFile::class)->orderBy('sort_order');
    }

    /** Deliverables belonging to this project. */
    public function deliverables()
    {
        return $this->hasMany(Deliverable::class)->latest();
    }

    /** All visibility rules for this project. */
    public function visibility()
    {
        return $this->hasMany(ProjectVisibility::class);
    }

    /** Access credentials for this project. */
    public function accessCredentials()
    {
        return $this->hasMany(ProjectAccessCredential::class);
    }

    /** Users who are explicitly marked as visible for this project. */
    public function manuallyVisibleTo()
    {
        return $this->hasMany(ProjectVisibility::class)->where('is_visible', true);
    }

    /** All submission instances for this project. */
    public function submissions()
    {
        return $this->hasMany(ProjectSubmission::class);
    }

    /** The most recent submission for this project. */
    public function latestSubmission()
    {
        return $this->hasOne(ProjectSubmission::class)->latestOfMany();
    }

    /** Workflow events tracking state changes (submit, approve, reject, reopen). */
    public function workflowEvents()
    {
        return $this->hasMany(ProjectWorkflowEvent::class)->latest();
    }

    /** The user who approved this project. */
    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who rejected this project. */
    public function rejectedBy()
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /** The user who reopened this project for rework. */
    public function reopenedBy()
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** Activities related to this project (via related_module/related_id). */
    public function activities()
    {
        return $this->hasMany(Activity::class, 'related_id')
            ->where('related_module', 'Project');
    }

    /** Field-level changes made to this project. */
    public function changes()
    {
        return $this->hasMany(ProjectChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(ProjectChange::class)->where('is_viewed', false);
    }

    /** Per-user submissions for this project. */
    public function userSubmissions()
    {
        return $this->hasMany(ProjectUserSubmission::class)->latest();
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

    /**
     * Get the active deadline for this project.
     * Returns the nearest upcoming milestone due_date.
     * Falls back to end_date if no milestones exist.
     */
    public function getActiveDeadlineAttribute()
    {
        $now = now();

        // Find the nearest upcoming milestone (not completed, due_date >= now)
        $upcoming = $this->milestones()
            ->where('due_date', '>=', $now)
            ->where('status', '!=', 'completed')
            ->orderBy('due_date', 'asc')
            ->first();

        if ($upcoming) {
            return $upcoming->due_date;
        }

        // All milestones completed/passed - use the last milestone's due_date
        $lastMilestone = $this->milestones()
            ->orderBy('sort_order', 'desc')
            ->first();

        if ($lastMilestone && $lastMilestone->due_date) {
            return $lastMilestone->due_date;
        }

        // Fallback to end_date if no milestones at all
        return $this->end_date;
    }
}
