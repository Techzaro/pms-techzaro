<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KbFavorite extends Model
{
    use HasFactory;

    protected $table = 'kb_favorites';

    protected $fillable = [
        'knowledge_base_id',
        'user_id',
    ];

    public function knowledgeBase(): BelongsTo
    {
        return $this->belongsTo(KnowledgeBase::class, 'knowledge_base_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
