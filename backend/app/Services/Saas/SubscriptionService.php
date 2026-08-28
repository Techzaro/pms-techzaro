<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\OrganizationTrialSetting;
use App\Models\Master\ActivityLog;
use App\Models\Master\OrganizationBillingInvoice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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
    protected ?SubscriptionHistoryService $historyService = null;

    public function setHistoryService(SubscriptionHistoryService $service): void
    {
        $this->historyService = $service;
    }

    protected function history(): ?SubscriptionHistoryService
    {
        return $this->historyService;
    }
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
     *
     * @param array $customOverrides Optional custom overrides: custom_price_monthly, custom_price_yearly, custom_max_users, custom_max_projects, custom_max_storage_gb
     */
    public function assignPlan(Organization $organization, OrganizationPlan $plan, string $billingPeriod = 'monthly', array $customOverrides = []): OrganizationSubscription
    {
        // Deactivate any existing active subscription
        OrganizationSubscription::where('organization_id', $organization->id)
            ->where('status', 'active')
            ->update(['status' => 'replaced']);

        $isCustom = !empty($customOverrides);
        $amount = $isCustom
            ? ($billingPeriod === 'yearly' ? ($customOverrides['custom_price_yearly'] ?? $plan->getPrice('yearly')) : ($customOverrides['custom_price_monthly'] ?? $plan->getPrice('monthly')))
            : $plan->getPrice($billingPeriod);

        $subscription = OrganizationSubscription::create([
            'organization_id'       => $organization->id,
            'plan_id'               => $plan->id,
            'billing_period'        => $billingPeriod,
            'status'                => 'active',
            'amount'                => $amount,
            'currency'              => 'USD',
            'is_custom'             => $isCustom,
            'custom_price_monthly'  => $customOverrides['custom_price_monthly'] ?? null,
            'custom_price_yearly'   => $customOverrides['custom_price_yearly'] ?? null,
            'custom_max_users'      => $customOverrides['custom_max_users'] ?? null,
            'custom_max_projects'   => $customOverrides['custom_max_projects'] ?? null,
            'custom_max_storage_gb' => $customOverrides['custom_max_storage_gb'] ?? null,
            'storage_unit'          => $customOverrides['storage_unit'] ?? null,
            'starts_at'             => now(),
            'ends_at'               => $this->calculateEndDate($plan, $billingPeriod),
            'trial_ends_at'         => null,
        ]);

        // Record history
        if ($this->history()) {
            $isTrial = $plan->slug === 'trial';
            $this->history()->record(
                organization: $organization,
                eventType: $isTrial ? 'trial_started' : 'plan_assigned',
                plan: $plan,
                subscription: $subscription,
                status: $isTrial ? 'trial' : 'active',
            );
        }

        return $subscription;
    }

    /**
     * Change an organization's plan.
     */
    public function changePlan(Organization $organization, OrganizationPlan $newPlan, string $billingPeriod = 'monthly', array $customOverrides = []): OrganizationSubscription
    {
        // Cancel current subscription
        $current = $organization->subscription;
        $oldPlan = null;
        if ($current && $current->isActive()) {
            $oldPlan = $current->plan;
            $current->update([
                'status'       => 'cancelled',
                'cancelled_at' => now(),
            ]);
        }

        // Assign new plan
        $subscription = $this->assignPlan($organization, $newPlan, $billingPeriod, $customOverrides);

        // Override history event to be plan_changed (assignPlan creates plan_assigned)
        if ($this->history() && $oldPlan) {
            $this->history()->recordPlanChanged(
                organization: $organization,
                newPlan: $newPlan,
                oldPlan: $oldPlan,
                subscription: $subscription,
            );
        }

        // Log activity (safe to call even outside HTTP context)
        try {
            ActivityLog::create([
                'user'   => request()->header('X-Admin-Name', 'Super Admin'),
                'action' => 'Changed organization plan',
                'target' => $organization->name . ' → ' . $newPlan->name,
                'ip'     => request()->ip(),
                'status' => 'success',
            ]);
        } catch (\Throwable $e) {
            \Log::warning("Failed to log plan change activity: " . $e->getMessage());
        }

        return $subscription;
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

        // Record history
        if ($this->history()) {
            $this->history()->recordCancellation($organization, $subscription);
        }

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
        $result = app(EntitlementService::class)->canCreateUser($organization);
        return $result['allowed'];
    }

    /**
     * Check if an organization is within its project limit.
     */
    public function isWithinProjectLimit(Organization $organization): bool
    {
        $result = app(EntitlementService::class)->canCreateProject($organization);
        return $result['allowed'];
    }

    /**
     * Auto-renew an expired subscription.
     *
     * If the organization's current subscription has passed its ends_at date,
     * create a new subscription with the same plan and billing period, extending
     * from the current date. This ensures continuous access without manual reactivation.
     *
     * Sends renewal notifications to org admin and TechXaro admin.
     *
     * Returns the new subscription if renewed, or the existing active one if not expired.
     */
    public function renewExpiredSubscription(Organization $organization): ?OrganizationSubscription
    {
        $subscription = $organization->subscription;

        // No subscription at all — assign default plan
        if (!$subscription) {
            return $this->assignDefaultPlan($organization);
        }

        // Already active and not expired — return as-is
        if ($subscription->isActive() && !$subscription->isExpired()) {
            return $subscription;
        }

        // Subscription expired — auto-renew with same plan and billing period
        if ($subscription->isExpired() && $subscription->plan) {
            $oldSubscription = $subscription;
            $billingPeriod = $subscription->billing_period ?? 'monthly';
            $plan = $subscription->plan;

            // Mark old subscription as replaced
            $subscription->update(['status' => 'replaced']);

            // Create new subscription starting now (preserve custom overrides)
            $isCustom = $oldSubscription->is_custom;
            $amount = $isCustom
                ? ($billingPeriod === 'yearly' ? ($oldSubscription->custom_price_yearly ?? $plan->getPrice('yearly')) : ($oldSubscription->custom_price_monthly ?? $plan->getPrice('monthly')))
                : $plan->getPrice($billingPeriod);

            $newSubscription = OrganizationSubscription::create([
                'organization_id'       => $organization->id,
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
                'ends_at'               => $this->calculateEndDate($plan, $billingPeriod, $organization),
                'trial_ends_at'         => null,
            ]);

            // Record renewal history
            if ($this->history()) {
                $this->history()->recordRenewal($organization, $plan, $newSubscription);
            }

            // Create pending billing invoice for the renewal
            $this->createRenewalInvoice($organization, $newSubscription, $plan, $amount, $billingPeriod);

            // Send renewal notifications
            $this->sendRenewalNotifications($organization, $newSubscription);

            // Log system activity
            ActivityLog::create([
                'user'   => 'System',
                'action' => 'Auto-renewed subscription',
                'target' => $organization->name . ' → ' . $plan->name,
                'ip'     => null,
                'status' => 'success',
            ]);

            return $newSubscription;
        }

        // Trial expired on organization — transition to active with default plan
        if ($organization->status === 'trial' && $organization->trial_ends_at && $organization->trial_ends_at->isPast()) {
            $organization->update(['status' => 'active']);
            return $this->assignDefaultPlan($organization);
        }

        return $subscription;
    }

    /**
     * Check if an organization's subscription is expired (or trial expired).
     */
    public function isExpired(Organization $organization): bool
    {
        // Owner organizations never expire
        $subscription = $organization->subscription;

        // No subscription — check trial
        if (!$subscription) {
            return $organization->status === 'trial'
                && $organization->trial_ends_at
                && $organization->trial_ends_at->isPast();
        }

        return $subscription->isExpired();
    }

    /**
     * Calculate the subscription end date based on plan type.
     *
     * For trial plans, uses the org's custom trial settings or plan defaults.
     * For paid plans, uses billing period (monthly/yearly).
     */
    private function calculateEndDate(OrganizationPlan $plan, string $billingPeriod = 'monthly', ?Organization $organization = null): \Carbon\Carbon
    {
        if ($plan->slug === 'trial') {
            // Check for org-specific trial override
            if ($organization) {
                $trialSetting = OrganizationTrialSetting::on('mysql_master')
                    ->where('organization_id', $organization->id)
                    ->first();

                if ($trialSetting) {
                    return match ($trialSetting->trial_duration_unit) {
                        'minutes' => now()->addMinutes($trialSetting->trial_duration),
                        'hours'   => now()->addHours($trialSetting->trial_duration),
                        'days'    => now()->addDays($trialSetting->trial_duration),
                        default   => now()->addDays($trialSetting->trial_duration),
                    };
                }
            }

            // Fall back to plan defaults
            return match ($plan->trial_duration_unit) {
                'minutes' => now()->addMinutes($plan->trial_duration),
                'hours'   => now()->addHours($plan->trial_duration),
                'days'    => now()->addDays($plan->trial_duration),
                default   => now()->addDays($plan->trial_duration),
            };
        }

        // Paid plans
        return $billingPeriod === 'yearly' ? now()->addYear() : now()->addMonth();
    }

    /**
     * Send renewal notification emails AND create in-app notifications.
     *
     * Creates Notification records in the tenant DB for:
     * 1. Organization admin (visible in their header bell + notifications page + desktop)
     * 2. TechXaro super admin (visible in their header bell + notifications page + desktop)
     *
     * The Notification model auto-dispatches email via SendBulkNotificationEmails job on creation.
     */
    private function sendRenewalNotifications(Organization $organization, OrganizationSubscription $subscription): void
    {
        try {
            $loginUrl = config('app.frontend_url', 'http://localhost:5173');
            $plan = $subscription->plan;
            $planName = $plan->name ?? 'Unknown';
            $billingLabel = ($subscription->billing_period ?? 'monthly') === 'yearly' ? 'Yearly' : 'Monthly';

            // --- 1. Org admin: email + in-app notification ---
            $adminData = $this->getAdminUser($organization);
            if ($adminData) {
                // Email
                try {
                    Mail::to($adminData->email)->queue(
                        new \App\Mail\SubscriptionRenewedMail($organization, $subscription, 'admin', $loginUrl)
                    );
                    Log::info("Renewal email queued for admin: {$adminData->email} for org: {$organization->name}");
                } catch (\Throwable $e) {
                    Log::error("Failed to queue renewal email to admin {$adminData->email}: " . $e->getMessage());
                }

                // In-app notification (in org tenant DB)
                $this->createInAppNotification(
                    $organization->database_name,
                    $adminData->id,
                    null,
                    'subscription_renewed',
                    'subscription',
                    $subscription->id,
                    'Subscription Renewed',
                    "Your {$billingLabel} {$planName} subscription has been automatically renewed.",
                    'subscription'
                );
            }

            // --- 2. TechXaro super admin: email + in-app notification ---
            $superAdminEmail = config('mail.from.address', 'noreply@techxaro.com');
            try {
                Mail::to($superAdminEmail)->queue(
                    new \App\Mail\SubscriptionRenewedMail($organization, $subscription, 'super_admin', $loginUrl)
                );
                Log::info("Renewal email queued for super admin for org: {$organization->name}");
            } catch (\Throwable $e) {
                Log::error("Failed to queue renewal email to super admin for org {$organization->name}: " . $e->getMessage());
            }

            // In-app notification in TechXaro tenant DB
            $superAdminUser = $this->getTechxaroSuperAdmin();
            if ($superAdminUser) {
                $techxaroDb = $this->getTechxaroDatabaseName();
                if ($techxaroDb) {
                    $this->createInAppNotification(
                        $techxaroDb,
                        $superAdminUser->id,
                        null,
                        'subscription_renewed',
                        'subscription',
                        $subscription->id,
                        'Subscription Renewed',
                        "Organization \"{$organization->name}\" {$billingLabel} {$planName} subscription has been automatically renewed.",
                        '/super-admin/organizations/' . $organization->id
                    );
                }
            }
        } catch (\Throwable $e) {
            Log::error("Failed to send renewal notifications for org {$organization->name}: " . $e->getMessage());
        }
    }

    /**
     * Create an in-app notification record in a specific tenant database.
     */
    private function createInAppNotification(string $dbName, int $userId, ?int $senderUserId, string $type, string $relatedModule, int $relatedId, string $title, string $message, ?string $link = null): void
    {
        try {
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $stmt = $pdo->prepare(
                "INSERT INTO `{$escaped}`.`notifications` (`user_id`, `sender_user_id`, `type`, `related_module`, `related_id`, `title`, `message`, `link`, `is_read`, `created_at`, `updated_at`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())"
            );
            $stmt->execute([$userId, $senderUserId, $type, $relatedModule, $relatedId, $title, $message, $link]);
            Log::info("In-app notification created for user {$userId} in {$dbName}: {$title}");
            // Email is already sent separately via Mail::to()->queue() in sendRenewalNotifications
        } catch (\Throwable $e) {
            Log::error("Failed to create in-app notification in {$dbName} for user {$userId}: " . $e->getMessage());
        }
    }

    /**
     * Get admin user (id + email) from the tenant database.
     */
    private function getAdminUser(Organization $organization): ?object
    {
        try {
            $dbName = $organization->database_name;
            $escaped = str_replace('`', '``', $dbName);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("SELECT id, email FROM `{$escaped}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
            $stmt->execute();
            return $stmt->fetch(\PDO::FETCH_OBJ) ?: null;
        } catch (\Throwable $e) {
            Log::error("Failed to get admin user for org {$organization->name}: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get TechXaro super admin user (id + email) from the techxaro tenant database.
     */
    private function getTechxaroSuperAdmin(): ?object
    {
        try {
            $techxaroDb = $this->getTechxaroDatabaseName();
            if (!$techxaroDb) return null;
            $escaped = str_replace('`', '``', $techxaroDb);
            $pdo = DB::connection('mysql_master')->getPdo();
            $stmt = $pdo->prepare("SELECT id, email FROM `{$escaped}`.`users` WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
            $stmt->execute();
            return $stmt->fetch(\PDO::FETCH_OBJ) ?: null;
        } catch (\Throwable $e) {
            Log::error("Failed to get TechXaro super admin: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get the TechXaro (owner) organization's tenant database name.
     */
    private function getTechxaroDatabaseName(): ?string
    {
        try {
            $org = Organization::on('mysql_master')->where('slug', 'techxaro')->first();
            return $org?->database_name;
        } catch (\Throwable $e) {
            Log::error("Failed to get TechXaro database name: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Create a pending billing invoice for a subscription renewal.
     */
    private function createRenewalInvoice(
        Organization $organization,
        OrganizationSubscription $subscription,
        OrganizationPlan $plan,
        float $amount,
        string $billingPeriod,
    ): void {
        try {
            $renewalRef = "RENEW-{$organization->id}-{$subscription->id}-" . now()->format('Ymd');
            $taxAmount = round($amount * 0.10, 2);
            $totalAmount = round($amount + $taxAmount, 2);
            $invoiceNumber = 'INV-' . strtoupper(substr(uniqid(), -4)) . '-' . now()->format('YmdHis');

            OrganizationBillingInvoice::on('mysql_master')->create([
                'organization_id'      => $organization->id,
                'subscription_id'      => $subscription->id,
                'plan_id'              => $plan->id,
                'invoice_number'       => $invoiceNumber,
                'status'               => 'pending',
                'amount'               => $amount,
                'tax_amount'           => $taxAmount,
                'total_amount'         => $totalAmount,
                'currency'             => 'USD',
                'billing_period'       => $billingPeriod,
                'billing_period_start' => $subscription->starts_at,
                'billing_period_end'   => $subscription->ends_at,
                'description'          => "Auto-renewed: {$plan->name} ({$billingPeriod})",
                'renewal_reference'    => $renewalRef,
                'due_at'               => $subscription->ends_at,
            ]);
        } catch (\Throwable $e) {
            Log::error("Failed to create renewal invoice for org {$organization->name}: " . $e->getMessage());
        }
    }
}
