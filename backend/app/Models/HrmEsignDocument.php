<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmEsignDocument extends Model
{
    protected $table = 'hrm_esign_documents';
    protected $guarded = [];
    protected $casts = [
        'acknowledged_at' => 'datetime',
        'signed_at' => 'datetime',
    ];

    public function envelope()
    {
        return $this->belongsTo(HrmEsignEnvelope::class, 'envelope_id');
    }
}
