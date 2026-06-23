<?php

namespace App\Jobs;

use App\Models\Notification;
use App\Notifications\FcmChannel;
use App\Notifications\FcmMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendFcmNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public Notification $notification) {}

    public function handle(): void
    {
        try {
            $channel = app(FcmChannel::class);
            $channel->send($this->notification->user, new FcmMessage($this->notification));
        } catch (\Throwable $e) {
            Log::error('Failed to send FCM push', [
                'notification_id' => $this->notification->id,
                'user_id' => $this->notification->user_id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
