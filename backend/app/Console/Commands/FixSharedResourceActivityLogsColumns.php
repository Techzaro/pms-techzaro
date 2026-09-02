<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixSharedResourceActivityLogsColumns extends Command
{
    protected $signature = 'sharing:fix-activity-columns';
    protected $description = 'Add missing connection_id column to shared_resource_activity_logs in all tenant databases';

    public function handle(): int
    {
        $orgs = DB::connection('mysql_master')->table('organizations')
            ->whereNotIn('status', ['deleted', 'archived'])
            ->select('id', 'slug', 'database_name')
            ->get();

        $prefix = config('database.connections.tenant.prefix', 'pms_tenant_');
        $suffix = config('database.connections.tenant.suffix', '');

        $fixed = 0;

        foreach ($orgs as $org) {
            $dbName = $org->database_name ?? ($prefix . $org->slug . $suffix);

            try {
                $columns = DB::select("SHOW COLUMNS FROM `$dbName`.`shared_resource_activity_logs`");
                $columnNames = array_map(fn($c) => $c->Field, $columns);

                if (!in_array('connection_id', $columnNames)) {
                    DB::statement("ALTER TABLE `$dbName`.`shared_resource_activity_logs` ADD COLUMN `connection_id` BIGINT UNSIGNED NULL AFTER `id`");
                    DB::statement("ALTER TABLE `$dbName`.`shared_resource_activity_logs` ADD INDEX `connection_id` (`connection_id`)");
                    $this->info("Fixed: Added connection_id to {$dbName}");
                    $fixed++;
                } else {
                    $this->line("OK: {$dbName} already has connection_id");
                }
            } catch (\Exception $e) {
                $this->error("Failed for {$dbName}: " . $e->getMessage());
            }
        }

        $this->info("Done. Fixed {$fixed} database(s).");
        return Command::SUCCESS;
    }
}
