<?php

namespace App\Notifications;

use App\Models\User;
use App\Models\UserDeviceToken;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Firebase Cloud Messaging notification channel (FCM v1 HTTP API).
 *
 * Sends push notifications to a user's registered device tokens
 * via the FCM v1 HTTP API with OAuth2 service account authentication.
 */
class FcmChannel
{
    /** @var string|null Cached OAuth2 access token */
    private static ?string $cachedAccessToken = null;

    /** @var int|null Token expiry timestamp */
    private static ?int $cachedTokenExpiry = null;

    /**
     * Send an FCM push notification to all of the user's device tokens.
     *
     * @param \App\Models\User $user    Target user
     * @param FcmMessage       $message The message to send
     *
     * @return void
     */
    public function send(User $user, FcmMessage $message): void
    {
        $tokens = UserDeviceToken::where('user_id', $user->id)
            ->pluck('device_token')
            ->unique()
            ->values()
            ->toArray();

        if (empty($tokens)) {
            return;
        }

        $projectId = config('services.fcm.project_id');
        $serviceAccountPath = config('services.fcm.service_account_path');

        if (!$projectId || !$serviceAccountPath) {
            Log::warning('FCM v1 not configured — set FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_PATH in .env');
            return;
        }

        $accessToken = self::getAccessToken($serviceAccountPath);
        if (!$accessToken) {
            Log::error('FCM: Failed to obtain OAuth2 access token');
            return;
        }

        // FCM v1 sends one message per request
        foreach ($tokens as $token) {
            $payload = [
                'message' => [
                    'token' => $token,
                    'notification' => [
                        'title' => $message->title,
                        'body' => mb_substr($message->body, 0, 500),
                    ],
                    'data' => [
                        'url' => $message->url ?? '/',
                        'type' => $message->type ?? 'general',
                        'id' => (string) ($message->id ?? ''),
                        'title' => $message->title,
                        'body' => $message->body,
                    ],
                    'webpush' => [
                        'fcm_options' => [
                            'link' => $message->url ?? '/',
                        ],
                        'notification' => [
                            'icon' => '/TX.png',
                            'badge' => '/TX.ico',
                        ],
                    ],
                    'android' => [
                        'priority' => 'high',
                    ],
                ],
            ];

            try {
                $response = Http::withToken($accessToken)
                    ->timeout(10)
                    ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", $payload);

                if ($response->failed()) {
                    Log::error('FCM v1 send failed', [
                        'user_id' => $user->id,
                        'token' => substr($token, 0, 20) . '...',
                        'status' => $response->status(),
                        'body' => $response->body(),
                    ]);

                    // Remove invalid tokens (UNREGISTERED or NOT_FOUND)
                    $body = $response->json();
                    $errorCode = $body['error']['details'][0]['errorCode'] ?? '';
                    if (in_array($errorCode, ['UNREGISTERED', 'NOT_FOUND'])) {
                        UserDeviceToken::where('user_id', $user->id)
                            ->where('device_token', $token)
                            ->delete();
                        Log::info('FCM: Removed invalid token', ['user_id' => $user->id]);
                    }
                }
            } catch (\Throwable $e) {
                Log::error('FCM v1 send exception', [
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * Get a valid OAuth2 access token from the service account.
     * Caches the token until 5 minutes before expiry.
     *
     * @param string $serviceAccountPath Path to the service account JSON file
     * @return string|null Access token or null on failure
     */
    private static function getAccessToken(string $serviceAccountPath): ?string
    {
        // Return cached token if still valid (with 5 min buffer)
        if (self::$cachedAccessToken && self::$cachedTokenExpiry && time() < (self::$cachedTokenExpiry - 300)) {
            return self::$cachedAccessToken;
        }

        if (!file_exists($serviceAccountPath)) {
            Log::error('FCM: Service account file not found', ['path' => $serviceAccountPath]);
            return null;
        }

        $serviceAccount = json_decode(file_get_contents($serviceAccountPath), true);
        if (!$serviceAccount || !isset($serviceAccount['client_email'], $serviceAccount['private_key'])) {
            Log::error('FCM: Invalid service account JSON');
            return null;
        }

        $now = time();
        $issuer = $serviceAccount['client_email'];
        $scope = 'https://www.googleapis.com/auth/firebase.messaging';

        // Build JWT
        $header = self::base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = self::base64url(json_encode([
            'iss' => $issuer,
            'scope' => $scope,
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));

        $data = "{$header}.{$payload}";
        $signature = '';

        if (openssl_sign($data, $signature, $serviceAccount['private_key'], 'SHA256')) {
            $jwt = "{$data}." . self::base64url($signature);

            // Exchange JWT for access token
            $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]);

            if ($response->successful()) {
                $tokenData = $response->json();
                self::$cachedAccessToken = $tokenData['access_token'];
                self::$cachedTokenExpiry = $now + ($tokenData['expires_in'] ?? 3600);
                return self::$cachedAccessToken;
            }

            Log::error('FCM: Token exchange failed', ['status' => $response->status()]);
        } else {
            Log::error('FCM: JWT signing failed');
        }

        return null;
    }

    /**
     * Base64url encode a string (RFC 7515).
     */
    private static function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
