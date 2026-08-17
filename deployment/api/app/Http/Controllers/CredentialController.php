<?php

namespace App\Http\Controllers;

use App\Mail\PasswordChangedMail;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Controller for admin credential management.
 * Allows admins to change user passwords, lock/unlock password recovery,
 * and view credential status. Enforces strict admin-only access.
 */
class CredentialController extends Controller
{
    public function __construct(
        private ActivityService $activityService,
        private AuditService $auditService,
        private NotificationService $notificationService
    ) {}

    /**
     * Admin changes a user's password.
     *
     * Performs the complete credential update workflow:
     * 1. Updates encrypted password
     * 2. Marks account as admin-managed
     * 3. Locks password recovery (optional)
     * 4. Stores who changed the password and when
     * 5. Increments password version
     * 6. Invalidates all active sessions (revokes all tokens)
     * 7. Removes remember tokens
     * 8. Records audit log
     * 9. Sends notification to affected user
     *
     * @param Request $request
     * @param User $user
     * @return JsonResponse
     */
    public function changePassword(Request $request, User $user): JsonResponse
    {
        try {
            $request->validate([
                'new_password' => [
                    'required',
                    'string',
                    'min:8',
                    'regex:/[A-Z]/',
                    'regex:/[a-z]/',
                    'regex:/[0-9]/',
                    'regex:/[@$!%*?&#]/',
                ],
                'force_logout' => 'sometimes|boolean',
                'disable_recovery' => 'sometimes|boolean',
            ]);

            $admin = $request->user();
            $forceLogout = $request->boolean('force_logout', true);
            $disableRecovery = $request->boolean('disable_recovery', true);

            // Prevent admin from changing their own password via this endpoint
            if ($admin->id === $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Use the regular password change feature to update your own password.',
                ], 422);
            }

            // Check if target user is resigned
            if (!$user->active && !$user->must_change_password) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot change password for a resigned user.',
                ], 422);
            }

            // Update password
            $user->password = bcrypt($request->new_password);

            // Mark as admin-managed
            $user->credentials_managed_by_admin = true;

            // Lock password recovery if requested
            if ($disableRecovery) {
                $user->password_reset_locked = true;
            }

            // Store audit fields
            $user->password_changed_by = $admin->id;
            $user->password_changed_at = now();

            // Increment password version
            $user->password_version = ($user->password_version ?? 1) + 1;

            $user->save();

            // Record change in UserChange table
            \App\Models\UserChange::create([
                'user_id' => $user->id,
                'field_name' => 'password',
                'old_value' => '(hidden)',
                'new_value' => '(changed by admin)',
                'modified_by' => $admin->id,
            ]);

            // Invalidate all sessions - revoke all Sanctum tokens
            $sessionsTerminated = 0;
            if ($forceLogout) {
                $sessionsTerminated = $user->tokens()->count();
                $user->tokens()->delete();

                // Clear remember token
                $user->remember_token = null;
                $user->save();
            }

            // Send in-app notification to the affected user
            $this->notificationService->notify(
                userId: $user->id,
                senderId: $admin->id,
                type: 'password_changed_by_admin',
                module: 'auth',
                relatedId: $user->id,
                title: 'Password Updated by Administrator',
                message: 'Your account password has been updated by your administrator. If you did not expect this change, please contact your administrator.',
                link: null
            );

            // Send email notification to the user
            if ($user->professional_email) {
                try {
                    Mail::to($user->professional_email)->queue(new PasswordChangedMail($user));
                } catch (\Throwable $e) {
                    \Log::error('Failed to send password changed email', [
                        'user_id' => $user->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            // Send confirmation email to admin
            $this->notificationService->confirmAction(
                $admin,
                'Password Changed',
                'user',
                $user->name,
                [
                    'User Email' => $user->professional_email ?? $user->email,
                    'Recovery Disabled' => $disableRecovery ? 'Yes' : 'No',
                    'Sessions Terminated' => $sessionsTerminated,
                ]
            );

            // Audit log
            try {
                $this->auditService->log(
                    module: 'credential_management',
                    action: 'admin_password_change',
                    description: "Admin {$admin->name} changed password for user {$user->name}",
                    user: $admin,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: [
                        'password_version' => ($user->password_version ?? 1) - 1,
                        'credentials_managed_by_admin' => false,
                        'password_reset_locked' => false,
                    ],
                    newValues: [
                        'password_version' => $user->password_version,
                        'credentials_managed_by_admin' => true,
                        'password_reset_locked' => $disableRecovery,
                        'password_changed_by' => $admin->id,
                        'sessions_terminated' => $sessionsTerminated,
                    ],
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log credential audit', ['error' => $e->getMessage()]);
            }

            // Activity log
            try {
                $this->activityService->log(
                    userId: $admin->id,
                    activityType: 'credential_management',
                    description: "You changed the password for {$user->name}",
                    module: 'credential_management',
                    action: 'password_changed',
                    entityName: $user->name
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log credential activity', ['error' => $e->getMessage()]);
            }

            // Clear user cache
            Cache::forget("user_profile_{$user->id}");
            Cache::forget('all_users_list');

            return response()->json([
                'success' => true,
                'message' => "Password updated successfully for {$user->name}.",
                'password_version' => $user->password_version,
                'sessions_terminated' => $sessionsTerminated,
            ]);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&#).',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Admin password change failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Failed to change password. Please try again.',
            ], 500);
        }
    }

    /**
     * Admin unlocks password recovery for a user.
     *
     * Removes the password_reset_locked flag and optionally
     * clears the admin-managed credential restriction.
     *
     * @param Request $request
     * @param User $user
     * @return JsonResponse
     */
    public function unlockPasswordRecovery(Request $request, User $user): JsonResponse
    {
        try {
            $admin = $request->user();

            if ($admin->id === $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot modify your own recovery settings from this endpoint.',
                ], 422);
            }

            if (!$user->password_reset_locked && !$user->credentials_managed_by_admin) {
                return response()->json([
                    'success' => false,
                    'message' => 'Password recovery is already enabled for this user.',
                ], 422);
            }

            $oldValues = [
                'password_reset_locked' => $user->password_reset_locked,
                'credentials_managed_by_admin' => $user->credentials_managed_by_admin,
            ];

            $user->password_reset_locked = false;
            $user->credentials_managed_by_admin = false;
            $user->save();

            // Audit log
            try {
                $this->auditService->log(
                    module: 'credential_management',
                    action: 'unlock_password_recovery',
                    description: "Admin {$admin->name} unlocked password recovery for user {$user->name}",
                    user: $admin,
                    entityType: 'User',
                    entityId: $user->id,
                    oldValues: $oldValues,
                    newValues: [
                        'password_reset_locked' => false,
                        'credentials_managed_by_admin' => false,
                    ],
                    status: 'success'
                );
            } catch (\Throwable $e) {
                \Log::error('Failed to log credential audit', ['error' => $e->getMessage()]);
            }

            // Notification to user
            $this->notificationService->notify(
                userId: $user->id,
                senderId: $admin->id,
                type: 'password_recovery_unlocked',
                module: 'auth',
                relatedId: $user->id,
                title: 'Password Recovery Enabled',
                message: 'Password recovery has been re-enabled for your account. You can now use the Forgot Password feature.',
                link: null
            );

            // Clear cache
            Cache::forget("user_profile_{$user->id}");
            Cache::forget('all_users_list');

            return response()->json([
                'success' => true,
                'message' => "Password recovery unlocked for {$user->name}.",
            ]);

        } catch (\Throwable $e) {
            \Log::error('Unlock password recovery failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to unlock password recovery. Please try again.',
            ], 500);
        }
    }

    /**
     * Get credential management status for a user.
     *
     * @param User $user
     * @return JsonResponse
     */
    public function getCredentialStatus(User $user): JsonResponse
    {
        $changedBy = null;
        if ($user->password_changed_by) {
            $changer = User::select('id', 'name', 'email')->find($user->password_changed_by);
            $changedBy = $changer ? $changer->toArray() : null;
        }

        return response()->json([
            'success' => true,
            'credential_status' => [
                'credentials_managed_by_admin' => $user->credentials_managed_by_admin,
                'password_reset_locked' => $user->password_reset_locked,
                'password_changed_by' => $changedBy,
                'password_changed_at' => $user->password_changed_at?->toDateTimeString(),
                'password_version' => $user->password_version ?? 1,
            ],
        ]);
    }
}
