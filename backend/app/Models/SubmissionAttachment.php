<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Represents a file or link attachment for a submission.
 * Supports both uploaded files and external URLs, scoped by submission_type (task, deliverable).
 */
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

    /**
     * Get the full URL for this attachment.
     * Returns the external URL for link types, or the storage path for uploaded files.
     */
    public function getFullUrlAttribute(): ?string
    {
        if ($this->attachment_type === 'link') {
            return $this->url;
        }
        if ($this->url) {
            return $this->url;
        }
        if ($this->file_path) {
            return '/storage/' . ltrim($this->file_path, '/');
        }
        return null;
    }
}
