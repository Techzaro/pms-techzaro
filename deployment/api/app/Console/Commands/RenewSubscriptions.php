<?php

namespace App\Console\Commands;

use App\Models\Master\ActivityLog;
use App\Models\Master\Organization;
use App\Models\Master\OrganizationBillingInvoice;
use App\Models\Master\OrganizationSubscription;
use App\Services\Saas\PaymentApprovalService;
use App\Services\Saas\SubscriptionHistoryService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RenewSubscriptions extends Command
{
    protected $signature = 'subscriptions:renew';
    protected $description = 'Automatically renew expired subscriptions and create pending billing invoices';

    public function handle(): int
    {
        $this->info('[' . now()->toDateTimeString() . '] Running subscription renewal...');

        $renewedCount = 0;
        $skippedCount = 0;
        $failedCount = 0;

        // Get all non-deleted organizations
        $organizations = Organization::on('mysql_master')
            ->where('status', '!=', 'deleted')
            ->get();

        $this->info("Found " . $organizations->count() . " organizations to check.");

        foreach ($organizations as $org) {
            try {
                $result = $this->processOrganization($org);

                if ($result === 'renewed') {
                    $renewedCount++;
                    $this->info("  ✓ Renewed: {$org->name} (ID: {$org->id})");
                } elseif ($result === 'skipped') {
                    $skippedCount++;
                } elseif ($result === 'no_plan') {
                    $skippedCount++;
                    $this->line("  - Skipped: {$org->name} (no plan or trial)");
                }
            } catch (\Throwable $e) {
                $failedCount++;
                $this->error("  ✗ Failed: {$org->name} (ID: {$org->id}) — {$e->getMessage()}");
                Log::error("Subscription renewal failed for org {$org->name} (ID: {$org->id}): " . $e->getMessage());
            }
        }

        $this->info('');
        $this->info("Summary: {$renewedCount} renewed, {$skippedCount} skipped, {$failedCount} failed");
        $this->info('[' . now()->toDateTimeString() . '] Subscription renewal complete.');

        return $failedCount > 0 ? 1 : 0;
    }

    /**
     * Process a single organization for renewal.
     *
     * Returns: 'renewed', 'skipped', or 'no_plan'
     */
    private function processOrganization(Organization $org): string
    {
        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('status', 'active')
            ->latest('starts_at')
            ->first();

        // No active subscription — check if trial expired
        if (!$subscription) {
            if ($org->status === 'trial' && $org->trial_ends_at && $org->trial_ends_at->isPast()) {
                $this->assignDefaultPlan($org);
                return 'renewed';
            }
            return 'no_plan';
        }

        // Not expired yet — skip
        if (!$subscription->isExpired()) {
            return 'skipped';
        }

        // Already has a pending or approved invoice for this subscription — skip (idempotency)
        $existingInvoice = OrganizationBillingInvoice::on('mysql_master')
            ->where('subscription_id', $subscription->id)
            ->whereIn('status', ['pending', 'approved', 'paid'])
            ->first();

        if ($existingInvoice) {
            return 'skipped';
        }

        // Renew the subscription
        return $this->renewSubscription($org, $subscription);
    }

    /**
     * Renew an expired subscription and create a pending billing invoice.
     */
    private function renewSubscription(Organization $org, OrganizationSubscription $oldSubscription): string
    {
        $plan = $oldSubscription->plan;
        if (!$plan) {
            return 'skipped';
        }

        $billingPeriod = $oldSubscription->billing_period ?? 'monthly';

        DB::connection('mysql_master')->beginTransaction();

        try {
            // 1. Mark old subscription as replaced
            $oldSubscription->update(['status' => 'replaced']);

            // 2. Calculate amount (preserve custom overrides)
            $isCustom = $oldSubscription->is_custom;
            $amount = $isCustom
                ? ($billingPeriod === 'yearly'
                    ? ($oldSubscription->custom_price_yearly ?? $plan->getPrice('yearly'))
                    : ($oldSubscription->custom_price_monthly ?? $plan->getPrice('monthly')))
                : $plan->getPrice($billingPeriod);

            // 3. Create new subscription
            $newSubscription = OrganizationSubscription::on('mysql_master')->create([
                'organization_id'       => $org->id,
                'plan_id'               => $plan->id,
                'billing_period'        => $billingPeriod,
                'status'                => 'active',
                'amount'                => $amount,
                'currency'              => 'USD',
                'is_custom'             => $isCustom,
                'custom_price_monthly'  => $oldSubscription->custom_price_monthly,
                'custom_price_yearly'   => $oldSubscription->custom_price_yearly,
                'custom_max_users'      => $oldSubscription->custom_max_users,
                'custom_max_projects'   => $oldSubscription->custom_max_projects,
                'custom_max_storage_gb' => $oldSubscription->custom_max_storage_gb,
                'starts_at'             => now(),
                'ends_at'               => $this->calculateEndDate($plan, $billingPeriod, $org),
                'trial_ends_at'         => null,
            ]);

            // 4. Create pending billing invoice
            $periodStart = now();
            $periodEnd = $newSubscription->ends_at;
            $renewalRef = "RENEW-{$org->id}-{$newSubscription->id}-" . now()->format('Ymd');

            $paymentService = app(PaymentApprovalService::class);
            $paymentService->createRenewalInvoice(
                organizationId: $org->id,
                subscriptionId: $newSubscription->id,
                planId: $plan->id,
                amount: $amount,
                currency: 'USD',
                billingPeriod: $billingPeriod,
                periodStart: $periodStart,
                periodEnd: $periodEnd,
                renewalReference: $renewalRef,
                description: "Auto-renewed: {$plan->name} ({$billingPeriod})",
            );

            // 5. Record subscription history
            $historyService = app(SubscriptionHistoryService::class);
            $historyService->recordRenewal($org, $plan, $newSubscription, 'System (scheduler)');

            // 6. Log activity
            ActivityLog::on('mysql_master')->create([
                'user'    => 'System',
                'action'  => 'Auto-renewed subscription (scheduler)',
                'target'  => "{$org->name} → {$plan->name}",
                'details' => "Subscription #{$newSubscription->id} created. Invoice pending payment approval. Amount: \${$amount}",
                'ip'      => null,
                'status'  => 'success',
            ]);

            DB::connection('mysql_master')->commit();

            return 'renewed';
        } catch (\Throwable $e) {
            DB::connection('mysql_master')->rollBack();
            throw $e;
        }
    }

    /**
     * Assign the default plan when no subscription exists.
     */
    private function assignDefaultPlan(Organization $org): void
    {
        $plan = \App\Models\Master\OrganizationPlan::on('mysql_master')->where('is_default', true)->first();
        if (!$plan) {
            return;
        }

        $billingPeriod = 'monthly';
        $amount = $plan->getPrice($billingPeriod);

        DB::connection('mysql_master')->beginTransaction();

        try {
            $subscription = OrganizationSubscription::on('mysql_master')->create([
                'organization_id' => $org->id,
                'plan_id'         => $plan->id,
                'billing_period'  => $billingPeriod,
                'status'          => 'active',
                'amount'          => $amount,
                'currency'        => 'USD',
                'is_custom'       => false,
                'starts_at'       => now(),
                'ends_at'         => $this->calculateEndDate($plan, $billingPeriod, $org),
            ]);

            $renewalRef = "RENEW-{$org->id}-{$subscription->id}-" . now()->format('Ymd');

            app(PaymentApprovalService::class)->createRenewalInvoice(
                organizationId: $org->id,
                subscriptionId: $subscription->id,
                planId: $plan->id,
                amount: $amount,
                currency: 'USD',
                billingPeriod: $billingPeriod,
                periodStart: now(),
                periodEnd: $subscription->ends_at,
                renewalReference: $renewalRef,
                description: "Default plan assigned: {$plan->name}",
            );

            app(SubscriptionHistoryService::class)->record(
                organization: $org,
                eventType: 'plan_assigned',
                plan: $plan,
                subscription: $subscription,
                changedBy: 'System (scheduler)',
            );

            DB::connection('mysql_master')->commit();
        } catch (\Throwable $e) {
            DB::connection('mysql_master')->rollBack();
            throw $e;
        }
    }

    /**
     * Calculate the subscription end date.
     */
    private function calculateEndDate(\App\Models\Master\OrganizationPlan $plan, string $billingPeriod, Organization $org): \Carbon\Carbon
    {
        if ($plan->slug === 'trial') {
            $trialSetting = \App\Models\Master\OrganizationTrialSetting::on('mysql_master')
                ->where('organization_id', $org->id)
                ->first();

            if ($trialSetting) {
                return match ($trialSetting->trial_duration_unit) {
                    'minutes' => now()->addMinutes($trialSetting->trial_duration),
                    'hours'   => now()->addHours($trialSetting->trial_duration),
                    'days'    => now()->addDays($trialSetting->trial_duration),
                    default   => now()->addDays($trialSetting->trial_duration),
                };
            }

            return match ($plan->trial_duration_unit) {
                'minutes' => now()->addMinutes($plan->trial_duration),
                'hours'   => now()->addHours($plan->trial_duration),
                'days'    => now()->addDays($plan->trial_duration),
                default   => now()->addDays($plan->trial_duration),
            };
        }

        return $billingPeriod === 'yearly' ? now()->addYear() : now()->addMonth();
    }
}
