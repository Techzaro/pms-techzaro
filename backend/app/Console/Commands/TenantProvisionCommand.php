<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Services\Saas\Provisioning\ProvisioningOrchestrator;
use App\Services\Saas\Provisioning\ProvisioningStatus;
use App\Services\Saas\Provisioning\DomainRegistrar;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Tenant Provisioning Command.
 *
 * Provisions a complete tenant with isolated database, administrator,
 * domain mapping, and subscription plan.
 *
 * Usage:
 *   php artisan tenant:provision \
 *     --name="Acme Corporation" \
 *     --slug="acme" \
 *     --admin-name="John Doe" \
 *     --admin-email="admin@acme.com" \
 *     --admin-password="ChangeMe123!" \
 *     --plan="standard"
 */
class TenantProvisionCommand extends Command
{
    protected $signature = 'tenant:provision
                            {--name= : Organization name}
                            {--slug= : URL-friendly slug (auto-generated from name if omitted)}
                            {--admin-name= : Administrator full name}
                            {--admin-email= : Administrator email address}
                            {--admin-password= : Administrator password}
                            {--plan= : Plan slug (starter, standard, enterprise). Default: standard}
                            {--domain= : Primary domain (auto-generated from slug if omitted)}
                            {--type=standard : Organization type (owner, standard)}
                            {--status=active : Organization status (active, trial, inactive)}
                            {--billing-period=monthly : Billing period (monthly, yearly)}
                            {--timezone=Asia/Karachi : Timezone}
                            {--no-seed : Skip running tenant seeders (admin user still created)}';

    protected $description = 'Provision a complete new tenant with isolated database, administrator, and plan';

    public function handle(ProvisioningOrchestrator $orchestrator, DomainRegistrar $domainRegistrar): int
    {
        // Collect and validate input
        $data = $this->collectInput();
        if ($data === null) {
            return 1;
        }

        // Pre-flight checks
        if (!$this->preFlightChecks($data, $domainRegistrar)) {
            return 1;
        }

        // Confirm before provisioning
        if (!$this->confirmProvisioning($data)) {
            return 0;
        }

        // Execute provisioning
        $this->newLine();
        $this->info('Starting tenant provisioning...');
        $this->newLine();

        $startTime = microtime(true);

        try {
            $result = $orchestrator->provision($data);
            $totalTime = round((microtime(true) - $startTime) * 1000);

            $this->newLine();
            $this->info('=====================================');
            $this->info('  Tenant Provisioned Successfully!');
            $this->info('=====================================');
            $this->newLine();

            $org = $result['organization'];
            $status = $result['status'];

            $this->table(['Field', 'Value'], [
                ['Organization ID',   $org->id],
                ['Name',              $org->name],
                ['Type',              $org->type],
                ['Slug',              $org->slug],
                ['Status',            $org->status],
                ['Database',          $org->database_name],
                ['Domain',            $data['domain'] ?? 'N/A'],
                ['Plan',              $data['plan'] ?? 'default'],
                ['Admin Email',       $data['admin_email']],
                ['Total Time',        number_format($totalTime) . 'ms'],
            ]);

            $this->newLine();
            $this->info('Provisioning Steps:');
            $this->newLine();

            $stepRows = [];
            foreach ($status->getSteps() as $stepName => $stepData) {
                $stepRows[] = [
                    $stepName,
                    $stepData['status'],
                    $stepData['duration_ms'] ? number_format($stepData['duration_ms']) . 'ms' : 'N/A',
                    $stepData['error'] ?? '',
                ];
            }

            $this->table(['Step', 'Status', 'Duration', 'Error'], $stepRows);

            $this->newLine();
            $this->info("Tenant is ready. Access via: http://{$data['domain']}");
            $this->line("Admin login: {$data['admin_email']} / {$data['admin_password']}");
            $this->warn('Note: Admin must change password on first login.');

            return 0;
        } catch (\Throwable $e) {
            $this->newLine();
            $this->error("Provisioning failed: {$e->getMessage()}");

            if ($this->getOutput()->isVerbose()) {
                $this->line($e->getTraceAsString());
            }

            return 1;
        }
    }

    /**
     * Collect and validate all input from options and interactive prompts.
     */
    protected function collectInput(): ?array
    {
        $name = $this->option('name') ?? $this->ask('Organization name');
        if (!$name) {
            $this->error('Organization name is required.');
            return null;
        }

        $slug = $this->option('slug') ?? $this->ask('Slug (URL-friendly)', Str::slug($name));
        if (!$slug) {
            $this->error('Slug is required.');
            return null;
        }

        $adminName = $this->option('admin-name') ?? $this->ask('Administrator name', 'Administrator');
        $adminEmail = $this->option('admin-email') ?? $this->ask('Administrator email');
        if (!$adminEmail) {
            $this->error('Administrator email is required.');
            return null;
        }

        $adminPassword = $this->option('admin-password') ?? $this->secret('Administrator password');
        if (!$adminPassword) {
            $this->error('Administrator password is required.');
            return null;
        }

        if (strlen($adminPassword) < 8) {
            $this->error('Password must be at least 8 characters.');
            return null;
        }

        $dbName = config('tenancy.database_prefix', 'pms_tenant_') . $slug;
        $domain = $this->option('domain') ?? $slug . '.' . config('tenancy.domain', 'pms.test');
        $plan = $this->option('plan');
        $type = $this->option('type');
        $status = $this->option('status');
        $billingPeriod = $this->option('billing-period');
        $timezone = $this->option('timezone');

        // Validate plan if provided
        if ($plan) {
            $planRecord = OrganizationPlan::where('slug', $plan)->where('is_active', true)->first();
            if (!$planRecord) {
                $this->error("Plan '{$plan}' not found. Available plans: " .
                    OrganizationPlan::where('is_active', true)->pluck('slug')->implode(', '));
                return null;
            }
        }

        return [
            'name'              => $name,
            'slug'              => $slug,
            'database_name'     => $dbName,
            'domain'            => $domain,
            'admin_name'        => $adminName,
            'admin_email'       => $adminEmail,
            'admin_password'    => $adminPassword,
            'plan'              => $plan,
            'type'              => $type,
            'status'            => $status,
            'billing_period'    => $billingPeriod,
            'timezone'          => $timezone,
        ];
    }

    /**
     * Run pre-flight checks before provisioning.
     */
    protected function preFlightChecks(array $data, DomainRegistrar $domainRegistrar): bool
    {
        $this->info('Running pre-flight checks...');

        // Check slug uniqueness
        if (Organization::where('slug', $data['slug'])->exists()) {
            $this->error("Organization with slug '{$data['slug']}' already exists.");
            return false;
        }
        $this->line("  [OK] Slug '{$data['slug']}' is available");

        // Check database name uniqueness
        if (Organization::where('database_name', $data['database_name'])->exists()) {
            $this->error("Database name '{$data['database_name']}' is already in use.");
            return false;
        }
        $this->line("  [OK] Database name '{$data['database_name']}' is available");

        // Check domain uniqueness
        if ($domainRegistrar->exists($data['domain'])) {
            $this->error("Domain '{$data['domain']}' is already registered.");
            return false;
        }
        $this->line("  [OK] Domain '{$data['domain']}' is available");

        // Check email uniqueness in master (not critical, but warn)
        // (Email is in tenant DB, not master, so we can't check here)

        $this->line("  [OK] All pre-flight checks passed");
        $this->newLine();

        return true;
    }

    /**
     * Show confirmation before provisioning.
     */
    protected function confirmProvisioning(array $data): bool
    {
        $this->info('Provisioning Summary:');
        $this->newLine();

        $this->table(['Field', 'Value'], [
            ['Organization',   $data['name']],
            ['Slug',           $data['slug']],
            ['Type',           $data['type']],
            ['Status',         $data['status']],
            ['Database',       $data['database_name']],
            ['Domain',         $data['domain']],
            ['Plan',           $data['plan'] ?? 'default'],
            ['Billing',        $data['billing_period']],
            ['Admin Name',     $data['admin_name']],
            ['Admin Email',    $data['admin_email']],
            ['Timezone',       $data['timezone']],
        ]);

        $this->newLine();

        return $this->confirm('Proceed with provisioning?', true);
    }
}
