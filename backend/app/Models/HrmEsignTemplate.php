<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmEsignTemplate extends Model
{
    protected $table = 'hrm_esign_templates';

    protected $fillable = [
        'title',
        'type',
        'required_action',
        'content',
        'is_active',
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];
}
