<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class TaskComment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'task_id',
        'deliverable_id',
        'user_id',
        'parent_id',
        'body',
        'file_path',
        'file_name',
        'file_size',
        'is_edited',
        'edited_at',
        'delegation_id',
        'comment_type',
        'visible_to_organizations',
    ];

    protected $casts = [
        'is_edited' => 'boolean',
        'edited_at' => 'datetime',
        'visible_to_organizations' => 'array',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(TaskComment::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(TaskComment::class, 'parent_id')->oldest();
    }

    /**
     * Check if this comment is visible to an external organization.
     */
    public function isVisibleToOrganization(int $organizationId): bool
    {
        // Internal comments are never visible to external orgs
        if ($this->comment_type === 'internal') {
            return false;
        }

        // External comments are visible if no restriction or org is in the list
        if (empty($this->visible_to_organizations)) {
            return true;
        }

        return in_array($organizationId, $this->visible_to_organizations);
    }

    /**
     * Check if this comment is internal.
     */
    public function isInternal(): bool
    {
        return $this->comment_type === 'internal';
    }

    /**
     * Check if this comment is external.
     */
    public function isExternal(): bool
    {
        return $this->comment_type === 'external';
    }
}
