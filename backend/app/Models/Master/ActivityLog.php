<?php

namespace App\Models\Master;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;

class ActivityLog extends Model
{
    protected $connection = 'mysql_master';
    protected $table = 'activity_logs';
    protected $fillable = ['user', 'action', 'target', 'ip', 'status', 'details'];

    public function scopeSearch(Builder $query, ?string $search): Builder
    {
        if (!$search) return $query;

        return $query->where(function ($q) use ($search) {
            $q->where('user', 'like', "%{$search}%")
              ->orWhere('action', 'like', "%{$search}%")
              ->orWhere('target', 'like', "%{$search}%");
        });
    }

    public function scopeDateRange(Builder $query, ?string $from, ?string $to): Builder
    {
        if ($from) $query->where('created_at', '>=', $from . ' 00:00:00');
        if ($to) $query->where('created_at', '<=', $to . ' 23:59:59');
        return $query;
    }
}
