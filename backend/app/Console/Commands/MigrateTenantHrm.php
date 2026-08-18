<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Console\Command;

class MigrateTenantHrm extends Command
{
    protected $signature = 'tenants:migrate-hrm {--organization= : Organization slug or ID}';

    protected $description = 'Create or update HRM tables in organization tenant databases';

    public function handle(DatabaseProvisionService $databases): int
    {
        $query = Organization::whereIn('status', ['active', 'trial']);
        $organization = $this->option('organization');

        if ($organization !== null && $organization !== '') {
            $query->where(function ($builder) use ($organization) {
                $builder->where('slug', $organization);
                if (ctype_digit((string) $organization)) {
                    $builder->orWhere('id', (int) $organization);
                }
            });
        }

        $organizations = $query->get();
        if ($organizations->isEmpty()) {
            $this->error('No matching active or trial organization was found.');
            return self::FAILURE;
        }

        $failed = 0;
        foreach ($organizations as $org) {
            try {
                $this->components->task(
                    "Migrating HRM tables for {$org->name} ({$org->slug})",
                    function () use ($databases, $org) {
                        $databases->runHrmMigrations($org->database_name);
                        $databases->normalizeTenantOrganizationIds($org->database_name, $org->id);
                        $databases->repairPendingHrmApprovalChains($org->database_name, $org->id);
                    }
                );
            } catch (\Throwable $exception) {
                $failed++;
                $this->error("{$org->slug}: {$exception->getMessage()}");
            }
        }

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
