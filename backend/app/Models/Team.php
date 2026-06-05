<?php

/**
 * Eloquent model for teams, their members, and team leaders.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * Eloquent model for project teams.
 * Manages members and optional team leader.
 */
class Team extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'leader_id',
        'created_by'
    ];

    /**
     * Perform the projects.
     */

    public function projects()
    {
        return $this->hasMany(Project::class);
    }

    /**
     * Perform the leader.
     */

    public function leader()
    {
        return $this->belongsTo(User::class, 'leader_id');
    }

    /**
     * Perform the members.
     */

    public function members()
    {
        return $this->belongsToMany(User::class, 'team_user')
            ->where('users.active', true);
    }
}
