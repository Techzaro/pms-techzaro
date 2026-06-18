<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Builder;

class Event extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'description',
        'type',
        'color',
        'start_date',
        'end_date',
        'all_day',
        'is_global',
    ];

    protected $casts = [
        'start_date' => 'datetime:Y-m-d\TH:i:s',
        'end_date' => 'datetime:Y-m-d\TH:i:s',
        'all_day' => 'boolean',
        'is_global' => 'boolean',
    ];

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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function assignedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'event_users')->withTimestamps();
    }
}
