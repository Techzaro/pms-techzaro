<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KnowledgeBase extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'slug',
        'content',
        'category',
        'category_id',
        'visibility_level',
        'status',
        'is_pinned',
        'views_count',
        'tags',
        'project_id',
        'department',
        'organization',
        'file_path',
        'file_name',
        'attachments',
        'reference_link',
        'reference_links',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
        'views_count' => 'integer',
        'tags' => 'array',
        'attachments' => 'array',
        'reference_links' => 'array',
    ];

    protected $appends = [
        'attachments_list',
        'reference_links_list',
    ];

    public function getAttachmentsListAttribute(): array
    {
        if (!empty($this->attachments) && is_array($this->attachments)) {
            return $this->attachments;
        }
        if (!empty($this->file_path)) {
            return [
                [
                    'file_path' => $this->file_path,
                    'file_name' => $this->file_name ?: basename($this->file_path),
                ]
            ];
        }
        return [];
    }

    public function getReferenceLinksListAttribute(): array
    {
        if (!empty($this->reference_links) && is_array($this->reference_links)) {
            return $this->reference_links;
        }
        if (!empty($this->reference_link)) {
            $decoded = json_decode($this->reference_link, true);
            if (is_array($decoded)) {
                return $decoded;
            }
            return [$this->reference_link];
        }
        return [];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class, 'project_id');
    }

    public function categoryRelation(): BelongsTo
    {
        return $this->belongsTo(KbCategory::class, 'category_id');
    }

    public function visibilities(): HasMany
    {
        return $this->hasMany(KbVisibility::class, 'knowledge_base_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(KbVersion::class, 'knowledge_base_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(KbFavorite::class, 'knowledge_base_id');
    }

    public function tasks(): BelongsToMany
    {
        return $this->belongsToMany(Task::class, 'knowledge_base_task')->withTimestamps();
    }
}
