<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmEmployeeDocument extends Model
{
    protected $table = 'hrm_employee_documents';

    protected $fillable = [
        'user_id',
        'user_name',
        'user_email',
        'department',
        'title',
        'category',
        'file_url',
        'file_name',
        'status',
        'expiry_date',
    ];
}
