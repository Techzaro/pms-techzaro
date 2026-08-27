<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetMail;
use App\Models\User;
use App\Models\Master\Organization as MasterOrganization;
use Carbon\Carbon;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordResetController extends Controller
{
    /**
     * Handle a password reset request.
     *
     * Validates the email, resolves tenant if needed, checks user active status,
     * generates a secure reset token, and queues the reset email.
     *
     * @param  Request  $request  Input: email (required).
     * @return JsonResponse JSON response.
     */
    public function forgotPassword(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
            ]);

            $inputEmail = Str::lower(trim((string) $request->input('email')));
            $throttleKey = 'forgot-password|' . $inputEmail . '|' . $request->ip();

            if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
                $seconds = RateLimiter::availableIn($throttleKey);
                $minutes = max(1, (int) ceil($seconds / 60));
                $unit = $minutes === 1 ? 'minute' : 'minutes';

                return response()->json([
                    'success' => false,
                    'message' => "Too many password reset requests. Please try again in {$minutes} {$unit}.",
                ], 429);
            }

            \Log::info('Password reset requested', ['email' => $inputEmail]);

            // 1. Try finding user on current active DB connection
            $user = User::where('professional_email', $inputEmail)
                ->orWhere('email', $inputEmail)
                ->orWhere('personal_email', $inputEmail)
                ->first();

            // 2. If not found, attempt cross-tenant DB lookup
            if (! $user) {
                $crossTenant = $this->findUserAcrossTenants($inputEmail);
                if ($crossTenant) {
                    $user = $crossTenant['user'];
                }
            }

            if (! $user) {
                RateLimiter::hit($throttleKey, 900);
                \Log::info('Password reset: user not found', ['email' => $inputEmail]);

                return response()->json([
                    'success' => false,
                    'code' => 'EMAIL_NOT_FOUND',
                    'message' => 'This email is not registered in our system or has been removed. Please contact our support team for assistance.',
                ], 404);
            }

            // Check if user account is inactive/deactivated
            if (isset($user->active) && ! $user->active) {
                RateLimiter::hit($throttleKey, 900);
                \Log::info('Password reset: user account inactive', ['user_id' => $user->id, 'email' => $inputEmail]);

                return response()->json([
                    'success' => false,
                    'code' => 'ACCOUNT_INACTIVE',
                    'message' => 'This account has been deactivated. Please contact our support team for assistance.',
                ], 403);
            }

            // Check if password recovery is locked by admin
            if ($user->password_reset_locked) {
                RateLimiter::hit($throttleKey, 900);
                \Log::info('Password reset: recovery locked by admin', ['user_id' => $user->id]);

                return response()->json([
                    'success' => false,
                    'code' => 'PASSWORD_RESET_DISABLED',
                    'message' => 'Your password has been changed by your administrator. Password recovery has been disabled for your account. Please contact your administrator to regain access.',
                ], 403);
            }

            $sendTo = $user->professional_email ?: $user->personal_email ?: $user->email;
            if (empty($sendTo)) {
                return response()->json([
                    'success' => false,
                    'message' => 'No email configured for this account. Please contact admin.',
                ], 422);
            }

            RateLimiter::clear($throttleKey);
            $token = Str::random(64);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $sendTo],
                [
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]
            );

            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $resetUrl = rtrim($frontendUrl, '/') . '/reset-password?token=' . $token . '&email=' . urlencode($sendTo);

            \Log::info('Password reset: sending email', [
                'user_id' => $user->id,
                'send_to' => $sendTo,
            ]);

            try {
                Mail::to($sendTo)->send(new PasswordResetMail($user, $resetUrl, $token));
                \Log::info('Password reset: email sent successfully', ['send_to' => $sendTo]);
            } catch (\Throwable $mailException) {
                \Log::error('Password reset: SMTP send failed', [
                    'send_to' => $sendTo,
                    'error' => $mailException->getMessage(),
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

            $email = Str::lower(trim((string) $request->input('email')));
            $token = $request->input('token');
            $password = $request->input('password');

            // 1. Try finding token in current DB connection
            $record = DB::table('password_reset_tokens')->where('email', $email)->first();

            // 2. If not found, attempt cross-tenant DB switch
            if (! $record) {
                $crossTenant = $this->findUserAcrossTenants($email);
                if ($crossTenant) {
                    $record = DB::table('password_reset_tokens')->where('email', $email)->first();
                }
            }

            if (! $record || ! Hash::check($token, $record->token)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            $tokenCreatedAt = Carbon::parse($record->created_at);
            if ($tokenCreatedAt->diffInMinutes(now()) > config('auth.passwords.users.expire', 60)) {
                DB::table('password_reset_tokens')->where('email', $email)->delete();

                return response()->json([
                    'success' => false,
                    'message' => 'Reset token has expired. Please request a new one.',
                ], 422);
            }

            $user = User::where('professional_email', $email)
                ->orWhere('email', $email)
                ->orWhere('personal_email', $email)
                ->first();

            if (! $user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            // Check if password recovery is locked by admin
            if ($user->password_reset_locked) {
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

            DB::table('password_reset_tokens')->where('email', $email)->delete();

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
            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }

    /**
     * Search for a user across all active tenant databases securely.
     *
     * @param string $email
     * @return array|null Returns ['user' => User, 'slug' => string, 'organization' => Organization] or null.
     */
    private function findUserAcrossTenants(string $email): ?array
    {
        $email = Str::lower(trim($email));

        try {
            $orgs = MasterOrganization::where('status', '!=', 'deleted')
                ->whereNotIn('status', ['suspended', 'archived'])
                ->orderByRaw('CASE WHEN LOWER(admin_email) = ? THEN 0 ELSE 1 END', [$email])
                ->orderByDesc('id')
                ->get();

            foreach ($orgs as $org) {
                try {
                    $dbName = $org->database_name;
                    if (! $dbName) continue;

                    $host = $org->database_host ?: config('database.connections.mysql_master.host', '127.0.0.1');
                    $port = (int) ($org->database_port ?: config('database.connections.mysql_master.port', 3306));
                    $username = $org->database_username ?: config('database.connections.mysql_master.username', 'root');
                    $dbPassword = $org->database_password ?? config('database.connections.mysql_master.password', '');

                    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
                    $pdo = new \PDO($dsn, $username, $dbPassword, [
                        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                        \PDO::ATTR_TIMEOUT => 2,
                    ]);

                    $stmt = $pdo->prepare(
                        "SELECT id FROM `users` WHERE LOWER(professional_email) = ? OR LOWER(email) = ? OR LOWER(personal_email) = ? LIMIT 1"
                    );
                    $stmt->execute([$email, $email, $email]);
                    $foundUserRow = $stmt->fetch(\PDO::FETCH_OBJ);
                    $pdo = null;

                    if (! $foundUserRow) {
                        continue;
                    }

                    config()->set('database.connections.mysql.host', $host);
                    config()->set('database.connections.mysql.port', $port);
                    config()->set('database.connections.mysql.database', $dbName);
                    config()->set('database.connections.mysql.username', $username);
                    config()->set('database.connections.mysql.password', $dbPassword);
                    DB::purge('mysql');
                    DB::reconnect('mysql');

                    $user = User::on('mysql')
                        ->where('professional_email', $email)
                        ->orWhere('email', $email)
                        ->orWhere('personal_email', $email)
                        ->first();

                    if ($user) {
                        return ['user' => $user, 'slug' => $org->slug, 'organization' => $org];
                    }
                } catch (\Throwable $e) {
                    \Log::warning("PasswordReset tenant search failed for {$org->slug}: " . $e->getMessage());
                    continue;
                }
            }
        } catch (\Throwable $e) {
            \Log::warning("PasswordReset master DB query failed: " . $e->getMessage());
        }

        return null;
    }
}
