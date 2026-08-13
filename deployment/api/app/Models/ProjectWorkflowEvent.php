<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks workflow events for a project (e.g., created, assigned, field_changed, status_updated, completed).
 * Stores event details including comments, instructions, and optional file attachments.
 */
class ProjectWorkflowEvent extends Model
{
    protected $fillable = [
        'project_id',
        'user_id',
        'action',
        'comment',
        'instructions',
        'new_deadline',
        'file_path',
        'file_name',
    ];

    protected $casts = [
        'new_deadline' => 'date',
    ];

    /** The project this event belongs to. */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The user who triggered this workflow event. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
