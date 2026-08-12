<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Represents a delegation of a task or deliverable from one user to another.
 * Tracks the delegation chain and approval hierarchy.
 */
class TaskDelegation extends Model
{
    protected $fillable = [
        'task_id',
        'deliverable_id',
        'delegated_by',
        'delegated_to',
        'parent_delegation_id',
        'reason',
        'reason_detail',
        'delegation_level',
        'status',
        'accepted_at',
        'rejected_at',
        'revoked_at',
        'notes',
        'return_to_transferor',
    ];

    protected $appends = ['delegated_by_name'];

    protected $casts = [
        'delegation_level' => 'integer',
        'return_to_transferor' => 'boolean',
        'accepted_at' => 'datetime:Y-m-d\TH:i:s',
        'rejected_at' => 'datetime:Y-m-d\TH:i:s',
        'revoked_at' => 'datetime:Y-m-d\TH:i:s',
    ];

    /** The task this delegation belongs to. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /** The deliverable this delegation belongs to (nullable). */
    public function deliverable(): BelongsTo
    {
        return $this->belongsTo(Deliverable::class);
    }

    /** The user who delegated the task. */
    public function delegatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegated_by');
    }

    /** The user the task was delegated to. */
    public function delegatedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegated_to');
    }

    /** Parent delegation if this is a chained delegation. */
    public function parentDelegation(): BelongsTo
    {
        return $this->belongsTo(TaskDelegation::class, 'parent_delegation_id');
    }

    /** Child delegations from this delegation. */
    public function childDelegations(): HasMany
    {
        return $this->hasMany(TaskDelegation::class, 'parent_delegation_id');
    }

    public function getDelegatedByNameAttribute(): ?string
    {
        return $this->delegatedBy?->name;
    }
}
