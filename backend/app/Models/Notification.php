<?php

namespace App\Models;

use App\Mail\NotificationMail;
use App\Notifications\FcmChannel;
use App\Notifications\FcmMessage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * In-app notification sent to users.
 * Automatically dispatches email and/or push notifications based on user preferences.
 */
class Notification extends Model
{
    protected $fillable = [
        'user_id',
        'sender_user_id',
        'type',
        'related_module',
        'related_id',
        'title',
        'message',
        'changes',
        'link',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'changes' => 'array',
    ];

    /**
     * Boot the model and trigger email/push notifications on creation.
     * Checks user email preferences before dispatching each channel.
     */
    protected static function booted(): void
    {
        static::created(function (self $notification) {
            \App\Jobs\SendBulkNotificationEmails::dispatch([$notification->id]);
        });
    }

    /**
     * Determine if the user has opted in for a given notification channel.
     * Falls back to enabled if no preference record exists.
     */
    public static function wantsChannel(self $notification, string $channel): bool
    {
        $preference = $notification->user->emailPreference;

        if (!$preference) {
            return true;
        }

        $moduleField = [
            'task' => 'task_notifications',
            'deliverable' => 'deliverable_notifications',
            'project' => 'project_notifications',
            'event' => 'event_notifications',
            'team' => 'team_notifications',
        ];
        $typeField = $moduleField[$notification->related_module] ?? 'system_notifications';

        if (!$preference->{$typeField}) {
            return false;
        }

        if ($channel === 'email') {
            return true;
        }

        if ($channel === 'mobile_push') {
            return (bool) $preference->mobile_push_notifications;
        }

        return true;
    }

    /** The user receiving this notification. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The user who triggered this notification (optional). */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }
}
