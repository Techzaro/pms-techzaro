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
        'change_summary',
        'created_by',
    ];

    protected $casts = [
        'version_number' => 'integer',
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
