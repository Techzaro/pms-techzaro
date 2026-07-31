<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmOnboarding extends Model
{
    protected $table = 'hrm_onboardings';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'candidate_id',
        'name',
        'role',
        'start_date',
        'buddy',
        'status',
        'tasks',
    ];

    protected $casts = [
        'tasks' => 'array',
    ];

    public function toFrontendArray()
    {
        return [
            'id' => $this->id,
            'candidateId' => $this->candidate_id,
            'name' => $this->name,
            'role' => $this->role,
            'startDate' => $this->start_date,
            'buddy' => $this->buddy ?? '',
            'status' => $this->status,
            'tasks' => $this->tasks ?? [],
        ];
    }
}
