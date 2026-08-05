<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationTrialSetting;

/**
 * Resolves trial configuration for an organization.
 *
 * Priority:
 * 1. Organization-specific trial override (organization_trial_settings)
 * 2. Global/default trial configuration from the plan (organization_plans)
 */
class TrialResolverService
{
    /**
     * Get the effective trial configuration for an organization.
     *
     * Returns an array with:
     *   is_custom   — whether this is an org-specific override
     *   source      — 'organization' or 'default'
     *   trial_duration
     *   trial_duration_unit
     *   max_users
     *   max_projects
     *   max_storage_gb
     *   trial_label — human-readable label
     *   trial_minutes — duration in minutes
     */
    public function resolve(Organization $organization): ?array
    {
        // Get plan from subscription (already eager-loaded by controller)
        $plan = $organization->subscription?->plan ?? $organization->plan;

        if (!$plan) {
            return null;
        }

        // Only return trial config for trial plans
        if ($plan->slug !== 'trial') {
            return null;
        }

        // Check for org-specific override
        $orgSetting = $organization->trialSetting;

        if ($orgSetting) {
            return [
                'is_custom'           => true,
                'source'              => 'organization',
                'trial_duration'      => $orgSetting->trial_duration,
                'trial_duration_unit' => $orgSetting->trial_duration_unit,
                'max_users'           => $orgSetting->max_users,
                'max_projects'        => $orgSetting->max_projects,
                'max_storage_gb'      => $orgSetting->max_storage_gb,
                'trial_label'         => $orgSetting->getTrialLabel(),
                'trial_minutes'       => $orgSetting->getTrialMinutes(),
            ];
        }

        // Fall back to global plan defaults
        return $this->defaultsFromPlan($plan);
    }

    /**
     * Get the global/default trial configuration from the plan.
     */
    public function getGlobalDefault(?OrganizationPlan $plan = null): array
    {
        return $this->defaultsFromPlan($plan);
    }

    /**
     * Create or update an organization's trial override.
     */
    public function setOverride(Organization $organization, array $data): OrganizationTrialSetting
    {
        return OrganizationTrialSetting::updateOrCreate(
            ['organization_id' => $organization->id],
            [
                'trial_duration'      => $data['trial_duration'],
                'trial_duration_unit' => $data['trial_duration_unit'],
                'max_users'           => $data['max_users'],
                'max_projects'        => $data['max_projects'],
                'max_storage_gb'      => $data['max_storage_gb'],
            ]
        );
    }

    /**
     * Remove an organization's trial override (reset to default).
     */
    public function resetToDefault(Organization $organization): bool
    {
        return (bool) OrganizationTrialSetting::where('organization_id', $organization->id)->delete();
    }

    /**
     * Check if an organization has a custom trial override.
     */
    public function hasOverride(Organization $organization): bool
    {
        return OrganizationTrialSetting::where('organization_id', $organization->id)->exists();
    }

    /**
     * Convert trial duration + unit to minutes.
     */
    public function resolveTrialMinutes(int $duration, string $unit): int
    {
        return match ($unit) {
            'minutes' => $duration,
            'hours'   => $duration * 60,
            'days'    => $duration * 24 * 60,
            default   => $duration * 24 * 60,
        };
    }

    /*
    |------------------------------------------------------------------
    | Private
    |------------------------------------------------------------------
    */

    private function defaultsFromPlan(?OrganizationPlan $plan): array
    {
        if (!$plan) {
            return [
                'is_custom'           => false,
                'source'              => 'default',
                'trial_duration'      => 14,
                'trial_duration_unit' => 'days',
                'max_users'           => 5,
                'max_projects'        => 5,
                'max_storage_gb'      => 5,
                'trial_label'         => '14 days',
                'trial_minutes'       => 14 * 24 * 60,
            ];
        }

        $minutes = $plan->getTrialMinutes();

        return [
            'is_custom'           => false,
            'source'              => 'default',
            'trial_duration'      => $plan->trial_duration,
            'trial_duration_unit' => $plan->trial_duration_unit,
            'max_users'           => $plan->max_users,
            'max_projects'        => $plan->max_projects,
            'max_storage_gb'      => $plan->max_storage_gb,
            'trial_label'         => $plan->getTrialLabel(),
            'trial_minutes'       => $minutes,
        ];
    }
}
