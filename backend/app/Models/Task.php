<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

/**
 * Represents a task within a project.
 * Tracks individual work items through their lifecycle (draft, submitted, approved, rejected, reopened).
 */
class Task extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'description',
        'requirements',
        'status',
        'priority',
        'start_date',
        'end_date',
        'assigned_to',
        'assigned_by',
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
        'task_type',
        'recurrence_settings',
        'recurrence_status',
        'deliverables_generated',
    ];

    protected $casts = [
        'requirements' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'recurrence_settings' => 'array',
        'deliverables_generated' => 'integer',
    ];

    /** Apply filters for querying tasks. */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (!empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }
        if (!empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }
        if (!empty($filters['project_id'])) {
            $query->where('project_id', $filters['project_id']);
        }
        if (!empty($filters['search'])) {
            $query->where('title', 'like', '%' . $filters['search'] . '%');
        }
        if (!empty($filters['start_date_from'])) {
            $query->where('start_date', '>=', $filters['start_date_from']);
        }
        if (!empty($filters['start_date_to'])) {
            $query->where('start_date', '<=', $filters['start_date_to']);
        }
        return $query;
    }

    /** The project this task belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user assigned to complete this task. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** The user who assigned this task. */
    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    /** All users assigned to this task (many-to-many). */
    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_user')->withPivot('due_date', 'status', 'submitted_at')->withTimestamps();
    }

    /** Deliverables belonging to this task, ordered by sort order. */
    public function deliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class)->orderBy('sort_order')->latest('updated_at');
    }

    /** Deliverable templates for recurring task generation. */
    public function deliverableTemplates(): HasMany
    {
        return $this->hasMany(DeliverableTemplate::class)->orderBy('sort_order');
    }

    /** File attachments for this task. */
    public function files()
    {
        return $this->hasMany(\App\Models\TaskFile::class)->latest();
    }

    /** All submissions for this task. */
    public function submissions()
    {
        return $this->hasMany(TaskSubmission::class);
    }

    /** The most recent submission for this task. */
    public function latestSubmission()
    {
        return $this->hasOne(TaskSubmission::class)->latestOfMany();
    }

    /** Workflow events tracking state changes for this task. */
    public function workflowEvents()
    {
        return $this->hasMany(TaskWorkflowEvent::class)->latest();
    }

    /** The user who approved this task. */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who rejected this task. */
    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /** The user who reopened this task for rework. */
    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** Field-level changes made to this task. */
    public function changes()
    {
        return $this->hasMany(TaskChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(TaskChange::class)->where('is_viewed', false);
    }

    /** Access credentials attached to this task. */
    public function accessCredentials()
    {
        return $this->hasMany(TaskAccessCredential::class);
    }
}
