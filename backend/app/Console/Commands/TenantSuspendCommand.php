<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\TenantLifecycleService;
use Illuminate\Console\Command;

class TenantSuspendCommand extends Command
{
    protected $signature = 'tenant:suspend {slugOrId : Organization slug or ID}
                            {--reason= : Reason for suspension}';

    protected $description = 'Suspend a tenant organization (blocks all requests)';

    public function handle(TenantLifecycleService $lifecycle): int
    {
        $slugOrId = $this->argument('slugOrId');
        $reason = $this->option('reason') ?? ($this->ask('Reason for suspension') ?: null);

        $org = $this->resolveOrganization($slugOrId);
        if (!$org) return 1;

        if ($org->status === 'suspended') {
            $this->warn("Organization '{$org->slug}' is already suspended.");
            return 0;
        }

        $this->info("Suspending organization: {$org->name} ({$org->slug})...");

        try {
            $lifecycle->suspend($org, $reason);
            $this->newLine();
            $this->info("Organization '{$org->slug}' has been suspended.");
            if ($reason) {
                $this->line("Reason: {$reason}");
            }
            return 0;
        } catch (\InvalidArgumentException $e) {
            $this->error("Cannot suspend: {$e->getMessage()}");
            return 1;
        }
    }

    protected function resolveOrganization(string $slugOrId): ?Organization
    {
        $org = is_numeric($slugOrId)
            ? Organization::find((int) $slugOrId)
            : Organization::where('slug', $slugOrId)->first();

        if (!$org) {
            $this->error("Organization not found: {$slugOrId}");
            return null;
        }

        return $org;
    }
}
