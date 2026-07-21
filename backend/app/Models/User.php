<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        'avatar',
        'email',
        'password',
        'role',
        'active',
        'must_change_password',
        'credentials_managed_by_admin',
        'password_reset_locked',
        'password_changed_by',
        'password_changed_at',
        'password_version',

        // Contact
        'contact_no',
        'address',
        'company_name',

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
        'resigned_at',
        'resigned_by',
        'resignation_notes',
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
        'credentials_managed_by_admin' => 'boolean',
        'password_reset_locked' => 'boolean',
        'password_changed_at' => 'datetime',
        'last_login_at' => 'datetime',
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

    /** Audit log entries created by this user. */
    public function auditLogs(): HasMany
    {
        return $this->hasMany(\App\Models\AuditLog::class);
    }

    /** The admin who last changed this user's password. */
    public function passwordChangedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'password_changed_by');
    }

    /** The admin who resigned this user. */
    public function resignedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resigned_by');
    }

    /** The resignation log for this user. */
    public function resignationLog(): HasOne
    {
        return $this->hasOne(\App\Models\ResignationLog::class);
    }
}
