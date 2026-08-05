<?php

namespace App\Services\Saas\Provisioning;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Services\Saas\SubscriptionService;
use Illuminate\Support\Facades\Log;

/**
 * PlanAssigner.
 *
 * Assigns subscription plans to organizations during provisioning.
 * Owner organizations bypass plan limits.
 * Standard organizations must follow plan rules.
 */
class PlanAssigner
{
    public function __construct(
        protected SubscriptionService $subscriptions,
    ) {}

    /**
     * Assign a plan to an organization.
     *
     * @param Organization $organization The organization.
     * @param string|null $planSlug The plan slug (e.g., "standard"). Null = default plan.
     * @param string $billingPeriod The billing period (monthly/yearly).
     *
     * @return \App\Models\Master\OrganizationSubscription|null
     * @throws \RuntimeException If the plan is not found.
     */
    public function assign(
        Organization $organization,
        ?string $planSlug = null,
        string $billingPeriod = 'monthly',
    ): ?\App\Models\Master\OrganizationSubscription {
        // Owner type skips plan assignment
        if ($organization->isOwner()) {
            Log::info("Organization '{$organization->slug}' is owner type. Skipping plan assignment.");
            return null;
        }

        if ($planSlug) {
            $plan = OrganizationPlan::where('slug', $planSlug)
                ->where('is_active', true)
                ->first();

            if (!$plan) {
                throw new \RuntimeException("Plan '{$planSlug}' not found or is inactive.");
            }
        } else {
            $plan = OrganizationPlan::where('is_default', true)->first();
            if (!$plan) {
                $plan = OrganizationPlan::where('is_active', true)->orderBy('sort_order')->first();
            }
            if (!$plan) {
                Log::warning("No plans found in the system. Skipping plan assignment for organization: {$organization->slug}");
                return null;
            }
        }

        $subscription = $this->subscriptions->assignPlan($organization, $plan, $billingPeriod);

        Log::info("Plan '{$plan->name}' assigned to organization: {$organization->slug} (subscription ID: {$subscription->id})");

        return $subscription;
    }

    /**
     * Get available plans.
     */
    public function getAvailablePlans(): \Illuminate\Database\Eloquent\Collection
    {
        return OrganizationPlan::where('is_active', true)
            ->orderBy('sort_order')
            ->get();
    }
}
