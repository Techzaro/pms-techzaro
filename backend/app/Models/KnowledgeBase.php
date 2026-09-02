<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        'reference_link',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
        'views_count' => 'integer',
        'tags' => 'array',
    ];

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
}
