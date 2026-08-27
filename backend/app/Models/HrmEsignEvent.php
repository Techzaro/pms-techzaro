<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HrmEsignEvent extends Model
{
    protected $table = 'hrm_esign_events';
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['metadata' => 'array', 'created_at' => 'datetime'];

    public function envelope(): BelongsTo
    {
        return $this->belongsTo(HrmEsignEnvelope::class, 'envelope_id');
    }
}
