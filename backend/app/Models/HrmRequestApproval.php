<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HrmRequestApproval extends Model
{
    use HasFactory;

    protected $guarded = [];

    public function request()
    {
        return $this->belongsTo(HrmMemberRequest::class, 'request_id');
    }

    public function approver_user()
    {
        return $this->belongsTo(User::class, 'approver_id');
    }
}
