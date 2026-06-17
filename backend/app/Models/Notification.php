<?php

namespace App\Models;

use App\Mail\NotificationMail;
use App\Notifications\FcmChannel;
use App\Notifications\FcmMessage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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
        'link',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::created(function (self $notification) {
            $notification->loadMissing('user.emailPreference');

            if (!$notification->user || !$notification->user->email) {
                return;
            }

            // Send email notification
            if (static::wantsChannel($notification, 'email')) {
                try {
                    Mail::to($notification->user->email)
                        ->queue(new NotificationMail($notification));
                } catch (\Throwable $e) {
                    Log::error('Failed to queue notification email', [
                        'notification_id' => $notification->id,
                        'user_id' => $notification->user_id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            // Send FCM push notification (mobile / browser)
            if (static::wantsChannel($notification, 'mobile_push')) {
                try {
                    $channel = app(FcmChannel::class);
                    $channel->send($notification->user, new FcmMessage($notification));
                } catch (\Throwable $e) {
                    Log::error('Failed to send FCM push', [
                        'notification_id' => $notification->id,
                        'user_id' => $notification->user_id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        });
    }

    private static function wantsChannel(self $notification, string $channel): bool
    {
        $preference = $notification->user->emailPreference;

        if (!$preference) {
            return true;
        }

        // Map module -> notification type preference field
        $moduleField = [
            'task' => 'task_notifications',
            'deliverable' => 'deliverable_notifications',
            'project' => 'project_notifications',
            'event' => 'event_notifications',
        ];
        $typeField = $moduleField[$notification->related_module] ?? 'system_notifications';

        // Check the module-level toggle
        if (!$preference->{$typeField}) {
            return false;
        }

        // Check the channel toggle
        if ($channel === 'email') {
            return true; // email uses the module-level toggles only
        }

        if ($channel === 'mobile_push') {
            return (bool) $preference->mobile_push_notifications;
        }

        return true;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }
}
