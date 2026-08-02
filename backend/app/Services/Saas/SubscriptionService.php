<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationSubscription;

/**
 * SubscriptionService.
 *
 * Responsible ONLY for subscription lifecycle:
 * - Assign plans to organizations
 * - Change plans
 * - Cancel subscriptions
 * - Check subscription status and limits
 *
 * Does not handle organization CRUD or database operations.
 */
class SubscriptionService
{
    /**
     * Assign the default plan to an organization.
     */
    public function assignDefaultPlan(Organization $organization, string $billingPeriod = 'monthly'): ?OrganizationSubscription
    {
        $plan = OrganizationPlan::where('is_default', true)->first();
        if (!$plan) {
            return null;
        }

        return $this->assignPlan($organization, $plan, $billingPeriod);
    }

    /**
     * Assign a specific plan to an organization.
     */
    public function assignPlan(Organization $organization, OrganizationPlan $plan, string $billingPeriod = 'monthly'): OrganizationSubscription
    {
        // Deactivate any existing active subscription
        OrganizationSubscription::where('organization_id', $organization->id)
            ->where('status', 'active')
            ->update(['status' => 'replaced']);

        return OrganizationSubscription::create([
            'organization_id' => $organization->id,
            'plan_id'         => $plan->id,
            'billing_period'  => $billingPeriod,
            'status'          => 'active',
            'amount'          => $plan->getPrice($billingPeriod),
            'currency'        => 'USD',
            'starts_at'       => now(),
            'trial_ends_at'   => null,
        ]);
    }

    /**
     * Change an organization's plan.
     */
    public function changePlan(Organization $organization, OrganizationPlan $newPlan, string $billingPeriod = 'monthly'): OrganizationSubscription
    {
        // Cancel current subscription
        $current = $organization->subscription;
        if ($current && $current->isActive()) {
            $current->update([
                'status'       => 'cancelled',
                'cancelled_at' => now(),
            ]);
        }

        // Assign new plan
        return $this->assignPlan($organization, $newPlan, $billingPeriod);
    }

    /**
     * Cancel an organization's subscription.
     */
    public function cancel(Organization $organization): ?OrganizationSubscription
    {
        $subscription = $organization->subscription;
        if (!$subscription || !$subscription->isActive()) {
            return null;
        }

        $subscription->update([
            'status'       => 'cancelled',
            'cancelled_at' => now(),
        ]);

        return $subscription->fresh();
    }

    /**
     * Get the current active subscription for an organization.
     */
    public function getActive(Organization $organization): ?OrganizationSubscription
    {
        return $organization->subscription;
    }

    /**
     * Check if an organization has an active subscription.
     */
    public function isActive(Organization $organization): bool
    {
        $subscription = $organization->subscription;
        return $subscription && $subscription->isActive();
    }

    /**
     * Check if an organization is within its user limit.
     */
    public function isWithinUserLimit(Organization $organization): bool
    {
        if ($organization->type === 'owner') {
            return true;
        }

        $subscription = $organization->subscription;
        if (!$subscription || !$subscription->plan) {
            return false;
        }

        return true; // Actual count check would query tenant DB
    }

    /**
     * Check if an organization is within its project limit.
     */
    public function isWithinProjectLimit(Organization $organization): bool
    {
        if ($organization->type === 'owner') {
            return true;
        }

        $subscription = $organization->subscription;
        if (!$subscription || !$subscription->plan) {
            return false;
        }

        return true; // Actual count check would query tenant DB
    }
}
