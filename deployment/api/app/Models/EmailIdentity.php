<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class EmailIdentity extends Model
{
    protected $fillable = [
        'normalized_email',
        'original_email',
        'user_id',
        'type',
        'verified',
        'verified_at',
        'verification_token',
    ];

    protected $casts = [
        'verified' => 'boolean',
        'verified_at' => 'datetime',
    ];

    protected $hidden = [
        'verification_token',
    ];

    /** The user who owns this email identity. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Check if a given email is globally unique across the entire ERP.
     * Checks both the users table (email, personal_email, professional_email)
     * and the email_identities table.
     */
    public static function isEmailGloballyUnique(string $email, ?int $excludeUserId = null): bool
    {
        $normalized = self::normalizeEmail($email);

        // Check against users table columns
        $query = \App\Models\User::where(function ($q) use ($normalized) {
            $q->whereRaw('LOWER(email) = ?', [$normalized])
              ->orWhereRaw('LOWER(personal_email) = ?', [$normalized])
              ->orWhereRaw('LOWER(professional_email) = ?', [$normalized]);
        });

        if ($excludeUserId) {
            $query->where('id', '!=', $excludeUserId);
        }

        if ($query->exists()) {
            return false;
        }

        // Check against email_identities table
        $identityQuery = self::where('normalized_email', $normalized);
        if ($excludeUserId) {
            $identityQuery->where('user_id', '!=', $excludeUserId);
        }

        if ($identityQuery->exists()) {
            return false;
        }

        return true;
    }

    /**
     * Register an email address as belonging to a user.
     * Creates the email_identities record and ensures global uniqueness.
     *
     * @throws \Exception If email is already registered by another user.
     */
    public static function registerEmail(int $userId, string $email, string $type = 'primary', bool $verified = false): self
    {
        $normalized = self::normalizeEmail($email);

        if (!self::isEmailGloballyUnique($email, $userId)) {
            throw new \Exception("The email address '{$email}' is already registered in the system.");
        }

        return self::create([
            'normalized_email' => $normalized,
            'original_email' => $email,
            'user_id' => $userId,
            'type' => $type,
            'verified' => $verified,
            'verified_at' => $verified ? now() : null,
            'verification_token' => $verified ? null : Str::random(64),
        ]);
    }

    /**
     * Verify an email identity using its verification token.
     */
    public static function verifyByToken(string $token): ?self
    {
        $identity = self::where('verification_token', $token)->first();
        if ($identity) {
            $identity->update([
                'verified' => true,
                'verified_at' => now(),
                'verification_token' => null,
            ]);

            // Also update the corresponding column on the user
            $user = $identity->user;
            if ($user) {
                if ($identity->type === 'personal' || $identity->type === 'primary') {
                    $user->personal_email_verified_at = now();
                    if ($identity->type === 'primary' && !$user->email_verified_at) {
                        $user->email_verified_at = now();
                    }
                }
                if ($identity->type === 'professional') {
                    $user->professional_email_verified_at = now();
                    if (!$user->email_verified_at) {
                        $user->email_verified_at = now();
                    }
                }
                $user->save();
            }
        }
        return $identity;
    }

    /**
     * Normalize an email address for uniqueness comparison.
     */
    public static function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }
}
