<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'active',
        'must_change_password',
        'contact_no',
        'address',
        'department',
        'designation',
        'employee_code',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'active' => 'boolean',
        'must_change_password' => 'boolean',
        'last_login_at' => 'datetime',
    ];

    /**
     * Tasks assigned to this user.
     */
    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    /**
     * Projects created by this user.
     */
    public function createdProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'created_by');
    }

    /**
     * Teams this user belongs to.
     */
    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user');
    }

    /**
     * Teams led by this user.
     */
    public function ledTeams(): HasMany
    {
        return $this->hasMany(Team::class, 'leader_id');
    }

    /**
     * Deliverables assigned to this user.
     */
    public function assignedDeliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class, 'assigned_to');
    }
}
