<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\OrganizationSubscriptionHistory;
use Illuminate\Support\Facades\Log;

class SubscriptionHistoryService
{
    /**
     * Record a subscription history event.
     */
    public function record(
        Organization $organization,
        string $eventType,
        OrganizationPlan $plan,
        ?OrganizationPlan $previousPlan = null,
        ?OrganizationSubscription $subscription = null,
        ?string $changedBy = null,
        ?string $status = null,
        ?string $billingPeriod = null,
        ?float $amount = null,
        ?string $startedAt = null,
        ?string $endedAt = null,
        ?array $metadata = null,
    ): OrganizationSubscriptionHistory {
        return OrganizationSubscriptionHistory::create([
            'organization_id'   => $organization->id,
            'plan_id'           => $plan->id,
            'previous_plan_id'  => $previousPlan?->id,
            'event_type'        => $eventType,
            'status'            => $status ?? ($subscription->status ?? 'active'),
            'billing_period'    => $billingPeriod ?? ($subscription->billing_period ?? 'monthly'),
            'amount'            => $amount ?? ($subscription->amount ?? $plan->getPrice($billingPeriod ?? 'monthly')),
            'started_at'        => $startedAt ?? ($subscription->starts_at ?? now()),
            'ended_at'          => $endedAt ?? ($subscription->ends_at ?? null),
            'changed_by'        => $changedBy ?? $this->resolveChangedBy(),
            'metadata'          => $metadata,
        ]);
    }

    /**
     * Record trial started event.
     */
    public function recordTrialStarted(
        Organization $organization,
        OrganizationPlan $plan,
        ?OrganizationSubscription $subscription = null,
        ?string $changedBy = null,
    ): OrganizationSubscriptionHistory {
        return $this->record(
            organization: $organization,
            eventType: 'trial_started',
            plan: $plan,
            subscription: $subscription,
            changedBy: $changedBy,
            status: 'trial',
        );
    }

    /**
     * Record plan assigned event (new subscription).
     */
    public function recordPlanAssigned(
        Organization $organization,
        OrganizationPlan $plan,
        ?OrganizationSubscription $subscription = null,
        ?string $changedBy = null,
    ): OrganizationSubscriptionHistory {
        return $this->record(
            organization: $organization,
            eventType: 'plan_assigned',
            plan: $plan,
            subscription: $subscription,
            changedBy: $changedBy,
        );
    }

    /**
     * Record plan changed event (upgrade/downgrade).
     */
    public function recordPlanChanged(
        Organization $organization,
        OrganizationPlan $newPlan,
        OrganizationPlan $oldPlan,
        ?OrganizationSubscription $subscription = null,
        ?string $changedBy = null,
    ): OrganizationSubscriptionHistory {
        $eventType = $this->determinePlanChangeType($oldPlan, $newPlan);

        return $this->record(
            organization: $organization,
            eventType: $eventType,
            plan: $newPlan,
            previousPlan: $oldPlan,
            subscription: $subscription,
            changedBy: $changedBy,
        );
    }

    /**
     * Record subscription renewed event.
     */
    public function recordRenewal(
        Organization $organization,
        OrganizationPlan $plan,
        OrganizationSubscription $subscription,
        ?string $changedBy = null,
    ): OrganizationSubscriptionHistory {
        return $this->record(
            organization: $organization,
            eventType: 'subscription_renewed',
            plan: $plan,
            subscription: $subscription,
            changedBy: $changedBy ?? 'System',
        );
    }

    /**
     * Record subscription cancelled event.
     */
    public function recordCancellation(
        Organization $organization,
        ?OrganizationSubscription $subscription = null,
        ?string $changedBy = null,
    ): ?OrganizationSubscriptionHistory {
        if (!$subscription?->plan) {
            return null;
        }

        return $this->record(
            organization: $organization,
            eventType: 'subscription_cancelled',
            plan: $subscription->plan,
            subscription: $subscription,
            changedBy: $changedBy,
            status: 'cancelled',
        );
    }

    /**
     * Record subscription suspended event.
     */
    public function recordSuspended(
        Organization $organization,
        ?string $changedBy = null,
    ): ?OrganizationSubscriptionHistory {
        $subscription = $organization->subscription;
        if (!$subscription?->plan) {
            return null;
        }

        return $this->record(
            organization: $organization,
            eventType: 'subscription_suspended',
            plan: $subscription->plan,
            subscription: $subscription,
            changedBy: $changedBy,
            status: 'suspended',
        );
    }

    /**
     * Record subscription reactivated event.
     */
    public function recordReactivated(
        Organization $organization,
        ?string $changedBy = null,
    ): ?OrganizationSubscriptionHistory {
        $subscription = $organization->subscription;
        if (!$subscription?->plan) {
            return null;
        }

        return $this->record(
            organization: $organization,
            eventType: 'subscription_reactivated',
            plan: $subscription->plan,
            subscription: $subscription,
            changedBy: $changedBy,
            status: 'active',
        );
    }

    /**
     * Get subscription history for an organization.
     */
    public function getHistory(Organization $organization, int $limit = 50): \Illuminate\Database\Eloquent\Collection
    {
        return OrganizationSubscriptionHistory::where('organization_id', $organization->id)
            ->with('plan', 'previousPlan')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();
    }

    /**
     * Get plan usage summary for an organization.
     */
    public function getPlanUsageSummary(Organization $organization): array
    {
        $history = OrganizationSubscriptionHistory::where('organization_id', $organization->id)
            ->selectRaw('plan_id, COUNT(*) as times_used')
            ->groupBy('plan_id')
            ->with('plan:id,name,slug')
            ->get();

        return $history->map(fn($row) => [
            'plan_id'     => $row->plan_id,
            'plan_name'   => $row->plan->name ?? 'Unknown',
            'plan_slug'   => $row->plan->slug ?? 'unknown',
            'times_used'  => $row->times_used,
        ])->toArray();
    }

    /**
     * Get subscription summary stats for an organization.
     */
    public function getSubscriptionSummary(Organization $organization): array
    {
        $totalSubscriptions = OrganizationSubscriptionHistory::where('organization_id', $organization->id)->count();
        $planChanges = OrganizationSubscriptionHistory::where('organization_id', $organization->id)
            ->whereIn('event_type', ['plan_changed', 'plan_upgraded', 'plan_downgraded'])->count();
        $renewals = OrganizationSubscriptionHistory::where('organization_id', $organization->id)
            ->where('event_type', 'subscription_renewed')->count();
        $trialPeriods = OrganizationSubscriptionHistory::where('organization_id', $organization->id)
            ->where('event_type', 'trial_started')->count();

        return [
            'total_subscriptions' => $totalSubscriptions,
            'total_plan_changes'  => $planChanges,
            'total_renewals'      => $renewals,
            'total_trial_periods' => $trialPeriods,
        ];
    }

    /**
     * Determine if a plan change is an upgrade or downgrade based on price.
     */
    private function determinePlanChangeType(OrganizationPlan $oldPlan, OrganizationPlan $newPlan): string
    {
        $oldPrice = $oldPlan->price_monthly;
        $newPrice = $newPlan->price_monthly;

        if ($newPrice > $oldPrice) {
            return 'plan_upgraded';
        } elseif ($newPrice < $oldPrice) {
            return 'plan_downgraded';
        }

        return 'plan_changed';
    }

    /**
     * Resolve who made the change.
     */
    private function resolveChangedBy(): string
    {
        try {
            $name = request()->header('X-Admin-Name');
            if ($name) {
                return $name;
            }
        } catch (\Throwable) {
            // Not in HTTP context
        }

        return 'System';
    }
}
