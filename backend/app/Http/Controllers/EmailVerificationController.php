<?php

namespace App\Http\Controllers;

use App\Models\EmailIdentity;
use App\Models\User;
use App\Mail\EmailVerificationMail;
use App\Mail\EmailVerificationCodeMail;
use App\Mail\SimpleWelcomeMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class EmailVerificationController extends Controller
{
    /**
     * Check if an email address is available (not used by any user).
     */
    public function checkAvailability(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = $request->input('email');
        $isAvailable = EmailIdentity::isEmailGloballyUnique($email);

        return response()->json([
            'success' => true,
            'available' => $isAvailable,
            'email' => $email,
        ]);
    }

    /**
     * Send 6-digit verification code to user's email.
     * Authenticated route — uses personal_email for two-email mode, email for single.
     */
    public function sendCode(Request $request): JsonResponse
    {
        $user = $request->user();

        if (is_null($user->email_mode) || !is_null($user->email_verified_at)) {
            return response()->json([
                'success' => false,
                'message' => 'Your email is already verified.',
            ], 422);
        }

        $email = $user->verification_email;
        if (!$email) {
            return response()->json([
                'success' => false,
                'message' => 'No email address found.',
            ], 404);
        }

        // Generate 6-digit code
        $code = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = now()->addMinutes(15);

        $user->update([
            'email_verification_code' => $code,
            'email_verification_expires_at' => $expiresAt,
        ]);

        // Send code via email
        try {
            Mail::to($email)->send(new EmailVerificationCodeMail($user, $code));
        } catch (\Throwable $e) {
            \Log::error('Failed to send verification code', [
                'user_id' => $user->id,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to ' . $email,
        ]);
    }

    /**
     * Verify the 6-digit code.
     */
    public function verifyCode(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'code' => 'required|string|size:6',
        ]);

        if ($user->email_verification_code !== $request->input('code')) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code.',
            ], 422);
        }

        if ($user->email_verification_expires_at && $user->email_verification_expires_at->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'Verification code has expired. Please request a new one.',
            ], 422);
        }

        $user->update([
            'email_verified_at' => now(),
            'email_verification_code' => null,
            'email_verification_expires_at' => null,
            'email_skip_until' => null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
        ]);
    }

    /**
     * Skip email verification for 7 days.
     */
    public function skipVerification(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->update([
            'email_skip_until' => now()->addDays(7),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email verification skipped for 7 days.',
            'skip_until' => $user->email_skip_until,
        ]);
    }

    /**
     * Check current verification status.
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        $hasEmailMode = !empty($user->email_mode);
        $isVerified = !is_null($user->email_verified_at);

        $skipUntil = null;
        $daysRemaining = null;
        if ($user->email_skip_until && $user->email_skip_until->isFuture()) {
            $skipUntil = $user->email_skip_until->toISOString();
            $daysRemaining = (int) ceil(now()->diffInHours($user->email_skip_until) / 24);
            if ($daysRemaining < 1) $daysRemaining = 1;
        }

        // show_banner: show whenever user is unverified + single email + not exempt
        // (even during skip period — banner displays countdown)
        $needsVerification = $user->needsEmailVerification();
        $shouldShowBanner = !$isVerified
            && $user->email_mode === 'single'
            && !$user->email_verification_exempt;

        return response()->json([
            'success' => true,
            'email_verified' => $isVerified,
            'needs_verification' => $needsVerification,
            'show_banner' => $shouldShowBanner,
            'email_mode' => $user->email_mode,
            'verification_email' => $user->verification_email,
            'skip_until' => $skipUntil,
            'days_remaining' => $daysRemaining,
        ]);
    }

    /**
     * Resend a verification email for the authenticated user's unverified emails.
     */
    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();
        $emailType = $request->input('type', 'authentication');

        if ($emailType === 'authentication') {
            if ($user->isAuthenticationEmailVerified()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Authentication email is already verified.',
                ], 422);
            }

            $email = $user->getAuthenticationEmailAttribute();
            $identityType = $user->usesTwoEmails() ? 'professional' : 'primary';
        } elseif ($emailType === 'personal') {
            if ($user->isPersonalEmailVerified()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Personal email is already verified.',
                ], 422);
            }
            $email = $user->personal_email;
            $identityType = 'personal';
        } else {
            return response()->json([
                'success' => false,
                'message' => 'Invalid email type.',
            ], 422);
        }

        if (!$email) {
            return response()->json([
                'success' => false,
                'message' => 'No email address found for the specified type.',
            ], 404);
        }

        // Find or create identity
        $normalized = EmailIdentity::normalizeEmail($email);
        $identity = EmailIdentity::where('normalized_email', $normalized)->first();

        if (!$identity) {
            $identity = EmailIdentity::create([
                'normalized_email' => $normalized,
                'original_email' => $email,
                'user_id' => $user->id,
                'type' => $identityType,
                'verified' => false,
                'verification_token' => Str::random(64),
            ]);
        }

        if ($identity->verified) {
            return response()->json([
                'success' => false,
                'message' => 'This email is already verified.',
            ], 422);
        }

        // Generate new token
        $identity->update(['verification_token' => Str::random(64)]);

        // Send verification email
        try {
            $verificationUrl = config('app.frontend_url') . '/verify-email?token=' . $identity->verification_token;
            Mail::to($email)->queue(new EmailVerificationMail($user, $verificationUrl));
        } catch (\Throwable $e) {
            \Log::error('Failed to send verification email', [
                'user_id' => $user->id,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Verification email sent to ' . $email,
        ]);
    }

    /**
     * Verify an email using the verification token (authenticated route).
     */
    public function verify(Request $request, string $token): JsonResponse
    {
        $identity = EmailIdentity::where('verification_token', $token)->first();

        if (!$identity) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification token.',
            ], 404);
        }

        if ($identity->user_id !== $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'This verification token does not belong to your account.',
            ], 403);
        }

        $identity->update([
            'verified' => true,
            'verified_at' => now(),
            'verification_token' => null,
        ]);

        // Update user verification columns
        $user = $identity->user;
        if ($user) {
            if ($identity->type === 'professional') {
                $user->professional_email_verified_at = now();
                if (!$user->email_verified_at) {
                    $user->email_verified_at = now();
                }
            } else {
                $user->personal_email_verified_at = now();
                if ($identity->type === 'primary' && !$user->email_verified_at) {
                    $user->email_verified_at = now();
                }
            }
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
            'email' => $identity->original_email,
            'type' => $identity->type,
        ]);
    }

    /**
     * Verify an email using the verification token (public route, no auth required).
     */
    public function verifyPublic(string $token): JsonResponse
    {
        $identity = EmailIdentity::where('verification_token', $token)->first();

        if (!$identity) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or expired verification token.',
            ], 404);
        }

        $identity->update([
            'verified' => true,
            'verified_at' => now(),
            'verification_token' => null,
        ]);

        // Update user verification columns
        $user = $identity->user;
        if ($user) {
            if ($identity->type === 'professional') {
                $user->professional_email_verified_at = now();
                if (!$user->email_verified_at) {
                    $user->email_verified_at = now();
                }
            } else {
                $user->personal_email_verified_at = now();
                if ($identity->type === 'primary' && !$user->email_verified_at) {
                    $user->email_verified_at = now();
                }
            }
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully. You can now log in.',
        ]);
    }
}
