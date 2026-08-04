<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationSettingController extends Controller
{
    /**
     * Get default category preferences.
     */
    private function getDefaultPreferences(): array
    {
        return [
            'project'  => ['email' => true, 'desktop' => true, 'slack' => true, 'google_chat' => true, 'teams_channel' => true],
            'task'     => ['email' => true, 'desktop' => true, 'slack' => true, 'google_chat' => true, 'teams_channel' => true],
            'sub_task' => ['email' => true, 'desktop' => true, 'slack' => true, 'google_chat' => true, 'teams_channel' => true],
            'events'   => ['email' => true, 'desktop' => true, 'slack' => true, 'google_chat' => true, 'teams_channel' => true],
            'profile'  => ['email' => true, 'desktop' => true, 'slack' => false, 'google_chat' => false, 'teams_channel' => false],
            'teams'    => ['email' => true, 'desktop' => true, 'slack' => true, 'google_chat' => true, 'teams_channel' => true],
            'draft'    => ['email' => false, 'desktop' => false, 'slack' => false, 'google_chat' => false, 'teams_channel' => false],
        ];
    }

    /**
     * Get the authenticated user's notification preferences and webhook URLs.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $defaults = $this->getDefaultPreferences();

        $saved = $user->notification_preferences;
        if (is_string($saved)) {
            $saved = json_decode($saved, true);
        }
        if (is_string($saved)) {
            $saved = json_decode($saved, true);
        }
        if (!is_array($saved)) {
            $saved = [];
        }

        // Merge saved preferences over defaults
        $preferences = array_replace_recursive($defaults, $saved ?? []);

        return response()->json([
            'success' => true,
            'preferences' => $preferences,
            'webhooks' => [
                'slack_webhook_url' => $user->slack_webhook_url,
                'google_chat_webhook_url' => $user->google_chat_webhook_url,
                'ms_teams_webhook_url' => $user->ms_teams_webhook_url,
            ],
            'categories' => [
                'project'  => 'Project',
                'task'     => 'Task',
                'sub_task' => 'Sub-Tasks',
                'events'   => 'Events',
                'profile'  => 'Profile',
                'teams'    => 'Teams',
                'draft'    => 'Draft',
            ],
        ]);
    }

    /**
     * Update the authenticated user's notification preferences and webhook URLs.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preferences' => 'required|array',
            'webhooks' => 'nullable|array',
            'webhooks.slack_webhook_url' => 'nullable|string',
            'webhooks.google_chat_webhook_url' => 'nullable|string',
            'webhooks.ms_teams_webhook_url' => 'nullable|string',
        ]);

        $user = $request->user();

        // Clean and validate boolean matrix conversion (guarantees true/false booleans for JSON column)
        $cleanPreferences = [];
        $rawPreferences = $validated['preferences'];
        if (is_array($rawPreferences)) {
            foreach ($rawPreferences as $category => $channels) {
                if (is_array($channels)) {
                    foreach ($channels as $channel => $val) {
                        $cleanPreferences[$category][$channel] = filter_var($val, FILTER_VALIDATE_BOOLEAN);
                    }
                }
            }
        }

        $user->notification_preferences = $cleanPreferences; // Assigned directly as PHP array (Eloquent array cast auto-serializes)

        if (isset($validated['webhooks'])) {
            $user->slack_webhook_url = $validated['webhooks']['slack_webhook_url'] ?? null;
            $user->google_chat_webhook_url = $validated['webhooks']['google_chat_webhook_url'] ?? null;
            $user->ms_teams_webhook_url = $validated['webhooks']['ms_teams_webhook_url'] ?? null;
        }

        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Notification preferences updated successfully',
            'preferences' => $user->notification_preferences,
            'webhooks' => [
                'slack_webhook_url' => $user->slack_webhook_url,
                'google_chat_webhook_url' => $user->google_chat_webhook_url,
                'ms_teams_webhook_url' => $user->ms_teams_webhook_url,
            ],
        ]);
    }

    /**
     * Send a test webhook notification to Slack, Google Chat, or MS Teams.
     */
    public function testWebhook(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'channel' => 'required|string|in:slack,google_chat,teams',
            'url' => 'nullable|string|url',
        ]);

        $user = $request->user();
        $channel = $validated['channel'];
        $url = $validated['url'];

        if (!$url) {
            if ($channel === 'slack') $url = $user->slack_webhook_url;
            else if ($channel === 'google_chat') $url = $user->google_chat_webhook_url;
            else if ($channel === 'teams') $url = $user->ms_teams_webhook_url;
        }

        if (empty($url)) {
            return response()->json([
                'success' => false,
                'message' => 'No webhook URL provided for ' . $channel,
            ], 422);
        }

        $title = '🔔 PMS Webhook Integration Test';
        $message = 'Hello! This is a test notification from your PMS Portal confirming that your ' . ucfirst(str_replace('_', ' ', $channel)) . ' webhook is configured properly.';

        try {
            if ($channel === 'teams') {
                $payload = [
                    '@type' => 'MessageCard',
                    '@context' => 'http://schema.org/extensions',
                    'summary' => $title,
                    'themeColor' => '6366F1',
                    'title' => $title,
                    'text' => $message,
                ];
            } else {
                $payload = [
                    'text' => "*{$title}*\n{$message}",
                ];
            }

            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ])->post($url, $payload);

            if ($response->failed() && $channel === 'teams') {
                // Fallback for Teams Power Automate
                $response = \Illuminate\Support\Facades\Http::withHeaders([
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ])->post($url, ['text' => "*{$title}*\n{$message}"]);
            }

            if ($response->failed()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Webhook call failed with HTTP status ' . $response->status(),
                    'error' => $response->body(),
                ], 400);
            }

            return response()->json([
                'success' => true,
                'message' => 'Test message sent successfully to ' . ucfirst(str_replace('_', ' ', $channel)),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to dispatch test webhook: ' . $e->getMessage(),
            ], 500);
        }
    }
}