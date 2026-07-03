<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetMail;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordResetController extends Controller
{
    /**
     * Handle a password reset request.
     *
     * Validates the email, checks if the user exists and is active,
     * generates a secure reset token, and queues the reset email.
     * Returns a generic success message regardless of email existence
     * to prevent user enumeration attacks.
     *
     * @param  Request  $request  Input: email (required, valid professional email).
     * @return JsonResponse JSON response confirming email was sent.
     */
    public function forgotPassword(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
            ]);

            $professionalEmail = $request->input('email');

            \Log::info('Password reset requested', ['professional_email' => $professionalEmail]);

            // Look up user by professional_email (Outlook/cPanel email)
            $user = User::where('professional_email', $professionalEmail)->first();

            if (! $user || ! $user->active) {
                \Log::info('Password reset: user not found or inactive', ['professional_email' => $professionalEmail]);

                return response()->json([
                    'success' => true,
                    'message' => 'If an account with that email exists, a password reset link has been sent.',
                ]);
            }

            $token = Str::random(64);

            // Store token against professional_email (login email)
            \DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->professional_email],
                [
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]
            );

            $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));
            $resetUrl = $frontendUrl.'/reset-password?token='.$token.'&email='.urlencode($user->professional_email);

            // Send email to the professional email
            $sendTo = $user->professional_email;

            \Log::info('Password reset: sending email', [
                'user_id' => $user->id,
                'login_email' => $user->email,
                'professional_email' => $user->professional_email,
                'send_to' => $sendTo,
            ]);

            Mail::to($sendTo)->send(new PasswordResetMail($user, $resetUrl, $token));

            \Log::info('Password reset: email sent successfully', ['send_to' => $sendTo]);

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
            \Log::error('Password reset email failed', ['email' => $professionalEmail ?? null, 'error' => $e->getMessage()]);

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

            // Look up by professional_email (login email)
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

            $user = User::where('professional_email', $email)->first();

            if (! $user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid or expired reset token. Please request a new one.',
                ], 422);
            }

            $user->password = bcrypt($password);
            $user->must_change_password = false;
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
            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again later.',
            ], 500);
        }
    }
}
