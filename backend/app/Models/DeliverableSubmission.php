<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliverableSubmission extends Model
{
    protected $fillable = [
        'deliverable_id',
        'submitted_by',
        'comment',
        'file_path',
        'file_name',
    ];

    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SubmissionAttachment::class, 'submission_id')
            ->where('submission_type', 'deliverable');
    }
}
