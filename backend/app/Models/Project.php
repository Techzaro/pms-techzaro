<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'goals',
        'goals_checklist',
        'sheets_documents',
        'website_name',
        'website_link',
        'client_name',
        'category',
        'budget',
        'priority',
        'sidebar_notes',
        'team_id',
        'assigned_users',
        'status',
        'start_date',
        'end_date',
        'created_by',
    ];

    protected $casts = [
        'assigned_users' => 'array',
        'goals_checklist' => 'array',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'budget' => 'decimal:2',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function milestones()
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('sort_order')->orderBy('id');
    }

    public function activities()
    {
        return $this->hasMany(ProjectActivity::class)->latest();
    }

    public function files()
    {
        return $this->hasMany(ProjectFile::class)->latest();
    }
}
