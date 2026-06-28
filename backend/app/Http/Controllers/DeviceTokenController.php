<?php

namespace App\Http\Controllers;

use App\Models\UserDeviceToken;
use Illuminate\Http\Request;

class DeviceTokenController extends Controller
{
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
