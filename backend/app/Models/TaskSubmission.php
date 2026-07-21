<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Represents a submission instance for a task.
 * Created when a task is submitted for review, with optional file attachment.
 */
class TaskSubmission extends Model
{
    protected $fillable = [
        'task_id',
        'submitted_by',
        'comment',
        'file_path',
        'file_name',
        'version_number',
        'status',
        'approved_by',
        'approved_at',
        'reopened_by',
        'reopened_at',
        'reopen_reason',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'reopened_at' => 'datetime',
        'version_number' => 'integer',
    ];

    /** The task this submission belongs to. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** The user who submitted this task. */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /** File attachments for this submission. */
    public function attachments(): HasMany
    {
        return $this->hasMany(SubmissionAttachment::class, 'submission_id')
            ->where('submission_type', 'task');
    }

    /** The user who approved this submission. */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** The user who reopened this submission. */
    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }
}
