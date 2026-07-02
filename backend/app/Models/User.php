<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Application user model.
 * Stores personal, employment, and authentication data; links to tasks, projects, teams, and notifications.
 */
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
        'professional_email',
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
        'other_document',
        'sort_order',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        // 'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'active' => 'boolean',
        'must_change_password' => 'boolean',
        'last_login_at' => 'datetime',
        'job_started_date' => 'date',
        'job_ended_date' => 'date',
        'gross_salary' => 'decimal:2',
    ];

    /**
     * Normalize the role attribute (e.g., 'teamlead' -> 'team_lead').
     */
    public function getNormalizedRoleAttribute(): string
    {
        return $this->role === 'teamlead' ? 'team_lead' : $this->role;
    }

    /** Tasks assigned to this user. */
    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    /** Projects created by this user. */
    public function createdProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'created_by');
    }

    /** Teams this user belongs to. */
    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user');
    }

    /** Teams where this user is the designated leader. */
    public function ledTeams(): HasMany
    {
        return $this->hasMany(Team::class, 'leader_id');
    }

    /** Deliverables assigned to this user. */
    public function assignedDeliverables(): HasMany
    {
        return $this->hasMany(Deliverable::class, 'assigned_to');
    }

    /** All notifications for this user, newest first. */
    public function notifications(): HasMany
    {
        return $this->hasMany(\App\Models\Notification::class)->latest();
    }

    /** All field changes made to this user's profile. */
    public function changes()
    {
        return $this->hasMany(\App\Models\UserChange::class)->latest();
    }

    /** Unread notifications for this user. */
    public function unreadNotifications(): HasMany
    {
        return $this->hasMany(\App\Models\Notification::class)->where('is_read', false);
    }

    /** Visibility rules controlling which projects this user can see. */
    public function visibleProjects(): HasMany
    {
        return $this->hasMany(\App\Models\ProjectVisibility::class);
    }

    /** User's email notification preferences. */
    public function emailPreference(): HasOne
    {
        return $this->hasOne(\App\Models\UserEmailPreference::class);
    }

    /** Registered device tokens for push notifications. */
    public function deviceTokens(): HasMany
    {
        return $this->hasMany(\App\Models\UserDeviceToken::class);
    }
}
