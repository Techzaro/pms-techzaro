<?php

namespace App\Http\Controllers;

use App\Models\UserDeviceToken;
use Illuminate\Http\Request;

/**
 * Controller for managing push notification device tokens.
 * Allows users to register and unregister their device tokens
 * for receiving push notifications.
 */
class DeviceTokenController extends Controller
{
    /**
     * Store or update a device token for the authenticated user.
     *
     * Uses updateOrCreate to prevent duplicate tokens per user-device combination.
     *
     * @param  \Illuminate\Http\Request  $request  Input: device_token (required), device_type (optional: browser|ios|android).
     * @return \Illuminate\Http\JsonResponse  JSON response confirming token saved.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'device_token' => 'required|string',
            'device_type' => 'sometimes|string|in:browser,ios,android',
        ]);

        $user = $request->user();

        UserDeviceToken::updateOrCreate(
            [
                'user_id' => $user->id,
                'device_token' => $validated['device_token'],
            ],
            [
                'device_type' => $validated['device_type'] ?? 'browser',
                'last_active_at' => now(),
            ]
        );

        return response()->json(['success' => true, 'message' => 'Device token saved']);
    }

    /**
     * Remove a device token for the authenticated user.
     *
     * @param  \Illuminate\Http\Request  $request  Input: device_token (required).
     * @return \Illuminate\Http\JsonResponse  JSON response confirming token removed.
     */
    public function destroy(Request $request)
    {
        $validated = $request->validate([
            'device_token' => 'required|string',
        ]);

        $request->user()->deviceTokens()
            ->where('device_token', $validated['device_token'])
            ->delete();

        return response()->json(['success' => true, 'message' => 'Device token removed']);
    }
}
