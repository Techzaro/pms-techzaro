<?php

/**
 * Eloquent model representing a project with tasks, milestones, files, and activities.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use App\Models\User;
use App\Services\BusinessIdService;

/**
 * Core project model that ties together all project-related entities.
 * Manages metadata, assigned users, workflow states, and relationships to tasks, milestones, and deliverables.
 */
class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_code',
        'project_number',
        'business_id',
        'title',
        'description',
        'sheets_documents',
        'website_name',
        'website_link',
        'client_name',
        'guest_ids',
        'category',
        'budget',
        'priority',
        'sidebar_notes',
        'kb_ids',
        'event_ids',
        'team_id',
        'team_ids',
        'assigned_users',
        'status',
        'start_date',
        'end_date',
        'created_by',
        'updated_by',
        'sort_order',
    ];

    /**
     * Auto-generate business_id if missing (for old data without migration).
     */
    public function getBusinessIdAttribute($value)
    {
        if ($value) return $value;

        $service = app(BusinessIdService::class);
        $ids = $service->generateProjectBusinessId($this);
        $this->updateQuietly([
            'project_code' => $ids['code'],
            'project_number' => $ids['number'],
            'business_id' => $ids['business_id'],
        ]);

        return $ids['business_id'];
    }

    protected static function booted(): void
    {
        static::creating(function (Project $project) {
            if (empty($project->business_id)) {
                $ids = app(BusinessIdService::class)->generateProjectBusinessId($project);
                $project->project_code = $ids['code'];
                $project->project_number = $ids['number'];
                $project->business_id = $ids['business_id'];
            }
        });
    }

    protected $casts = [
        'assigned_users' => 'array',
        'team_ids' => 'array',
        'guest_ids' => 'array',
        'kb_ids' => 'array',
        'event_ids' => 'array',
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'budget' => 'decimal:2',
    ];

    /** All tasks belonging to this project. */
    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    /**
     * Check if a guest user has access to this project.
     * Only checks guest_ids field.
     */
    public function isAccessibleByGuest(User $user): bool
    {
        if ($user->role !== 'guest') return false;

        $guestIds = $this->guest_ids ?? [];
        return !empty($guestIds) && in_array($user->id, $guestIds);
    }

    /** The user who created this project. */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The user who last updated this project. */
    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** The team assigned to this project. */
    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    /** Multiple teams assigned to this project via team_ids JSON column. */
    public function teams()
    {
        return Team::whereIn('id', $this->team_ids ?? [])->get();
    }

    /** Milestones for this project, ordered by sort order. */
    public function milestones()
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('sort_order')->latest('updated_at');
    }

    /** File attachments for this project. */
    public function files()
    {
        return $this->hasMany(ProjectFile::class)->orderBy('sort_order');
    }

    /** Deliverables belonging to this project. */
    public function deliverables()
    {
        return $this->hasMany(Deliverable::class)->latest();
    }

    /** All visibility rules for this project. */
    public function visibility()
    {
        return $this->hasMany(ProjectVisibility::class);
    }

    /** Access credentials for this project. */
    public function accessCredentials()
    {
        return $this->hasMany(ProjectAccessCredential::class);
    }

    /** Users who are explicitly marked as visible for this project. */
    public function manuallyVisibleTo()
    {
        return $this->hasMany(ProjectVisibility::class)->where('is_visible', true);
    }

    /** Workflow events tracking state changes (created, field_changed, status_updated). */
    public function workflowEvents()
    {
        return $this->hasMany(ProjectWorkflowEvent::class)->latest();
    }

    /** Activities related to this project (via related_module/related_id). */
    public function activities()
    {
        return $this->hasMany(Activity::class, 'related_id')
            ->where('related_module', 'Project');
    }

    /** Field-level changes made to this project. */
    public function changes()
    {
        return $this->hasMany(ProjectChange::class)->latest();
    }

    /** Changes not yet viewed by the current user. */
    public function unviewedChanges()
    {
        return $this->hasMany(ProjectChange::class)->where('is_viewed', false);
    }

    /**
     * Resolve assigned_users JSON array to User models.
     */
    public function getAssignedUsersResolvedAttribute()
    {
        $ids = $this->assigned_users ?? [];
        if (empty($ids)) {
            return [];
        }
        return User::whereIn('id', $ids)->select('id', 'name', 'role')->get();
    }

    /**
     * Get the active deadline for this project.
     * Returns the nearest upcoming milestone due_date.
     * Falls back to end_date if no milestones exist.
     */
    public function getActiveDeadlineAttribute()
    {
        $now = now();

        // Find the nearest upcoming milestone (not completed, due_date >= now)
        $upcoming = $this->milestones()
            ->where('due_date', '>=', $now)
            ->where('status', '!=', 'completed')
            ->orderBy('due_date', 'asc')
            ->first();

        if ($upcoming) {
            return $upcoming->due_date;
        }

        // All milestones completed/passed - use the last milestone's due_date
        $lastMilestone = $this->milestones()
            ->orderBy('sort_order', 'desc')
            ->first();

        if ($lastMilestone && $lastMilestone->due_date) {
            return $lastMilestone->due_date;
        }

        // Fallback to end_date if no milestones at all
        return $this->end_date;
    }

    /**
     * Sync project start_date and end_date from milestones.
     * start_date = earliest milestone due_date
     * end_date   = latest milestone due_date (final deadline)
     */
    public function syncDatesFromMilestones(): void
    {
        $milestones = $this->milestones()
            ->whereNotNull('due_date')
            ->orderBy('due_date', 'asc')
            ->get();

        if ($milestones->isEmpty()) {
            return;
        }

        $earliest = $milestones->first()->due_date;
        $latest = $milestones->last()->due_date;

        $this->updateQuietly([
            'start_date' => $earliest,
            'end_date' => $latest,
        ]);
    }

    /**
     * Get all active members of this project (assigned_users + team members + team leaders).
     * Returns a Collection of User models.
     */
    public function getMembers()
    {
        $memberIds = collect($this->assigned_users ?? []);

        $teamIds = array_merge(
            $this->team_id ? [$this->team_id] : [],
            $this->team_ids ?? []
        );
        $teamIds = array_unique(array_filter($teamIds));

        if (! empty($teamIds)) {
            $teams = \App\Models\Team::whereIn('id', $teamIds)
                ->with('members:id')
                ->get();
            $teamMemberIds = $teams->flatMap(fn ($team) => $team->members->pluck('id'))
                ->merge($teams->pluck('leader_id'))
                ->filter()
                ->unique()
                ->values();

            $memberIds = $memberIds->merge($teamMemberIds);
        }

        $memberIds = $memberIds->filter()->unique()->values()->all();

        if (empty($memberIds)) {
            return collect();
        }

        return User::whereIn('id', $memberIds)
            ->where('active', true)
            ->select('id', 'name', 'email', 'role', 'department')
            ->orderBy('name')
            ->get();
    }

    /** All users following this project (many-to-many). */
    public function followers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'project_followers')->withTimestamps();
    }
}
