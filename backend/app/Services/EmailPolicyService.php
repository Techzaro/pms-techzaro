<?php

namespace App\Services;

use App\Models\User;
use App\Models\Master\Organization;

/**
 * Service for resolving email addresses based on organization email policy.
 *
 * Supports two policies:
 * - standard: Single email used for login, notifications, everything.
 * - company_required: Separate personal_email and professional_email (company email).
 */
class EmailPolicyService
{
    public const POLICY_STANDARD = 'standard';
    public const POLICY_COMPANY_REQUIRED = 'company_required';

    /**
     * Get the login email for a user.
     *
     * Standard policy: uses email column (the single email).
     * Company required policy: uses professional_email if set, otherwise email.
     */
    public static function getLoginEmail(User $user): string
    {
        $policy = self::getOrganizationEmailPolicy($user);

        if ($policy === self::POLICY_COMPANY_REQUIRED) {
            return $user->professional_email ?? $user->email;
        }

        return $user->email;
    }

    /**
     * Get the notification email for a user.
     *
     * Standard policy: uses email column.
     * Company required policy: uses professional_email if set, otherwise falls back to email.
     */
    public static function getNotificationEmail(User $user): string
    {
        $policy = self::getOrganizationEmailPolicy($user);

        if ($policy === self::POLICY_COMPANY_REQUIRED) {
            return $user->professional_email ?? $user->email;
        }

        return $user->email;
    }

    /**
     * Get the best available email for sending emails to a user.
     * Priority: professional_email > email > personal_email.
     */
    public static function getBestEmail(User $user): string
    {
        return $user->professional_email
            ?? $user->email
            ?? $user->personal_email
            ?? '';
    }

    /**
     * Determine if the organization requires separate company email.
     */
    public static function isCompanyRequired(User $user): bool
    {
        return self::getOrganizationEmailPolicy($user) === self::POLICY_COMPANY_REQUIRED;
    }

    /**
     * Get the email policy for the user's organization.
     * Falls back to 'standard' if cannot be determined.
     */
    public static function getOrganizationEmailPolicy(User $user): string
    {
        try {
            $org = self::resolveOrganization($user);
            return $org?->email_policy ?? self::POLICY_STANDARD;
        } catch (\Throwable $e) {
            return self::POLICY_STANDARD;
        }
    }

    /**
     * Resolve the organization for a given user.
     * In single-tenant mode, this may return null.
     */
    private static function resolveOrganization(User $user): ?Organization
    {
        $org = request()->attributes->get('currentOrganization');

        if ($org instanceof Organization) {
            return $org;
        }

        return null;
    }
}
