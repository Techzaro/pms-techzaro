<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\OrganizationTrialSetting;
use Illuminate\Support\Facades\DB;

/**
 * EntitlementService.
 *
 * Centralized service for resolving an organization's effective plan limits
 * and checking whether resource creation is allowed.
 *
 * Effective limit resolution order:
 * 1. Organization's active subscription
 * 2. Subscription's plan default limits
 * 3. Custom overrides on the subscription (is_custom + custom_max_*)
 * 4. Trial-specific overrides (OrganizationTrialSetting) for trial plans
 *
 * Owner organizations bypass all limits.
 */
class EntitlementService
{
    /**
     * Get the effective entitlements for an organization.
     *
     * Returns an array with limits, current usage, and whether the org is the owner.
     */
    public function getEntitlements(Organization $organization): array
    {
        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $organization->id)
            ->with('plan')
            ->latest()
            ->first();

        $isOwner = $organization->isOwner();

        if (!$subscription || !$subscription->plan) {
            return [
                'is_owner'       => $isOwner,
                'max_users'      => -1,
                'max_projects'   => -1,
                'max_storage_gb' => 10,
                'storage_unit'   => 'GB',
                'current_users'      => $this->countUsers($organization),
                'current_projects'   => $this->countProjects($organization),
                'current_storage_gb' => $this->calculateStorageUsage($organization),
            ];
        }

        $plan = $subscription->plan;

        // Start with plan defaults, then apply custom overrides
        $maxUsers = $plan->max_users;
        $maxProjects = $plan->max_projects;
        $maxStorage = $plan->max_storage_gb;
        $storageUnit = $plan->storage_unit ?? 'GB';

        if ($subscription->is_custom) {
            $maxUsers = $subscription->custom_max_users ?? $maxUsers;
            $maxProjects = $subscription->custom_max_projects ?? $maxProjects;
            $maxStorage = $subscription->custom_max_storage_gb ?? $maxStorage;
            $storageUnit = $subscription->storage_unit ?? $storageUnit;
        }

        // For trial plans, apply trial-specific overrides if they exist
        if ($plan->slug === 'trial') {
            $trialSetting = OrganizationTrialSetting::on('mysql_master')
                ->where('organization_id', $organization->id)
                ->first();

            if ($trialSetting) {
                $maxUsers = $trialSetting->max_users;
                $maxProjects = $trialSetting->max_projects;
                $maxStorage = $trialSetting->max_storage_gb;
                $storageUnit = $trialSetting->storage_unit ?? $storageUnit;
            }
        }

        return [
            'is_owner'       => $isOwner,
            'max_users'      => $maxUsers,
            'max_projects'   => $maxProjects,
            'max_storage_gb' => $maxStorage,
            'storage_unit'   => $storageUnit,
            'current_users'      => $this->countUsers($organization),
            'current_projects'   => $this->countProjects($organization),
            'current_storage_gb' => $this->calculateStorageUsage($organization),
        ];
    }

    /**
     * Check if the organization can create a new user.
     *
     * @return array{allowed: bool, limit: int, current: int, remaining: int|null, message: string|null}
     */
    public function canCreateUser(Organization $organization): array
    {
        $entitlements = $this->getEntitlements($organization);

        if ($entitlements['is_owner']) {
            return $this->allowed('users', $entitlements);
        }

        $limit = $entitlements['max_users'];
        $current = $entitlements['current_users'];

        // -1 or 9999 means unlimited
        if ($limit <= 0 || $limit >= 9999) {
            return $this->allowed('users', $entitlements);
        }

        if ($current >= $limit) {
            return [
                'allowed'   => false,
                'resource'  => 'users',
                'limit'     => $limit,
                'current'   => $current,
                'remaining' => 0,
                'message'   => "User limit reached ({$current}/{$limit}). Upgrade your plan to add more users.",
            ];
        }

        return $this->allowed('users', $entitlements);
    }

    /**
     * Check if the organization can create a new project.
     *
     * @return array{allowed: bool, limit: int, current: int, remaining: int|null, message: string|null}
     */
    public function canCreateProject(Organization $organization): array
    {
        $entitlements = $this->getEntitlements($organization);

        if ($entitlements['is_owner']) {
            return $this->allowed('projects', $entitlements);
        }

        $limit = $entitlements['max_projects'];
        $current = $entitlements['current_projects'];

        if ($limit <= 0 || $limit >= 9999) {
            return $this->allowed('projects', $entitlements);
        }

        if ($current >= $limit) {
            return [
                'allowed'   => false,
                'resource'  => 'projects',
                'limit'     => $limit,
                'current'   => $current,
                'remaining' => 0,
                'message'   => "Project limit reached ({$current}/{$limit}). Upgrade your plan to add more projects.",
            ];
        }

        return $this->allowed('projects', $entitlements);
    }

    /**
     * Check if the organization can create a new team.
     *
     * Teams are not currently limited by plan, so this always allows.
     * Provided for future extensibility.
     */
    public function canCreateTeam(Organization $organization): array
    {
        return [
            'allowed'   => true,
            'resource'  => 'teams',
            'limit'     => -1,
            'current'   => 0,
            'remaining' => null,
            'message'   => null,
        ];
    }

    /**
     * Build a standard "allowed" response with entitlement context.
     */
    private function allowed(string $resource, array $entitlements): array
    {
        $limitKey = "max_{$resource}";
        $currentKey = "current_{$resource}";
        $limit = $entitlements[$limitKey] ?? -1;
        $current = $entitlements[$currentKey] ?? 0;
        $isUnlimited = $limit <= 0 || $limit >= 9999;

        return [
            'allowed'   => true,
            'resource'  => $resource,
            'limit'     => $limit,
            'current'   => $current,
            'remaining' => $isUnlimited ? null : max(0, $limit - $current),
            'message'   => null,
        ];
    }

    /**
     * Count active users in the tenant database (excludes inactive/resigned/draft).
     */
    private function countUsers(Organization $organization): int
    {
        try {
            $dbName = $organization->database_name;
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$escaped}`.`users` WHERE `active` = 1");
            $stmt->execute();
            return (int) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            \Log::warning("Failed to count users for org {$organization->slug}: " . $e->getMessage());
            return 0;
        }
    }

    /**
     * Count all projects in the tenant database.
     */
    private function countProjects(Organization $organization): int
    {
        try {
            $dbName = $organization->database_name;
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$escaped}`.`projects`");
            $stmt->execute();
            return (int) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            \Log::warning("Failed to count projects for org {$organization->slug}: " . $e->getMessage());
            return 0;
        }
    }

    /**
     * Calculate total storage usage in GB for the organization.
     */
    private function calculateStorageUsage(Organization $organization): float
    {
        try {
            $totalBytes = \App\Models\Master\OrganizationStorageUsage::on('mysql_master')
                ->where('organization_id', $organization->id)
                ->sum('file_size_bytes');

            return round($totalBytes / (1024 * 1024 * 1024), 2);
        } catch (\Throwable $e) {
            \Log::warning("Failed to calculate storage for org {$organization->slug}: " . $e->getMessage());
            return 0.0;
        }
    }
}
