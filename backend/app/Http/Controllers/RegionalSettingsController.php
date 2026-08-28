<?php

namespace App\Http\Controllers;

use App\Services\AuditService;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RegionalSettingsController extends Controller
{
    public function __construct(
        private ?AuditService $auditService = null
    ) {}

    /**
     * Get the authenticated user's regional settings.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'language'      => $user->language ?? 'English',
                'timezone'      => $user->timezone,
                'date_format'   => $user->date_format ?? 'DD/MM/YYYY',
                'time_format'   => $user->time_format ?? '12-hour',
                'working_hours' => $user->working_hours,
            ],
            'settings' => [
                'language'      => $user->language ?? 'English',
                'timezone'      => $user->timezone,
                'date_format'   => $user->date_format ?? 'DD/MM/YYYY',
                'time_format'   => $user->time_format ?? '12-hour',
                'working_hours' => $user->working_hours,
            ],
        ]);
    }

    /**
     * Update the authenticated user's regional settings.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'language'      => ['sometimes', 'nullable', 'string', 'max:50'],
            'timezone'      => ['sometimes', 'nullable', 'string', 'timezone:all'],
            'date_format'   => ['sometimes', 'nullable', 'string', Rule::in(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])],
            'time_format'   => ['sometimes', 'nullable', 'string', Rule::in(['12-hour', '24-hour', '12h', '24h'])],
            'working_hours' => ['sometimes', 'nullable', 'array'],
        ]);

        $user = $request->user();
        $oldValues = [
            'language'      => $user->language,
            'timezone'      => $user->timezone,
            'date_format'   => $user->date_format,
            'time_format'   => $user->time_format,
            'working_hours' => $user->working_hours,
        ];

        $updateData = [];

        if (array_key_exists('language', $validated)) {
            $updateData['language'] = $validated['language'] ?? 'English';
        }

        if (array_key_exists('timezone', $validated)) {
            $updateData['timezone'] = $validated['timezone'];
        }

        if (array_key_exists('date_format', $validated)) {
            $updateData['date_format'] = $validated['date_format'] ?? 'DD/MM/YYYY';
        }

        if (array_key_exists('time_format', $validated)) {
            $timeFormat = $validated['time_format'];
            if ($timeFormat === '12h') {
                $timeFormat = '12-hour';
            } elseif ($timeFormat === '24h') {
                $timeFormat = '24-hour';
            }
            $updateData['time_format'] = $timeFormat ?? '12-hour';
        }

        if (array_key_exists('working_hours', $validated)) {
            $updateData['working_hours'] = $validated['working_hours'];
        }

        $user->update($updateData);

        if ($this->auditService) {
            try {
                $this->auditService->log(
                    module: 'user_settings',
                    action: 'update_regional_settings',
                    description: 'Updated regional settings',
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: $oldValues,
                    newValues: $updateData,
                    status: 'success'
                );
            } catch (\Throwable $e) {
                // Ignore audit logging errors to prevent breaking user flow
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Regional settings updated successfully.',
            'data' => [
                'language'      => $user->language,
                'timezone'      => $user->timezone,
                'date_format'   => $user->date_format,
                'time_format'   => $user->time_format,
                'working_hours' => $user->working_hours,
            ],
            'settings' => [
                'language'      => $user->language,
                'timezone'      => $user->timezone,
                'date_format'   => $user->date_format,
                'time_format'   => $user->time_format,
                'working_hours' => $user->working_hours,
            ],
        ]);
    }

    /**
     * List all valid IANA timezones.
     */
    public function getTimezones(): JsonResponse
    {
        $timezones = DateTimeZone::listIdentifiers(DateTimeZone::ALL);

        return response()->json([
            'success' => true,
            'data' => $timezones,
        ]);
    }
}
