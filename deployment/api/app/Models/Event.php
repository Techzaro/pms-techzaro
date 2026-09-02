<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

/**
 * Calendar event within the project management system.
 * Can be personal (created by a user) or global, and supports multi-day events.
 */
class Event extends Model
{
    protected $fillable = [
        'user_id',
        'organizer_id',
        'title',
        'description',
        'type',
        'category_id',
        'location',
        'meeting_link',
        'color',
        'start_date',
        'end_date',
        'start_time',
        'end_time',
        'all_day',
        'is_global',
        'visibility_level',
        'status',
        'event_timezone',
        'event_date',
        'event_start_time',
        'event_end_time',
        'project_id',
    ];

    protected $casts = [
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'event_date' => 'date',
        'all_day' => 'boolean',
        'is_global' => 'boolean',
    ];

    /** Apply filters for querying events (type, date range, search). */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        if (!empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (!empty($filters['month']) && !empty($filters['year'])) {
            $query->whereMonth('start_date', $filters['month'])
                  ->whereYear('start_date', $filters['year']);
        }

        if (!empty($filters['date'])) {
            $query->whereDate('start_date', $filters['date']);
        }

        // Date range filtering for calendar views
        if (!empty($filters['from']) && !empty($filters['to'])) {
            $query->where(function ($q) use ($filters) {
                $q->where(function ($q2) use ($filters) {
                    // Events that start within the range
                    $q2->whereDate('start_date', '>=', $filters['from'])
                       ->whereDate('start_date', '<=', $filters['to']);
                })->orWhere(function ($q2) use ($filters) {
                    // Events that end within the range
                    $q2->whereDate('end_date', '>=', $filters['from'])
                       ->whereDate('end_date', '<=', $filters['to']);
                })->orWhere(function ($q2) use ($filters) {
                    // Events that span across the entire range
                    $q2->whereDate('start_date', '<=', $filters['from'])
                       ->whereDate('end_date', '>=', $filters['to']);
                });
            });
        }

        if (!empty($filters['search'])) {
            $query->where('title', 'like', '%' . $filters['search'] . '%');
        }

        return $query;
    }

    /** The user who created this event. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The organizer of this event. */
    public function organizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'organizer_id');
    }

    /** Category of this event. */
    public function category(): BelongsTo
    {
        return $this->belongsTo(EventCategory::class, 'category_id');
    }

    /** Users assigned to this event. */
    public function assignedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'event_users')->withTimestamps();
    }

    /** Granular visibility rules for this event. */
    public function visibilities(): HasMany
    {
        return $this->hasMany(EventVisibility::class, 'event_id');
    }

    /** Participant records with RSVP and attendance status. */
    public function participants(): HasMany
    {
        return $this->hasMany(EventParticipant::class, 'event_id');
    }

    /** The user who created this event. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Reminders configured for this event. */
    public function reminders(): HasMany
    {
        return $this->hasMany(EventReminder::class, 'event_id');
    }

    /** Attachments uploaded for this event. */
    public function attachments(): HasMany
    {
        return $this->hasMany(EventAttachment::class, 'event_id');
    }
}
