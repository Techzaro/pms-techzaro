<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Console\Command;

class MigrateTenants extends Command
{
    protected $signature = 'tenants:migrate
        {--database= : Run migrations on a specific tenant database name}
        {--all : Run migrations on all tenant databases}
        {--status : Show migration status only (no execute)}';

    protected $description = 'Run pending migrations on tenant databases';

    public function handle(DatabaseProvisionService $db)
    {
        $database = $this->option('database');
        $runAll = $this->option('all');
        $statusOnly = $this->option('status');

        if (!$database && !$runAll) {
            $this->error('Please specify --database=<name> or --all');
            $this->newLine();
            $this->line('Usage:');
            $this->line('  php artisan tenants:migrate --database=pms_tenant_decent-fur');
            $this->line('  php artisan tenants:migrate --all');
            $this->line('  php artisan tenants:migrate --database=pms_tenant_decent-fur --status');
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

        foreach ($databases as $db) {
            $this->line("Database: <comment>{$db}</comment>");

            if ($statusOnly) {
                $this->showStatus($db);
            } else {
                $this->runMigration($db, $db);
            }

            $this->newLine();
        }

        return Command::SUCCESS;
    }

    private function runMigration(string $databaseName, string $label): void
    {
        try {
            $db = app(DatabaseProvisionService::class);
            $db->runMigrations($databaseName);
            $output = \Illuminate\Support\Facades\Artisan::output();
            $this->line("  <info>✓ Migrations completed</info>");
            if ($output) {
                foreach (explode("\n", trim($output)) as $line) {
                    $this->line("    {$line}");
                }
            }
        } catch (\Throwable $e) {
            $this->error("  ✗ Failed: {$e->getMessage()}");
        }
    }

    private function showStatus(string $databaseName): void
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        config()->set('database.connections.tenant_status', [
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

        try {
            \Illuminate\Support\Facades\Artisan::call('migrate:status', [
                '--database' => 'tenant_status',
            ]);
            $output = \Illuminate\Support\Facades\Artisan::output();
            foreach (explode("\n", trim($output)) as $line) {
                $this->line("  {$line}");
            }
        } catch (\Throwable $e) {
            $this->error("  ✗ Failed to check status: {$e->getMessage()}");
        }
    }
}
