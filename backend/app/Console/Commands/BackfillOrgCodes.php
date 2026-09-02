<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use Illuminate\Console\Command;

class BackfillOrgCodes extends Command
{
    protected $signature = 'org:backfill-codes';
    protected $description = 'Regenerate organization_code for all orgs using org-name-based prefix';

    public function handle(): int
    {
        $orgs = Organization::on('mysql_master')->withTrashed()->get();
        $updated = 0;

        foreach ($orgs as $org) {
            $newCode = Organization::generateOrganizationCode($org->name);
            $oldCode = $org->organization_code;

            $org->organization_code = $newCode;
            $org->saveQuietly();

            $this->line("{$org->name} (ID: {$org->id}): {$oldCode} → {$newCode}");
            $updated++;
        }

        $this->info("Done. Updated {$updated} organization(s).");
        return self::SUCCESS;
    }
}
