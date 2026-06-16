<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectSubmission extends Model
{
    protected $fillable = [
        'project_id',
        'submitted_by',
        'comment',
        'file_path',
        'file_name',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SubmissionAttachment::class, 'submission_id')
            ->where('submission_type', 'project');
    }
}
