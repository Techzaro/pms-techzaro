<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DraftVersion extends Model
{
    use HasFactory;

    protected $fillable = [
        'draft_id',
        'version',
        'draft_data',
        'edited_by',
        'edited_at',
    ];

    protected $casts = [
        'draft_data' => 'array',
        'edited_at' => 'datetime',
        'version' => 'integer',
    ];

    public function draft(): BelongsTo
    {
        return $this->belongsTo(Draft::class);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'edited_by');
    }
}
