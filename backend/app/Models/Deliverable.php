<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

/**
 * Represents a deliverable within a project or task.
 * Tracks individual work items through their lifecycle (draft, submitted, approved, rejected, reopened).
 */
class Deliverable extends Model
{
    protected $fillable = [
        'project_id',
        'task_id',
        'title',
        'description',
        'status',
        'priority',
        'due_date',
        'assigned_to',
        'created_by',
        'updated_by',
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
        'rework_comment',
        'rework_instructions',
        'rework_new_deadline',
        'rework_file_path',
        'rework_file_name',
        'sort_order',
    ];

    protected $casts = [
        'due_date' => 'datetime:Y-m-d\TH:i:s',
        'submitted_at' => 'datetime:Y-m-d\TH:i:s',
        'approved_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'reopened_at' => 'datetime:Y-m-d\TH:i:s',
        'reopen_new_deadline' => 'datetime:Y-m-d\TH:i:s',
        'rework_new_deadline' => 'datetime:Y-m-d\TH:i:s',
    ];

    /** Apply filters for querying deliverables. */
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

        return $query;
    }

    /** The project this deliverable belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user assigned to complete this deliverable. */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** The user who created this deliverable. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The user who last updated this deliverable. */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** The parent task this deliverable belongs to (optional). */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** All submissions for this deliverable. */
    public function submissions(): HasMany
    {
        return $this->hasMany(DeliverableSubmission::class);
    }

    /** The most recent submission for this deliverable. */
    public function latestSubmission()
    {
        return $this->hasOne(DeliverableSubmission::class)->latestOfMany();
    }

    /** The user who approved this deliverable. */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who rejected this deliverable. */
    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /** The user who reopened this deliverable for rework. */
    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** Workflow events tracking state changes for this deliverable. */
    public function workflowEvents(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(DeliverableWorkflowEvent::class)->latest();
    }

    /** Field-level changes made to this deliverable. */
    public function changes()
    {
        return $this->hasMany(DeliverableChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(DeliverableChange::class)->where('is_viewed', false);
    }
}
