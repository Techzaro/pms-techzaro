<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Represents a submission instance for a deliverable.
 * Created when a deliverable is submitted for review, with optional file attachment.
 */
class DeliverableSubmission extends Model
{
    protected $fillable = [
        'deliverable_id',
        'submitted_by',
        'comment',
        'file_path',
        'file_name',
    ];

    /** The deliverable this submission belongs to. */
    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    /** The user who submitted this deliverable. */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /** File attachments for this submission. */
    public function attachments(): HasMany
    {
        return $this->hasMany(SubmissionAttachment::class, 'submission_id')
            ->where('submission_type', 'deliverable');
    }
}
