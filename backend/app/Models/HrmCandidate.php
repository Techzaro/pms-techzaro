<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmCandidate extends Model
{
    protected $table = 'hrm_candidates';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'email',
        'phone',
        'cnic',
        'job_id',
        'stage',
        'applied_date',
        'source',
        'rating',
        'notes',
        'resume_url',
        'resume_file',
        'ai_score',
        'ai_analysis',
    ];

    public function toFrontendArray()
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone ?? '',
            'cnic' => $this->cnic ?? '',
            'jobId' => $this->job_id,
            'stage' => $this->stage,
            'appliedDate' => $this->applied_date,
            'source' => $this->source,
            'rating' => (int) $this->rating,
            'notes' => $this->notes ?? '',
            'resumeUrl' => $this->resume_url ?? '',
            'resumeFile' => $this->resume_file ?? '',
            'aiScore' => (int) ($this->ai_score ?? 0),
            'aiAnalysis' => $this->ai_analysis ? json_decode($this->ai_analysis, true) : null,
        ];
    }
}
