<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HrmWorkflow extends Model
{
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'department',
        'submitter_role',
        'application_types',
    ];

    protected $casts = [
        'application_types' => 'array',
        'submitter_role' => 'array',
    ];

    public function steps()
    {
        return $this->hasMany(HrmWorkflowStep::class, 'hrm_workflow_id')->orderBy('step_order');
    }

}
