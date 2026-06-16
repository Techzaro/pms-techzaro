<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
