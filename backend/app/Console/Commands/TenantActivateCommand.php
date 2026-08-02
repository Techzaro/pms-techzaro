<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\TenantLifecycleService;
use Illuminate\Console\Command;

class TenantActivateCommand extends Command
{
    protected $signature = 'tenant:activate {slugOrId : Organization slug or ID}';

    protected $description = 'Activate a suspended or trial tenant organization';

    public function handle(TenantLifecycleService $lifecycle): int
    {
        $slugOrId = $this->argument('slugOrId');

        $org = $this->resolveOrganization($slugOrId);
        if (!$org) return 1;

        if ($org->status === 'active') {
            $this->warn("Organization '{$org->slug}' is already active.");
            return 0;
        }

        $this->info("Activating organization: {$org->name} ({$org->slug})...");

        try {
            $lifecycle->activate($org);
            $this->newLine();
            $this->info("Organization '{$org->slug}' has been activated.");
            return 0;
        } catch (\InvalidArgumentException $e) {
            $this->error("Cannot activate: {$e->getMessage()}");
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
