<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrmEsignEnvelope extends Model
{
    use HasUuids;

    protected $table = 'hrm_esign_envelopes';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = [
        'start_date' => 'date',
        'expires_at' => 'date',
        'sent_at' => 'datetime',
        'viewed_at' => 'datetime',
        'completed_at' => 'datetime',
        'voided_at' => 'datetime',
        'base_salary' => 'decimal:2',
    ];

    public function documents()
    {
        return $this->hasMany(HrmEsignDocument::class, 'envelope_id');
    }

    public function events()
    {
        return $this->hasMany(HrmEsignEvent::class, 'envelope_id');
    }
}
