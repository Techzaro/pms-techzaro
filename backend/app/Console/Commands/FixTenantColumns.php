<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixTenantColumns extends Command
{
    protected $signature = 'tenants:fix-columns
        {--database= : Fix a specific tenant database}
        {--all : Fix all tenant databases}';

    protected $description = 'Detect and add missing columns to tenant databases';

    protected array $columnFixes = [
        'users' => [
            ['name' => 'status',                        'definition' => "VARCHAR(32) DEFAULT 'Active' AFTER `active`"],
            ['name' => 'notification_preferences',      'definition' => "JSON NULL"],
            ['name' => 'deletion_requested',            'definition' => "TINYINT(1) DEFAULT 0 AFTER `active`"],
            ['name' => 'deletion_requested_by',         'definition' => "BIGINT UNSIGNED NULL AFTER `deletion_requested`"],
            ['name' => 'slack_webhook_url',             'definition' => "TEXT NULL AFTER `notification_preferences`"],
            ['name' => 'google_chat_webhook_url',       'definition' => "TEXT NULL AFTER `slack_webhook_url`"],
            ['name' => 'ms_teams_webhook_url',          'definition' => "TEXT NULL AFTER `google_chat_webhook_url`"],
        ],
        'tasks' => [
            ['name' => 'recurrence_start_date',         'definition' => "TIMESTAMP NULL AFTER `recurrence_settings`"],
            ['name' => 'recurrence_end_date',           'definition' => "TIMESTAMP NULL AFTER `recurrence_start_date`"],
            ['name' => 'has_edited_submission',         'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
        ],
        'deliverables' => [
            ['name' => 'has_edited_submission',         'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
        ],
        'teams' => [
            ['name' => 'status',                        'definition' => "VARCHAR(255) DEFAULT 'active' AFTER `description`"],
            ['name' => 'is_draft',                      'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
        ],
        'conversations' => [
            ['name' => 'org_id',                        'definition' => "BIGINT UNSIGNED NULL AFTER `created_by`"],
        ],
    ];

    protected array $tableCreates = [
        'notification_comments' => "CREATE TABLE IF NOT EXISTS `notification_comments` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `notification_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `comment` TEXT NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'templates' => "CREATE TABLE IF NOT EXISTS `templates` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `title` VARCHAR(255) NOT NULL,
            `description` TEXT NULL,
            `category` VARCHAR(255) DEFAULT 'General',
            `visibility_level` ENUM('private','project_team','department_team','organization') DEFAULT 'private',
            `project_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(255) NULL,
            `organization` VARCHAR(255) NULL,
            `data` JSON NULL,
            `file_path` VARCHAR(255) NULL,
            `created_by` BIGINT UNSIGNED NOT NULL,
            `updated_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'knowledge_bases' => "CREATE TABLE IF NOT EXISTS `knowledge_bases` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `title` VARCHAR(255) NOT NULL,
            `content` LONGTEXT NULL,
            `category` VARCHAR(255) DEFAULT 'General',
            `visibility_level` ENUM('private','project_team','department_team','organization') DEFAULT 'organization',
            `project_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(255) NULL,
            `organization` VARCHAR(255) NULL,
            `file_path` VARCHAR(255) NULL,
            `file_name` VARCHAR(255) NULL,
            `created_by` BIGINT UNSIGNED NOT NULL,
            `updated_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback' => "CREATE TABLE IF NOT EXISTS `feedback` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `reference_number` VARCHAR(255) NOT NULL,
            `feedback_type` ENUM('Bug Report','Feature Request','General Suggestion','Feature Rating','General Feedback') NOT NULL,
            `subject` VARCHAR(255) NOT NULL,
            `description` TEXT NOT NULL,
            `priority` ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
            `rating` TINYINT UNSIGNED NULL,
            `status` ENUM('New','Under Review','Accepted','Planned','In Development','Testing','Resolved','Closed','Rejected') DEFAULT 'New',
            `assigned_to` BIGINT UNSIGNED NULL,
            `screenshot_path` VARCHAR(255) NULL,
            `recording_path` VARCHAR(255) NULL,
            `attachment_path` VARCHAR(255) NULL,
            `organization_id` BIGINT UNSIGNED NULL,
            `organization_name` VARCHAR(255) NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `user_name` VARCHAR(255) NOT NULL,
            `user_role` VARCHAR(255) NOT NULL,
            `module` VARCHAR(255) NULL,
            `current_page` VARCHAR(255) NULL,
            `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `browser` VARCHAR(255) NULL,
            `operating_system` VARCHAR(255) NULL,
            `device_type` VARCHAR(255) NULL,
            `ip_address` VARCHAR(255) NULL,
            `app_version` VARCHAR(255) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY (`reference_number`),
            FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            INDEX `feedback_type` (`feedback_type`),
            INDEX `status` (`status`),
            INDEX `priority` (`priority`),
            INDEX `user_id` (`user_id`),
            INDEX `organization_id` (`organization_id`),
            INDEX `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback_activity_logs' => "CREATE TABLE IF NOT EXISTS `feedback_activity_logs` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `feedback_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `action` VARCHAR(255) NOT NULL,
            `details` TEXT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback_notes' => "CREATE TABLE IF NOT EXISTS `feedback_notes` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `feedback_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `note` TEXT NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];

    public function handle(): int
    {
        $database = $this->option('database');
        $runAll = $this->option('all');

        if (!$database && !$runAll) {
            $this->error('Please specify --database=<name> or --all');
            $this->newLine();
            $this->line('Usage:');
            $this->line('  php artisan tenants:fix-columns --database=techxaro_app_one_techxaro-6');
            $this->line('  php artisan tenants:fix-columns --all');
            return Command::INVALID;
        }

        $databases = [];

        if ($database) {
            $databases[] = $database;
        } elseif ($runAll) {
            $organizations = Organization::whereIn('status', ['active', 'trial'])->get();
            if ($organizations->isEmpty()) {
                $this->warn('No active/trial organizations found.');
                return Command::SUCCESS;
            }
            foreach ($organizations as $org) {
                $databases[] = $org->database_name;
            }
        }

        $this->info("Processing " . count($databases) . " tenant database(s)...");
        $this->newLine();

        $totalFixed = 0;

        foreach ($databases as $db) {
            $result = self::fixDatabaseQuiet($db);
            $totalFixed += $result['fixed'];

            $this->line("Database: <comment>{$db}</comment>");
            foreach ($result['logs'] as $log) {
                if ($log['type'] === 'info') {
                    $this->line("  <info>{$log['message']}</info>");
                } else {
                    $this->error("  {$log['message']}");
                }
            }
            $this->newLine();
        }

        $this->info("Done. Total fixes applied: {$totalFixed}");

        return Command::SUCCESS;
    }

    /**
     * Fix a tenant database quietly (no output). Returns logs + count.
     */
    public static function fixDatabaseQuiet(string $databaseName): array
    {
        $logs = [];
        $fixed = 0;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        config()->set('database.connections.tenant_fix', [
            'driver'    => 'mysql',
            'host'      => $masterConfig['host'],
            'port'      => $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $masterConfig['username'],
            'password'  => $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        DB::purge('tenant_fix');
        DB::reconnect('tenant_fix');

        $pdo = DB::connection('tenant_fix')->getPdo();

        $instance = new self();

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

        if ($fixed === 0) {
            $logs[] = ['type' => 'info', 'message' => "No fixes needed"];
        }

        DB::purge('tenant_fix');

        return ['fixed' => $fixed, 'logs' => $logs];
    }

    /**
     * Programmatic call (for ProvisioningOrchestrator). Returns fixed count.
     */
    public static function fixDatabaseProgrammatic(string $databaseName): int
    {
        $result = self::fixDatabaseQuiet($databaseName);
        return $result['fixed'];
    }

    private static function columnExists(string $database, string $table, string $column): bool
    {
        $result = DB::connection('tenant_fix')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", [$database, $table, $column]);

        return $result[0]->cnt > 0;
    }

    private static function tableExists(string $database, string $table): bool
    {
        $result = DB::connection('tenant_fix')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [$database, $table]);

        return $result[0]->cnt > 0;
    }
}
