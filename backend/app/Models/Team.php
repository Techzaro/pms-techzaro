<?php

/**
 * Eloquent model for teams, their members, and team leaders.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * Represents a team of users within the system.
 * Teams can own projects and have an optional designated leader.
 */
class Team extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'leader_id',
        'created_by',
        'status',
        'is_draft',
        'working_hours',
    ];

    protected $casts = [
        'is_draft'      => 'boolean',
        'working_hours' => 'array',
    ];

    /** Projects owned by this team. */
    public function projects()
    {
        return $this->hasMany(Project::class);
    }

    /** The user designated as team leader. */
    public function leader()
    {
        return $this->belongsTo(User::class, 'leader_id');
    }

    /** Active members of this team. */
    public function members()
    {
        return $this->belongsToMany(User::class, 'team_user')
            ->where('users.active', true);
    }
}
