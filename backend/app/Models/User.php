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

        // Contact
        'contact_no',
        'address',

        // Employment
        'department',
        'designation',
        'employee_code',
        'last_login_at',

        // Extended profile
        'father_name',
        'id_card_number',
        'phone_number',
        'present_address',
        'permanent_address',

        // Emergency contact
        'emergency_contact_name',
        'emergency_contact_relation',
        'emergency_contact_phone',

        // Emails
        'personal_email',
        'professional_email_password',
        'recovery_email',

        // Employment details
        'hired_for',
        'job_started_date',
        'job_ended_date',

        // Salary & bank
        'gross_salary',
        'applied_via',
        'bank_name',
        'bank_account_number',
        'bank_account_title',

        // Documents
        'employment_contract',
        'offer_letter',
        'techxaro_regulations',
        'latest_education_cert',
        'cv',
        'previous_exp_letter',
        'previous_salary_slip',
        'other_document',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'professional_email_password',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'active' => 'boolean',
        'must_change_password' => 'boolean',
        'last_login_at' => 'datetime',
        'job_started_date' => 'date',
        'job_ended_date' => 'date',
        'gross_salary' => 'decimal:2',
    ];

    public function getNormalizedRoleAttribute(): string
    {
        return $this->role === 'teamlead' ? 'team_lead' : $this->role;
    }

    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    public function createdProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'created_by');
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user');
    }

    public function ledTeams(): HasMany
    {
        return $this->hasMany(Team::class, 'leader_id');
    }

    public function assignedDeliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class, 'assigned_to');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(\App\Models\Notification::class)->latest();
    }

    public function unreadNotifications(): HasMany
    {
        return $this->hasMany(\App\Models\Notification::class)->where('is_read', false);
    }

    public function visibleProjects(): HasMany
    {
        return $this->hasMany(\App\Models\ProjectVisibility::class);
    }
}
