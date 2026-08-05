<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\SaasModule;
use Illuminate\Support\Collection;

/**
 * ModuleService.
 *
 * Responsible ONLY for module access logic:
 * - Check if an organization has access to a module
 * - Get all enabled modules for an organization
 * - Owner organizations bypass all module restrictions
 *
 * Does not handle organization CRUD, subscriptions, or database operations.
 */
class ModuleService
{
    /**
     * Check if an organization has access to a specific module.
     *
     * Owner organizations always have access to all modules.
     */
    public function hasAccess(Organization $organization, string $moduleSlug): bool
    {
        // Owner bypass: unlimited access
        if ($organization->type === 'owner') {
            return true;
        }

        $subscription = $organization->subscription;
        if (!$subscription || !$subscription->isActive()) {
            return false;
        }

        $plan = $subscription->plan;
        if (!$plan) {
            return false;
        }

        return $plan->modules()
            ->where('slug', $moduleSlug)
            ->where('is_active', true)
            ->wherePivot('is_enabled', true)
            ->exists();
    }

    /**
     * Get all modules enabled for an organization.
     *
     * Owner organizations get all active modules.
     */
    public function getEnabled(Organization $organization): Collection
    {
        // Owner bypass: all active modules
        if ($organization->type === 'owner') {
            return SaasModule::where('is_active', true)
                ->orderBy('sort_order')
                ->get();
        }

        $subscription = $organization->subscription;
        if (!$subscription || !$subscription->plan) {
            return collect();
        }

        return $subscription->plan->modules
            ->where('is_active', true)
            ->filter(fn ($module) => $module->pivot->is_enabled)
            ->values();
    }

    /**
     * Get all available modules (for display purposes).
     */
    public function getAll(): Collection
    {
        return SaasModule::orderBy('sort_order')->get();
    }
}
