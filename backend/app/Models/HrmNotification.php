<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmNotification extends Model
{
    protected $table = 'hrm_notifications';

    protected $fillable = [
        'type',
        'candidate_name',
        'title',
        'message',
        'read',
    ];

    protected $casts = [
        'read' => 'boolean',
    ];
}
