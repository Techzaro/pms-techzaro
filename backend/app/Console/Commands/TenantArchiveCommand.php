<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\TenantLifecycleService;
use Illuminate\Console\Command;

class TenantArchiveCommand extends Command
{
    protected $signature = 'tenant:archive {slugOrId : Organization slug or ID}
                            {--reason= : Reason for archiving}';

    protected $description = 'Archive a tenant organization (database preserved, can be restored)';

    public function handle(TenantLifecycleService $lifecycle): int
    {
        $slugOrId = $this->argument('slugOrId');
        $reason = $this->option('reason') ?? ($this->ask('Reason for archiving') ?: null);

        $org = $this->resolveOrganization($slugOrId);
        if (!$org) return 1;

        if ($org->status === 'archived') {
            $this->warn("Organization '{$org->slug}' is already archived.");
            return 0;
        }

        $this->warn("Archiving organization: {$org->name} ({$org->slug})...");
        $this->warn("Database will be preserved. Organization can be restored later.");

        if (!$this->confirm("Proceed with archiving?", false)) {
            return 0;
        }

        try {
            $lifecycle->archive($org, $reason);
            $this->newLine();
            $this->info("Organization '{$org->slug}' has been archived.");
            $this->line("Database '{$org->database_name}' has been preserved.");
            $this->line("Use 'tenant:restore {$org->slug}' to restore later.");
            return 0;
        } catch (\InvalidArgumentException $e) {
            $this->error("Cannot archive: {$e->getMessage()}");
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
