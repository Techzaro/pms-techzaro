<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmInterviewScorecard extends Model
{
    protected $table = 'hrm_interview_scorecards';

    protected $fillable = [
        'candidate_id',
        'interviewer_name',
        'technical_score',
        'communication_score',
        'problem_solving_score',
        'cultural_fit_score',
        'overall_rating',
        'recommendation',
        'comments',
    ];

    protected $casts = [
        'technical_score' => 'integer',
        'communication_score' => 'integer',
        'problem_solving_score' => 'integer',
        'cultural_fit_score' => 'integer',
        'overall_rating' => 'float',
    ];
}
