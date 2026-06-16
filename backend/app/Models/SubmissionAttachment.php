<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubmissionAttachment extends Model
{
    protected $fillable = [
        'submission_id',
        'submission_type',
        'file_name',
        'original_name',
        'file_path',
        'file_type',
        'file_size',
        'attachment_type',
        'url',
    ];

    protected $appends = ['full_url'];

    public function getFullUrlAttribute(): ?string
    {
        if ($this->attachment_type === 'link') {
            return $this->url;
        }
        if ($this->file_path) {
            return '/storage/' . ltrim($this->file_path, '/');
        }
        return null;
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(TaskSubmission::class, 'submission_id')
            ->orWhere(fn ($q) => $q->where('submission_type', 'project'))
            ->orWhere(fn ($q) => $q->where('submission_type', 'deliverable'));
    }
}
