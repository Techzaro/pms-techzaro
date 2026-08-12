<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetMail;
use App\Mail\PasswordChangedMail;
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

class SuperAdminAuthController extends Controller
{
    /**
     * Authenticate a super admin user from the master DB.
     * Completely independent of any tenant database.
     */
    public function login(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'password' => 'required',
            ]);

            $throttleKey = 'super_admin|' . Str::lower(trim($request->email)) . '|' . $request->ip();

            if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
                $seconds = RateLimiter::availableIn($throttleKey);
                $minutes = max(1, (int) ceil($seconds / 60));
                $unit = $minutes === 1 ? 'minute' : 'minutes';

                return response()->json([
                    'success' => false,
                    'message' => "Too many failed login attempts. Please try again in {$minutes} {$unit}.",
                ], 429);
            }

            $email = $request->input('email');
            $plainPassword = $request->input('password');

            // Find user in master DB super_admin_users table
            $row = DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('email', $email)
                ->where('active', 1)
                ->first();

            if (!$row || !Hash::check($plainPassword, $row->password)) {
                RateLimiter::hit($throttleKey, 900);
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid Email or Password',
                ], 401);
            }

            RateLimiter::clear($throttleKey);

            // Handle remember_me
            $rememberMe = $request->boolean('remember_me');
            $expiresAt = $rememberMe ? now()->addDays(1) : now()->addHours(3);

            // Store token in MASTER DB
            $tokenName = 'super_admin_auth';
            $plainToken = Str::random(40);
            $tokenHash = hash('sha256', $plainToken);
            DB::connection('mysql_master')->table('personal_access_tokens')->insert([
                'tokenable_type' => 'App\\Models\\SuperAdminUser',
                'tokenable_id'   => $row->id,
                'name'           => $tokenName,
                'token'          => $tokenHash,
                'abilities'      => json_encode(['*']),
                'expires_at'     => $expiresAt,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            // Track last login
            DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('id', $row->id)
                ->update(['last_login_at' => now()]);

            return response()->json([
                'success' => true,
                'message' => 'Login successful',
                'token' => $plainToken,
                'role' => $row->role,
                'must_change_password' => (bool) $row->must_change_password,
                'remember_me' => $rememberMe,
                'expires_at' => $expiresAt->toISOString(),
                'user' => [
                    'id' => $row->id,
                    'name' => $row->name,
                    'email' => $row->email,
                    'role' => $row->role,
                    'active' => (bool) $row->active,
                    'must_change_password' => (bool) $row->must_change_password,
                ],
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide valid email and password.',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Super admin login failed', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again.',
            ], 500);
        }
    }

    /**
     * Log out the super admin by revoking the current access token.
     */
    public function logout(Request $request): JsonResponse
    {
        try {
            $token = $request->bearerToken();
            if ($token) {
                DB::connection('mysql_master')
                    ->table('personal_access_tokens')
                    ->where('token', hash('sha256', $token))
                    ->delete();
            }

            return response()->json([
                'success' => true,
                'message' => 'Logout successful',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => true,
                'message' => 'Logout successful',
            ]);
        }
    }

    /**
     * Handle super admin password reset request.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'email' => 'required|email',
            ]);

            $inputEmail = $request->input('email');

            $row = DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('email', $inputEmail)
                ->where('active', 1)
                ->first();

            if (!$row) {
                return response()->json([
                    'success' => false,
                    'message' => 'This email is not registered. Please contact administration.',
                ], 404);
            }

            $token = Str::random(64);

            DB::connection('mysql_master')->table('password_reset_tokens')->updateOrInsert(
                ['email' => $inputEmail],
                [
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]
            );

            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $resetUrl = $frontendUrl . '/super-admin/reset-password?token=' . $token . '&email=' . urlencode($inputEmail);

            $mailSent = false;
            try {
                $userName = $row->name;
                $html = $this->buildPasswordResetEmail($userName, $resetUrl, $token);
                Mail::send([], [], function ($msg) use ($inputEmail, $html) {
                    $msg->to($inputEmail)
                        ->subject('Password Reset Request — TechXaro PMS')
                        ->from(config('mail.from.address'), config('mail.from.name'))
                        ->html($html);
                });
                $mailSent = true;
            } catch (\Throwable $mailException) {
                \Log::error('Super admin password reset email failed', [
                    'send_to' => $inputEmail,
                    'error' => $mailException->getMessage(),
                ]);
            }

            $response = [
                'success' => true,
                'message' => 'A password reset link has been sent to your email.',
            ];

            return response()->json($response);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide a valid email address.',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Super admin forgot password failed', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }

    /**
     * Reset the super admin password using the provided token.
     */
    public function resetPassword(Request $request): JsonResponse
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

            $record = DB::connection('mysql_master')->table('password_reset_tokens')
                ->where('email', $email)
                ->first();

            if (!$record || !Hash::check($token, $record->token)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            $tokenCreatedAt = Carbon::parse($record->created_at);
            if ($tokenCreatedAt->diffInMinutes(now()) > config('auth.passwords.users.expire', 60)) {
                DB::connection('mysql_master')->table('password_reset_tokens')->where('email', $email)->delete();
                return response()->json([
                    'success' => false,
                    'message' => 'Reset token has expired. Please request a new one.',
                ], 422);
            }

            // Update password in master DB super_admin_users table
            $newHash = Hash::make($password);
            DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('email', $email)
                ->update([
                    'password' => $newHash,
                    'must_change_password' => 0,
                    'updated_at' => now(),
                ]);

            DB::connection('mysql_master')->table('password_reset_tokens')->where('email', $email)->delete();

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
            \Log::error('Super admin reset password failed', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }

    /**
     * Change super admin password while logged in.
     */
    public function changePassword(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'old_password' => 'required',
                'new_password' => ['required', 'string', 'min:8', 'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[@$!%*?&#]/'],
            ]);

            $user = $request->user();
            $email = $user->email ?? null;

            if (!$email) {
                return response()->json(['success' => false, 'message' => 'User email not found'], 422);
            }

            // Verify old password against master DB
            $row = DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('id', $user->id)
                ->first();

            if (!$row || !Hash::check($request->old_password, $row->password)) {
                return response()->json(['success' => false, 'message' => 'Current password is incorrect'], 422);
            }

            // Update password in master DB
            $newHash = Hash::make($request->new_password);
            DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('id', $user->id)
                ->update([
                    'password' => $newHash,
                    'updated_at' => now(),
                ]);

            // Revoke all other tokens
            $currentTokenHash = $request->bearerToken() ? hash('sha256', $request->bearerToken()) : null;
            $deleteQuery = DB::connection('mysql_master')
                ->table('personal_access_tokens')
                ->where('tokenable_type', 'App\\Models\\SuperAdminUser')
                ->where('tokenable_id', $user->id);
            if ($currentTokenHash) {
                $deleteQuery->where('token', '!=', $currentTokenHash);
            }
            $deleteQuery->delete();

            try {
                Mail::to($email)->send(new PasswordChangedMail($user));
            } catch (\Throwable $e) {
                \Log::warning('Failed to send password changed email', ['error' => $e->getMessage()]);
            }

            return response()->json(['success' => true, 'message' => 'Password updated successfully']);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.',
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Super admin change password failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Failed to update password'], 500);
        }
    }

    private function buildPasswordResetEmail(string $name, string $resetUrl, string $token): string
    {
        $name = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
                <tr>
                    <td align="center">
                        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

                            <!-- Header -->
                            <tr>
                                <td style="background-color:#2563eb;padding:36px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">TechXaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Super Admin Password Reset</p>
                                </td>
                            </tr>

                            <!-- Security Badge -->
                            <tr>
                                <td style="padding:28px 34px 0;">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="background-color:#f5f3ff;border:1px solid #7c3aed22;border-radius:20px;padding:5px 14px;">
                                                <span style="color:#7c3aed;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">&#128274; Password Reset</span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{$name}</strong>,</p>

                                    <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 20px;">We received a request to reset the password for your Super Admin account. Click the button below to create a new password:</p>

                                    <!-- Reset Button -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                        <tr>
                                            <td align="center">
                                                <table cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="background-color:#2563eb;border-radius:8px;">
                                                            <a href="{$resetUrl}" target="_blank"
                                                               style="display:inline-block;color:#ffffff;text-decoration:none;padding:16px 44px;font-size:16px;font-weight:600;letter-spacing:0.3px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
                                                                Reset Password
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Expiry Notice -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin-bottom:20px;">
                                        <tr>
                                            <td style="padding:16px 20px;">
                                                <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 6px;">&#9888; Important:</p>
                                                <p style="color:#92400e;font-size:13px;line-height:1.6;margin:0;">This password reset link is valid for <strong>60 minutes</strong>. If the link expires, you will need to request a new one.</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Security Note -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:16px 20px;">
                                                <p style="color:#166534;font-size:14px;font-weight:700;margin:0 0 6px;">&#128274; Security Notice</p>
                                                <p style="color:#166534;font-size:13px;line-height:1.6;margin:0;">If you did not request a password reset, please ignore this email. Your password will remain unchanged. For any security concerns, contact our support team.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="background-color:#f9fafb;padding:20px 34px;border-top:1px solid #e5e7eb;">
                                    <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">&copy; {$year} TechXaro. All rights reserved.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        HTML;
    }
}
