<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HrmEsignToken extends Model
{
    protected $table = 'hrm_esign_tokens';
    protected $guarded = [];
    protected $hidden = ['token_hash'];
    protected $casts = [
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_used_at' => 'datetime',
        'otp_expires_at' => 'datetime',
        'identity_verified_at' => 'datetime',
    ];

    public function envelope(): BelongsTo
    {
        return $this->belongsTo(HrmEsignEnvelope::class, 'envelope_id');
    }
}
