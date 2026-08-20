<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmJobOpening extends Model
{
    protected $table = 'hrm_job_openings';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'title',
        'department',
        'location',
        'type',
        'status',
        'openings',
        'posted_date',
        'description',
    ];
}
