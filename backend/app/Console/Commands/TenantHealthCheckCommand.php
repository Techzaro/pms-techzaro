<?php

namespace App\Console\Commands;

use App\Services\Saas\Infrastructure\HealthCheckService;
use Illuminate\Console\Command;

class TenantHealthCheckCommand extends Command
{
    protected $signature = 'tenant:health-check {slugOrId? : Organization slug or ID (omit for global check)}';

    protected $description = 'Run health checks on the SaaS platform and tenant databases';

    public function handle(HealthCheckService $healthCheck): int
    {
        $slugOrId = $this->argument('slugOrId');

        $this->info('Running health checks...');
        $this->newLine();

        if ($slugOrId) {
            $org = is_numeric($slugOrId)
                ? \App\Models\Master\Organization::find((int) $slugOrId)
                : \App\Models\Master\Organization::where('slug', $slugOrId)->first();

            if (!$org) {
                $this->error("Organization not found: {$slugOrId}");
                return 1;
            }

            $result = $healthCheck->check($org);
            $this->displayResult("Tenant: {$org->slug}", $result);
        } else {
            $result = $healthCheck->check();
            $this->displayResult('Global', $result);

            // Also check all tenants
            $organizations = \App\Models\Master\Organization::all();
            foreach ($organizations as $org) {
                $this->newLine();
                $tenantResult = $healthCheck->check($org);
                $this->displayResult("Tenant: {$org->slug}", $tenantResult);
            }
        }

        $this->newLine();
        $this->info("Overall: {$result['overall']}");

        return $result['overall'] === 'healthy' ? 0 : 1;
    }

    protected function displayResult(string $label, array $result): void
    {
        $statusIcon = $result['overall'] === 'healthy' ? "\033[32mOK\033[0m" : "\033[31mFAIL\033[0m";
        $this->line("  [{$statusIcon}] {$label}");

        foreach ($result as $key => $check) {
            if (!is_array($check) || !isset($check['status'])) continue;
            $icon = $check['status'] === 'healthy' ? "\033[32mOK\033[0m" : "\033[31mFAIL\033[0m";
            $extra = '';
            if (isset($check['latency_ms'])) $extra .= " ({$check['latency_ms']}ms)";
            if (isset($check['driver'])) $extra .= " [{$check['driver']}]";
            if (isset($check['error'])) $extra .= " Error: {$check['error']}";
            $this->line("    [{$icon}] {$key}{$extra}");
        }
    }
}
