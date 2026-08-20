<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HrmWorkflowStep extends Model
{
    use HasFactory;

    protected $fillable = [
        'hrm_workflow_id',
        'step_order',
        'approver_type',
        'approver_id',
    ];

    public function workflow()
    {
        return $this->belongsTo(HrmWorkflow::class, 'hrm_workflow_id');
    }
}
