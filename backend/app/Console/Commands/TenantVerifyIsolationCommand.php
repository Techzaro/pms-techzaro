<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\IsolationValidator;
use Illuminate\Console\Command;

class TenantVerifyIsolationCommand extends Command
{
    protected $signature = 'tenant:verify-isolation {slugOrId? : Organization slug or ID (omit to verify all)}';

    protected $description = 'Verify tenant data isolation for one or all organizations';

    public function handle(IsolationValidator $validator): int
    {
        $slugOrId = $this->argument('slugOrId');

        if ($slugOrId) {
            // Verify single organization
            $org = is_numeric($slugOrId)
                ? Organization::find((int) $slugOrId)
                : Organization::where('slug', $slugOrId)->first();

            if (!$org) {
                $this->error("Organization not found: {$slugOrId}");
                return 1;
            }

            $this->info("Verifying isolation for: {$org->name} ({$org->slug})...");
            $this->newLine();

            $result = $validator->validate($org);

            $this->displayResult($org->slug, $result);

            return $result['passed'] ? 0 : 1;
        }

        // Verify all organizations
        $this->info("Verifying isolation for ALL organizations...");
        $this->newLine();

        $result = $validator->validateAll();

        foreach ($result['results'] as $slug => $orgResult) {
            $this->displayResult($slug, $orgResult);
            $this->newLine();
        }

        if ($result['passed']) {
            $this->info("ALL isolation checks passed!");
        } else {
            $this->error("Some isolation checks FAILED.");
        }

        return $result['passed'] ? 0 : 1;
    }

    protected function displayResult(string $slug, array $result): void
    {
        $status = $result['passed'] ? 'PASS' : 'FAIL';
        $icon = $result['passed'] ? "\033[32m" : "\033[31m";

        $this->line("  [{$status}] {$slug}");

        foreach ($result['checks'] as $checkName => $check) {
            $checkIcon = $check['passed'] ? "\033[32mOK\033[0m" : "\033[31mFAIL\033[0m";
            $this->line("    [{$checkIcon}] {$checkName}: {$check['message']}");
        }
    }
}
