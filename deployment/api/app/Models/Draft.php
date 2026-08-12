<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Casts\Attribute;

class Draft extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'draft_code',
        'module_type',
        'original_record_id',
        'draft_data',
        'title',
        'created_by',
        'last_edited_by',
        'status',
        'is_important',
        'last_auto_saved_at',
        'version',
        'project_id',
        'parent_id',
        'is_returned',
        'returned_from_user_id',
        'returned_at',
        'return_reason',
    ];

    protected $casts = [
        'draft_data' => 'array',
        'is_important' => 'boolean',
        'last_auto_saved_at' => 'datetime',
        'version' => 'integer',
        'is_returned' => 'boolean',
        'returned_at' => 'datetime',
    ];

    public const MODULE_TYPES = [
        'project' => 'Project',
        'task' => 'Task',
        'deliverable' => 'Subtask',
        'event' => 'Calendar Event',
        'user' => 'User',
        'team' => 'Team',
    ];

    public const STATUSES = [
        'draft' => 'Draft',
        'auto_saved' => 'Auto Saved',
        'ready_to_publish' => 'Ready to Publish',
        'published' => 'Published',
        'archived' => 'Archived',
    ];

    protected static function booted(): void
    {
        static::creating(function (Draft $draft) {
            if (empty($draft->draft_code)) {
                $draft->draft_code = app(\App\Services\BusinessIdService::class)->generateDraftCode();
            }
            if (empty($draft->last_edited_by)) {
                $draft->last_edited_by = $draft->created_by;
            }
        });
    }

    // ── Relationships ──

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function lastEditor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_edited_by');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function parentTask(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    public function returnedFromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'returned_from_user_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(DraftVersion::class)->orderBy('version', 'desc');
    }

    // ── Scopes ──

    public function scopeByModule($query, string $moduleType)
    {
        return $query->where('module_type', $moduleType);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByCreator($query, int $userId)
    {
        return $query->where('created_by', $userId);
    }

    public function scopeByProject($query, int $projectId)
    {
        return $query->where('project_id', $projectId);
    }

    public function scopeSearch($query, ?string $search)
    {
        if (empty($search)) {
            return $query;
        }

        return $query->where(function ($q) use ($search) {
            $q->where('title', 'like', "%{$search}%")
              ->orWhere('draft_code', 'like', "%{$search}%");
        });
    }

    // ── Accessors ──

    protected function moduleLabel(): Attribute
    {
        return Attribute::make(
            get: fn () => self::MODULE_TYPES[$this->module_type] ?? $this->module_type,
        );
    }

    protected function statusLabel(): Attribute
    {
        return Attribute::make(
            get: fn () => self::STATUSES[$this->status] ?? $this->status,
        );
    }
}
