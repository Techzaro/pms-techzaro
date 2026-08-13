<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FeedbackActivityLog extends Model
{
    use HasFactory;

    protected $table = 'feedback_activity_logs';

    protected $fillable = [
        'feedback_id',
        'user_id',
        'action',
        'details',
    ];

    public function feedback()
    {
        return $this->belongsTo(Feedback::class, 'feedback_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
