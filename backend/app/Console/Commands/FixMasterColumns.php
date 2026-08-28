<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixMasterColumns extends Command
{
    protected $signature = 'master:fix-columns';

    protected $description = 'Fix missing columns and tables in master (saas_master) database';

    protected array $columnFixes = [
        'organizations' => [
            ['name' => 'admin_name',  'definition' => "VARCHAR(255) NULL AFTER `slug`"],
            ['name' => 'admin_email', 'definition' => "VARCHAR(255) NULL AFTER `admin_name`"],
            ['name' => 'default_timezone',             'definition' => "VARCHAR(64) DEFAULT 'UTC' AFTER `status`"],
            ['name' => 'enforce_working_hours',        'definition' => "TINYINT(1) DEFAULT 0 AFTER `default_timezone`"],
            ['name' => 'working_hours',                'definition' => "JSON NULL AFTER `enforce_working_hours`"],
            ['name' => 'storage_auto_delete',          'definition' => "TINYINT(1) DEFAULT 0 AFTER `settings`"],
            ['name' => 'storage_overwrite',            'definition' => "TINYINT(1) DEFAULT 1"],
            ['name' => 'storage_warn_threshold',       'definition' => "INT DEFAULT 80"],
            ['name' => 'storage_critical_threshold',   'definition' => "INT DEFAULT 90"],
            ['name' => 'storage_pin_threshold',        'definition' => "INT DEFAULT 95"],
            ['name' => 'storage_driver',               'definition' => "VARCHAR(255) DEFAULT 'local'"],
            ['name' => 'storage_s3_prefix',            'definition' => "VARCHAR(255) NULL"],
            ['name' => 'storage_s3_bucket',            'definition' => "VARCHAR(255) NULL"],
            ['name' => 'storage_s3_region',            'definition' => "VARCHAR(255) DEFAULT 'us-east-1'"],
            ['name' => 'storage_s3_access_key',        'definition' => "VARCHAR(255) NULL"],
            ['name' => 'storage_s3_secret_key',        'definition' => "VARCHAR(255) NULL"],
            ['name' => 'storage_cleanup_months',       'definition' => "INT DEFAULT 6"],
            ['name' => 'storage_large_file_threshold_mb', 'definition' => "INT DEFAULT 500"],
            ['name' => 'storage_auto_cleanup',         'definition' => "TINYINT(1) DEFAULT 1"],
            ['name' => 'custom_max_storage_gb',        'definition' => "INT NULL"],
        ],
    ];

    protected array $tableCreates = [
        'personal_access_tokens' => "CREATE TABLE IF NOT EXISTS `personal_access_tokens` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `tokenable_type` VARCHAR(255) NOT NULL,
            `tokenable_id` BIGINT UNSIGNED NOT NULL,
            `name` VARCHAR(255) NOT NULL,
            `token` VARCHAR(64) NOT NULL,
            `abilities` TEXT NULL,
            `last_used_at` TIMESTAMP NULL,
            `expires_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY (`token`),
            INDEX `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`, `tokenable_id`),
            INDEX `personal_access_tokens_expires_at_index` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];

    public function handle(): int
    {
        $result = self::fixMasterDatabaseQuiet();
        foreach ($result['logs'] as $log) {
            if ($log['type'] === 'info') {
                $this->line("  <info>{$log['message']}</info>");
            } else {
                $this->error("  {$log['message']}");
            }
        }
        $this->info("Total fixes applied: {$result['fixed']}");
        return Command::SUCCESS;
    }

    public static function fixMasterDatabaseQuiet(): array
    {
        $logs = [];
        $fixed = 0;

        $masterConnection = config('tenancy.master_connection', 'mysql_master');
        $masterConfig = config("database.connections.{$masterConnection}");

        $pdo = DB::connection($masterConnection)->getPdo();
        $databaseName = $masterConfig['database'];

        $instance = new self();

        foreach ($instance->tableCreates as $table => $sql) {
            if (!self::tableExists($databaseName, $table)) {
                try {
                    $pdo->exec($sql);
                    $logs[] = ['type' => 'info', 'message' => "+ Created table `{$table}`"];
                    $fixed++;
                } catch (\Throwable $e) {
                    $logs[] = ['type' => 'error', 'message' => "Failed to create `{$table}`: {$e->getMessage()}"];
                }
            }
        }

        foreach ($instance->columnFixes as $table => $columns) {
            foreach ($columns as $col) {
                if (!self::columnExists($databaseName, $table, $col['name'])) {
                    try {
                        $escapedTable = str_replace('`', '``', $table);
                        $escapedCol = str_replace('`', '``', $col['name']);
                        $pdo->exec("ALTER TABLE `{$escapedTable}` ADD COLUMN `{$escapedCol}` {$col['definition']}");
                        $logs[] = ['type' => 'info', 'message' => "+ Added column `{$table}`.`{$col['name']}`"];
                        $fixed++;
                    } catch (\Throwable $e) {
                        $logs[] = ['type' => 'error', 'message' => "Failed to add `{$table}`.`{$col['name']}`: {$e->getMessage()}"];
                    }
                }
            }
        }

        if ($fixed === 0) {
            $logs[] = ['type' => 'info', 'message' => "No fixes needed"];
        }

        return ['fixed' => $fixed, 'logs' => $logs];
    }

    private static function columnExists(string $database, string $table, string $column): bool
    {
        $result = DB::connection('mysql_master')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", [$database, $table, $column]);

        return $result[0]->cnt > 0;
    }

    private static function tableExists(string $database, string $table): bool
    {
        $result = DB::connection('mysql_master')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [$database, $table]);

        return $result[0]->cnt > 0;
    }
}
