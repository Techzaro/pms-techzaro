<?php

namespace App\Notifications;

use App\Models\User;
use App\Models\UserDeviceToken;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Firebase Cloud Messaging notification channel.
 *
 * Sends push notifications to a user's registered device tokens
 * via the FCM HTTP API.
 */
class FcmChannel
{
    /**
     * Send an FCM push notification to all of the user's device tokens.
     *
     * Retrieves unique device tokens from the database, constructs the
     * FCM payload, and posts it to the FCM API endpoint. Logs failures
     * without throwing exceptions.
     *
     * @param \App\Models\User    $user    Target user
     * @param FcmMessage          $message The message to send
     *
     * @return void
     */
    public function send(User $user, FcmMessage $message): void
    {
        // Fetch unique device tokens for the user
        $tokens = UserDeviceToken::where('user_id', $user->id)
            ->pluck('device_token')
            ->unique()
            ->values()
            ->toArray();

        if (empty($tokens)) {
            return;
        }

        // Validate FCM server key is configured
        $serverKey = config('services.fcm.server_key');
        if (!$serverKey) {
            Log::warning('FCM server key not configured — set FCM_SERVER_KEY in .env');
            return;
        }

        // Build FCM payload with notification and data fields
        $payload = [
            'registration_ids' => $tokens,
            'notification' => [
                'title' => $message->title,
                'body' => mb_substr($message->body, 0, 500),
                'click_action' => 'FLUTTER_NOTIFICATION_CLICK',
            ],
            'data' => [
                'url' => $message->url,
                'type' => $message->type,
                'id' => (string) ($message->id ?? ''),
                'title' => $message->title,
                'body' => $message->body,
            ],
            'priority' => 'high',
        ];

        try {
            $response = Http::withHeaders([
                'Authorization' => 'key=' . $serverKey,
                'Content-Type' => 'application/json',
            ])->timeout(10)->post('https://fcm.googleapis.com/fcm/send', $payload);

            if ($response->failed()) {
                Log::error('FCM send failed', [
                    'user_id' => $user->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('FCM send exception', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
