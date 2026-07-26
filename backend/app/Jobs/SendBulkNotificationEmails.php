<?php

namespace App\Jobs;

use App\Mail\NotificationMail;
use App\Models\Notification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendBulkNotificationEmails
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 60;

    public function __construct(public array $notificationIds) {}

    public function handle(): void
    {
        if (empty($this->notificationIds)) return;

        $notifications = Notification::whereIn('id', $this->notificationIds)
            ->with(['user.emailPreference', 'sender'])
            ->get();

        foreach ($notifications as $notification) {
            if (!$notification->user) continue;
            $recipientEmail = $notification->user->professional_email ?: $notification->user->personal_email ?: $notification->user->email;
            if (empty($recipientEmail)) continue;
            if ($notification->type === 'user_updated') continue;
            if ($notification->related_module === 'chat') continue;

            try {
                if (!Notification::wantsChannel($notification, 'email')) continue;

                $senderEmail = $notification->sender?->professional_email ?? $notification->sender?->personal_email ?? $notification->sender?->email ?? '';
                $senderName = $notification->sender?->name ?? config('mail.from.name', 'PMS Techxaro');
                $mail = new NotificationMail($notification, $senderEmail, $senderName);
                Mail::to($recipientEmail)->send($mail);
            } catch (\Throwable $e) {
                Log::error('Bulk email failed', [
                    'notification_id' => $notification->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
