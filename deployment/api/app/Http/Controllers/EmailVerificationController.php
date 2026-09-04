<?php

namespace App\Http\Controllers;

use App\Models\EmailIdentity;
use App\Models\User;
use App\Mail\EmailVerificationMail;
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
