<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Represents a submission instance for a project.
 * Created when a project is submitted for review, with optional file attachment.
 */
class ProjectSubmission extends Model
{
    protected $fillable = [
        'project_id',
        'submitted_by',
        'comment',
        'file_path',
        'file_name',
    ];

    /** The project this submission belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user who submitted this project. */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /** File attachments for this submission. */
    public function attachments(): HasMany
    {
        return $this->hasMany(SubmissionAttachment::class, 'submission_id')
            ->where('submission_type', 'project');
    }
}
