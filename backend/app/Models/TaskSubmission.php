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
}
