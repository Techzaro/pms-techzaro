<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KbVersion extends Model
{
    use HasFactory;

    protected $table = 'kb_versions';

    protected $fillable = [
        'knowledge_base_id',
        'version_number',
        'title',
        'content',
        'file_path',
        'file_name',
        'attachments',
        'reference_link',
        'reference_links',
        'change_summary',
        'created_by',
    ];

    protected $casts = [
        'version_number' => 'integer',
        'attachments' => 'array',
        'reference_links' => 'array',
    ];

    public function knowledgeBase(): BelongsTo
    {
        return $this->belongsTo(KnowledgeBase::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
