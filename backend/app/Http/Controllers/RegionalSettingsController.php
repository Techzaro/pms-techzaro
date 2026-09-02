<?php

namespace App\Http\Controllers;

use App\Services\ActivityService;
use App\Services\AuditService;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RegionalSettingsController extends Controller
{
    public function __construct(
        private ?AuditService $auditService = null,
        private ?ActivityService $activityService = null
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
            'language'      => $user->language ?? 'English',
            'timezone'      => $user->timezone,
            'date_format'   => $user->date_format ?? 'DD/MM/YYYY',
            'time_format'   => $user->time_format ?? '12-hour',
            'working_hours' => $user->working_hours,
        ];

        $updateData = [];

        // 1. Language Delta Check
        $languageChanged = false;
        if (array_key_exists('language', $validated)) {
            $lang = $validated['language'] ?? 'English';
            $updateData['language'] = $lang;
            if ($lang !== $oldValues['language']) {
                $languageChanged = true;
            }
        }

        // 2. Timezone Delta Check
        $timezoneChanged = false;
        if (array_key_exists('timezone', $validated)) {
            $tz = $validated['timezone'];
            $updateData['timezone'] = $tz;
            if ($tz !== $oldValues['timezone']) {
                $timezoneChanged = true;
            }
        }

        // 3. Date Format Delta Check
        $dateFormatChanged = false;
        if (array_key_exists('date_format', $validated)) {
            $df = $validated['date_format'] ?? 'DD/MM/YYYY';
            $updateData['date_format'] = $df;
            if ($df !== $oldValues['date_format']) {
                $dateFormatChanged = true;
            }
        }

        // 4. Time Format Delta Check
        $timeFormatChanged = false;
        if (array_key_exists('time_format', $validated)) {
            $timeFormat = $validated['time_format'];
            if ($timeFormat === '12h') {
                $timeFormat = '12-hour';
            } elseif ($timeFormat === '24h') {
                $timeFormat = '24-hour';
            }
            $updateData['time_format'] = $timeFormat ?? '12-hour';
            if ($updateData['time_format'] !== $oldValues['time_format']) {
                $timeFormatChanged = true;
            }
        }

        // 5. Working Hours Delta Check
        $workingHoursChanged = false;
        if (array_key_exists('working_hours', $validated)) {
            $updateData['working_hours'] = $validated['working_hours'];
            if (json_encode($validated['working_hours']) !== json_encode($oldValues['working_hours'])) {
                $workingHoursChanged = true;
            }
        }

        if (!empty($updateData)) {
            $user->update($updateData);
        }

        // Strict Delta-Only Logging: No generic batch log is fired!
        try {
            // Language
            if ($languageChanged) {
                $newLang = $updateData['language'];
                $desc = "Updated language from '{$oldValues['language']}' to '{$newLang}'";
                $this->activityService?->log(
                    userId: $user->id,
                    activityType: 'language_updated',
                    description: "Updated language to '{$newLang}'",
                    module: 'regional_settings',
                    relatedId: $user->id,
                    action: 'language_updated',
                    entityName: 'Language Updated',
                    relatedUserId: null,
                    metadata: ['old_language' => $oldValues['language'], 'new_language' => $newLang]
                );
                $this->auditService?->log(
                    module: 'regional_settings',
                    action: 'language_updated',
                    description: $desc,
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: ['language' => $oldValues['language']],
                    newValues: ['language' => $newLang],
                    status: 'success'
                );
            }

            // Timezone
            if ($timezoneChanged) {
                $newTz = $updateData['timezone'] ?: 'None';
                $oldTz = $oldValues['timezone'] ?: 'None';
                $desc = "Updated timezone from '{$oldTz}' to '{$newTz}'";
                $this->activityService?->log(
                    userId: $user->id,
                    activityType: 'timezone_updated',
                    description: "Updated timezone to '{$newTz}'",
                    module: 'regional_settings',
                    relatedId: $user->id,
                    action: 'timezone_updated',
                    entityName: 'Timezone Updated',
                    relatedUserId: null,
                    metadata: ['old_timezone' => $oldValues['timezone'], 'new_timezone' => $updateData['timezone']]
                );
                $this->auditService?->log(
                    module: 'regional_settings',
                    action: 'timezone_updated',
                    description: $desc,
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: ['timezone' => $oldValues['timezone']],
                    newValues: ['timezone' => $updateData['timezone']],
                    status: 'success'
                );
            }

            // Date Format
            if ($dateFormatChanged) {
                $newDf = $updateData['date_format'];
                $desc = "Updated date format from '{$oldValues['date_format']}' to '{$newDf}'";
                $this->activityService?->log(
                    userId: $user->id,
                    activityType: 'date_format_updated',
                    description: "Updated date format to '{$newDf}'",
                    module: 'regional_settings',
                    relatedId: $user->id,
                    action: 'date_format_updated',
                    entityName: 'Date Format Updated',
                    relatedUserId: null,
                    metadata: ['old_date_format' => $oldValues['date_format'], 'new_date_format' => $newDf]
                );
                $this->auditService?->log(
                    module: 'regional_settings',
                    action: 'date_format_updated',
                    description: $desc,
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: ['date_format' => $oldValues['date_format']],
                    newValues: ['date_format' => $newDf],
                    status: 'success'
                );
            }

            // Time Format
            if ($timeFormatChanged) {
                $newTf = $updateData['time_format'];
                $desc = "Updated time format from '{$oldValues['time_format']}' to '{$newTf}'";
                $this->activityService?->log(
                    userId: $user->id,
                    activityType: 'time_format_updated',
                    description: "Updated time format to '{$newTf}'",
                    module: 'regional_settings',
                    relatedId: $user->id,
                    action: 'time_format_updated',
                    entityName: 'Time Format Updated',
                    relatedUserId: null,
                    metadata: ['old_time_format' => $oldValues['time_format'], 'new_time_format' => $newTf]
                );
                $this->auditService?->log(
                    module: 'regional_settings',
                    action: 'time_format_updated',
                    description: $desc,
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: ['time_format' => $oldValues['time_format']],
                    newValues: ['time_format' => $newTf],
                    status: 'success'
                );
            }

            // Working Hours
            if ($workingHoursChanged) {
                $desc = "Updated working hours schedule";
                $this->activityService?->log(
                    userId: $user->id,
                    activityType: 'working_hours_updated',
                    description: $desc,
                    module: 'regional_settings',
                    relatedId: $user->id,
                    action: 'working_hours_updated',
                    entityName: 'Working Hours Updated',
                    relatedUserId: null,
                    metadata: ['old_working_hours' => $oldValues['working_hours'], 'new_working_hours' => $validated['working_hours']]
                );
                $this->auditService?->log(
                    module: 'regional_settings',
                    action: 'working_hours_updated',
                    description: $desc,
                    user: $user,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: ['working_hours' => $oldValues['working_hours']],
                    newValues: ['working_hours' => $validated['working_hours']],
                    status: 'success'
                );
            }
        } catch (\Throwable $e) {
            // Ignore logging errors
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
