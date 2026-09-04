<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskSavedView extends Model
{
    use HasFactory;

    protected $table = 'task_saved_views';

    protected $fillable = [
        'user_id',
        'name',
        'view_name',
        'filters',
        'filter_payload',
        'sort_parameters',
        'is_default',
    ];

    protected $casts = [
        'filters' => 'array',
        'filter_payload' => 'array',
        'sort_parameters' => 'array',
        'is_default' => 'boolean',
    ];

    protected static function booted()
    {
        static::saving(function ($model) {
            $nameVal = $model->attributes['name'] ?? $model->attributes['view_name'] ?? null;
            if ($nameVal !== null) {
                $model->attributes['name'] = $nameVal;
                $model->attributes['view_name'] = $nameVal;
            }

            $filterVal = $model->attributes['filters'] ?? $model->attributes['filter_payload'] ?? null;
            if ($filterVal !== null) {
                $encoded = is_array($filterVal) ? json_encode($filterVal) : $filterVal;
                $model->attributes['filters'] = $encoded;
                $model->attributes['filter_payload'] = $encoded;
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getNameAttribute($value)
    {
        return $value ?: $this->attributes['view_name'] ?? '';
    }

    public function getViewNameAttribute($value)
    {
        return $value ?: $this->attributes['name'] ?? '';
    }

    public function getFiltersAttribute($value)
    {
        if ($value) {
            return is_string($value) ? json_decode($value, true) : $value;
        }
        $payload = $this->attributes['filter_payload'] ?? null;
        return $payload ? (is_string($payload) ? json_decode($payload, true) : $payload) : [];
    }

    public function getFilterPayloadAttribute($value)
    {
        if ($value) {
            return is_string($value) ? json_decode($value, true) : $value;
        }
        $filters = $this->attributes['filters'] ?? null;
        return $filters ? (is_string($filters) ? json_decode($filters, true) : $filters) : [];
    }
}
