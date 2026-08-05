<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Infrastructure\TenantScheduler;
use Illuminate\Console\Command;

/**
 * Example: Tenant-aware scheduled command.
 *
 * Demonstrates how to run a task for every active tenant.
 * Usage: php artisan tenant:run-per-tenant daily-report
 */
class TenantRunPerTenantCommand extends Command
{
    protected $signature = 'tenant:run-per-tenant {task : The task to run (daily-report)}';

    protected $description = 'Run a task for every active tenant (example tenant-aware command)';

    public function handle(TenantScheduler $scheduler): int
    {
        $task = $this->argument('task');

        $this->info("Running task '{$task}' for all active tenants...");
        $this->newLine();

        $result = $scheduler->forEveryTenant(function (Organization $org) use ($task) {
            // This code runs with the tenant's DB connection active
            $this->line("  Processing: {$org->slug} ({$org->database_name})");

            match ($task) {
                'daily-report' => $this->dailyReport($org),
                default => $this->error("Unknown task: {$task}"),
            };
        });

        $this->newLine();
        $this->info("Completed: {$result['executed']} succeeded, {$result['failed']} failed");

        if (!empty($result['errors'])) {
            $this->newLine();
            $this->error('Errors:');
            foreach ($result['errors'] as $slug => $error) {
                $this->line("  {$slug}: {$error}");
            }
        }

        return $result['failed'] > 0 ? 1 : 0;
    }

    protected function dailyReport(Organization $org): void
    {
        // Example: count users in tenant DB
        $userCount = \Illuminate\Support\Facades\DB::table('users')->count();
        $this->line("    Users: {$userCount}");
    }
}
