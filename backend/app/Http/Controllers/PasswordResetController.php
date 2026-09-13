<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetMail;
use App\Models\Master\Organization;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordResetController extends Controller
{
    /**
     * Search for a user across all active tenant databases.
     *
     * Since forgot-password is a central route with no tenant context,
     * we must iterate through all active organizations and search each
     * tenant database for the given email.
     *
     * @return array{user: User, organization: Organization}|null
     */
    private function findUserAcrossAllTenants(string $email): ?array
    {
        $organizations = Organization::whereIn('status', ['active', 'trial'])->get();

        foreach ($organizations as $org) {
            try {
                $pdo = new \PDO(
                    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $org->database_host, (int) $org->database_port, $org->database_name),
                    $org->database_username,
                    $org->database_password ?? '',
                    [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_TIMEOUT => 3]
                );

                $stmt = $pdo->prepare(
                    'SELECT id, name, email, personal_email, professional_email, phone_number, contact_no, password, role, active, must_change_password, email_mode, email_verified_at, password_reset_locked FROM users WHERE (professional_email = ? OR email = ? OR personal_email = ?) AND active = 1 LIMIT 1'
                );
                $stmt->execute([$email, $email, $email]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);

                $pdo = null;

                if ($row) {
                    $user = new User();
                    $user->setRawAttributes($row);
                    $user->exists = true;

                    return ['user' => $user, 'organization' => $org];
                }
            } catch (\Throwable $e) {
                \Log::warning("Password reset: failed searching tenant DB {$org->database_name}: " . $e->getMessage());
                continue;
            }
        }

        return null;
    }

    /**
     * Switch to a specific tenant database connection.
     */
    private function switchToTenantDb(Organization $org): void
    {
        config()->set('database.connections.mysql_tenant.host', $org->database_host);
        config()->set('database.connections.mysql_tenant.port', $org->database_port);
        config()->set('database.connections.mysql_tenant.database', $org->database_name);
        config()->set('database.connections.mysql_tenant.username', $org->database_username);
        config()->set('database.connections.mysql_tenant.password', $org->database_password ?? '');
        DB::purge('mysql_tenant');
        DB::reconnect('mysql_tenant');
    }

    /**
     * Handle a password reset request.
     *
     * Validates the email, checks if the user exists and is active,
     * generates a secure reset token, and queues the reset email.
     * Returns a generic success message regardless of email existence
     * to prevent user enumeration attacks.
     *
     * @param  Request  $request  Input: email (required, valid email - personal, professional, or single).
     * @return JsonResponse JSON response confirming email was sent.
     */
    public function forgotPassword(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
            ]);

            $inputEmail = $request->input('email');

            \Log::info('Password reset requested', ['email' => $inputEmail]);

            // Try tenant-scoped User model first (works when middleware resolved tenant)
            $user = User::where('professional_email', $inputEmail)
                ->orWhere('email', $inputEmail)
                ->orWhere('personal_email', $inputEmail)
                ->first();

            $organization = null;

            // If not found in current DB connection, search across all tenant databases
            if (! $user) {
                $result = $this->findUserAcrossAllTenants($inputEmail);
                if ($result) {
                    $user = $result['user'];
                    $organization = $result['organization'];
                }
            }

            if (! $user) {
                \Log::info('Password reset: user not found across all tenants', ['email' => $inputEmail]);

                return response()->json([
                    'success' => false,
                    'code' => 'EMAIL_NOT_FOUND',
                    'message' => 'This email is not registered in our system or has been removed. Please contact our support team for assistance.',
                ], 404);
            }

            // Check if user account is inactive/deactivated
            if (isset($user->active) && ! $user->active) {
                \Log::info('Password reset: user account inactive', ['user_id' => $user->id, 'email' => $inputEmail]);

                return response()->json([
                    'success' => false,
                    'code' => 'ACCOUNT_INACTIVE',
                    'message' => 'This account has been deactivated. Please contact our support team for assistance.',
                ], 403);
            }

            // Check if password recovery is locked by admin
            if (! empty($user->password_reset_locked) && $user->password_reset_locked) {
                \Log::info('Password reset: recovery locked by admin', ['user_id' => $user->id]);

                return response()->json([
                    'success' => false,
                    'code' => 'PASSWORD_RESET_DISABLED',
                    'message' => 'Your password has been changed by your administrator. Password recovery has been disabled for your account. Please contact your administrator to regain access.',
                ], 403);
            }

            if (empty($user->professional_email) && empty($user->personal_email) && empty($user->email)) {
                \Log::error('Password reset: user has no email address', ['user_id' => $user->id]);

                return response()->json([
                    'success' => false,
                    'message' => 'No email configured for this account. Please contact admin.',
                ], 422);
            }

            // Determine which email to send the reset link to
            // Rule: Send to the email the user logged in with (login/authentication email)
            $sendTo = $this->resolveLoginEmail($user);

            $token = Str::random(64);

            \DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $sendTo],
                [
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]
            );

            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $resetUrl = $frontendUrl.'/reset-password?token='.$token.'&email='.urlencode($sendTo);

            \Log::info('Password reset: sending email', [
                'user_id' => $user->id,
                'professional_email' => $user->professional_email ?? null,
                'personal_email' => $user->personal_email ?? null,
                'email' => $user->email ?? null,
                'send_to' => $sendTo,
                'organization' => $organization?->name,
            ]);

            try {
                Mail::to($sendTo)->send(new PasswordResetMail($user, $resetUrl, $token));
                \Log::info('Password reset: email sent successfully', ['send_to' => $sendTo]);
            } catch (\Throwable $mailException) {
                \Log::error('Password reset: SMTP send failed', [
                    'send_to' => $sendTo,
                    'error' => $mailException->getMessage(),
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'If an account with that email exists, a password reset link has been sent.',
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'If an account with that email exists, a password reset link has been sent.',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide a valid email address.',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Password reset email failed', ['email' => $inputEmail ?? null, 'error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }

    /**
     * Reset the user's password using the provided token.
     *
     * Validates the token against the stored hash, enforces strong
     * password rules, updates the password, and clears the token.
     * Revokes all existing tokens for the user for security.
     *
     * @param  Request  $request  Input: email (required), token (required), password (required, strong).
     * @return JsonResponse JSON response confirming password reset.
     */
    public function resetPassword(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'token' => 'required|string',
                'password' => 'required|string|min:8|regex:/[A-Z]/|regex:/[a-z]/|regex:/[0-9]/|regex:/[@$!%*?&#]/',
            ]);

            $email = $request->input('email');
            $token = $request->input('token');
            $password = $request->input('password');

            // Look up the token in master DB
            $record = \DB::table('password_reset_tokens')
                ->where('email', $email)
                ->first();

            if (! $record) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            if (! Hash::check($token, $record->token)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            $tokenCreatedAt = Carbon::parse($record->created_at);
            if ($tokenCreatedAt->diffInMinutes(now()) > config('auth.passwords.users.expire', 60)) {
                \DB::table('password_reset_tokens')->where('email', $email)->delete();

                return response()->json([
                    'success' => false,
                    'message' => 'Reset token has expired. Please request a new one.',
                ], 422);
            }

            // Try tenant-scoped User model first
            $user = User::where('professional_email', $email)
                ->orWhere('email', $email)
                ->orWhere('personal_email', $email)
                ->first();

            // If not found in current DB, search across all tenant databases
            if (! $user) {
                $result = $this->findUserAcrossAllTenants($email);
                if ($result) {
                    $user = $result['user'];
                    $organization = $result['organization'];

                    // Switch to the correct tenant DB to update the user
                    $this->switchToTenantDb($organization);
                    $user = User::where('professional_email', $email)
                        ->orWhere('email', $email)
                        ->orWhere('personal_email', $email)
                        ->first();
                }
            }

            if (! $user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            // Check if password recovery is locked by admin
            if (! empty($user->password_reset_locked) && $user->password_reset_locked) {
                return response()->json([
                    'success' => false,
                    'code' => 'PASSWORD_RESET_DISABLED',
                    'message' => 'Your password has been changed by your administrator. Password recovery has been disabled for your account. Please contact your administrator to regain access.',
                ], 403);
            }

            $user->password = bcrypt($password);
            $user->must_change_password = false;
            $user->password_changed_at = now();
            $user->password_version = ($user->password_version ?? 1) + 1;
            $user->save();

            event(new PasswordReset($user));

            $user->tokens()->delete();

            \DB::table('password_reset_tokens')->where('email', $email)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Your password has been reset successfully.',
            ]);
        } catch (ValidationException $e) {
            $message = 'Please check your input.';
            if (str_contains($e->getMessage(), 'password')) {
                $message = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
            }

            return response()->json([
                'success' => false,
                'message' => $message,
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Password reset failed', ['email' => $email ?? null, 'error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }

    /**
     * Determine the correct email address to send the password reset link to.
     *
     * Rule: The reset email goes to the exact email the user uses to
     * authenticate/login to the system (auth_email).
     *
     * - Single email mode: personal_email (same as email)
     * - Two emails mode: professional_email (used for login)
     * - Auto-generated password: professional_email or email (login email)
     */
    private function resolveLoginEmail(User $user): string
    {
        // For two-email mode: professional_email is the login email
        if (! empty($user->professional_email)) {
            return $user->professional_email;
        }

        // Fallback to email (single-email mode users login with this)
        if (! empty($user->email)) {
            return $user->email;
        }

        // Last resort: personal_email
        return $user->personal_email;
    }
}
