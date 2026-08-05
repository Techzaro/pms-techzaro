<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\TenantLifecycleService;
use Illuminate\Console\Command;

class TenantRestoreCommand extends Command
{
    protected $signature = 'tenant:restore {slugOrId : Organization slug or ID}';

    protected $description = 'Restore an archived or soft-deleted tenant organization';

    public function handle(TenantLifecycleService $lifecycle): int
    {
        $slugOrId = $this->argument('slugOrId');

        // Try to find the organization, including soft-deleted
        $org = is_numeric($slugOrId)
            ? Organization::withTrashed()->find((int) $slugOrId)
            : Organization::withTrashed()->where('slug', $slugOrId)->first();

        if (!$org) {
            $this->error("Organization not found: {$slugOrId}");
            return 1;
        }

        if ($org->status === 'active' && !$org->trashed()) {
            $this->warn("Organization '{$org->slug}' is already active and not deleted.");
            return 0;
        }

        $stateLabel = $org->trashed() ? 'soft-deleted' : $org->status;
        $this->info("Restoring organization: {$org->name} ({$org->slug}) from {$stateLabel}...");

        try {
            $lifecycle->restore($org);
            $this->newLine();
            $this->info("Organization '{$org->slug}' has been restored.");
            $this->line("Status: active");
            $this->line("Database: {$org->database_name}");
            return 0;
        } catch (\InvalidArgumentException $e) {
            $this->error("Cannot restore: {$e->getMessage()}");
            return 1;
        }
    }
}
