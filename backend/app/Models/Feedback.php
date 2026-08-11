<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Feedback extends Model
{
    use HasFactory;

    protected $table = 'feedback';

    protected $fillable = [
        'reference_number',
        'feedback_type',
        'subject',
        'description',
        'priority',
        'rating',
        'status',
        'assigned_to',
        'screenshot_path',
        'recording_path',
        'attachment_path',
        'organization_id',
        'organization_name',
        'user_id',
        'user_name',
        'user_role',
        'module',
        'current_page',
        'submitted_at',
        'browser',
        'operating_system',
        'device_type',
        'ip_address',
        'app_version',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
    ];

    /**
     * The user who submitted the feedback.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * The admin/team member assigned to this feedback.
     */
    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Activity log entries for this feedback.
     */
    public function activityLogs()
    {
        return $this->hasMany(FeedbackActivityLog::class, 'feedback_id')->orderBy('created_at', 'asc');
    }

    /**
     * Internal notes added by admins for this feedback.
     */
    public function notes()
    {
        return $this->hasMany(FeedbackNote::class, 'feedback_id')->orderBy('created_at', 'desc');
    }
}
