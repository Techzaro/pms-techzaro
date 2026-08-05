<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Setup the saas_master database.
 *
 * This command:
 * 1. Creates the saas_master database if it doesn't exist
 * 2. Runs the master migrations
 * 3. Seeds default plans, modules, and TechXaro tenant
 *
 * Usage: php artisan saas:setup-master
 */
class SetupMasterDatabase extends Command
{
    protected $signature = 'saas:setup-master
                            {--fresh : Drop and recreate the master database}';

    protected $description = 'Create and seed the saas_master database with plans, modules, and TechXaro tenant';

    public function handle(): int
    {
        $dbName = env('MASTER_DB_DATABASE', 'saas_master');
        $dbHost = env('MASTER_DB_HOST', '127.0.0.1');
        $dbPort = env('MASTER_DB_PORT', '3306');
        $dbUser = env('MASTER_DB_USERNAME', 'root');
        $dbPass = env('MASTER_DB_PASSWORD', '');

        $this->info('=== SaaS Master Database Setup ===');
        $this->newLine();

        // Step 1: Create the database
        $this->info("Step 1: Creating database '{$dbName}'...");

        try {
            $dsn = "mysql:host={$dbHost};port={$dbPort}";
            $pdo = new \PDO($dsn, $dbUser, $dbPass, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            ]);

            if ($this->option('fresh')) {
                $this->warn("  Dropping existing database '{$dbName}'...");
                $pdo->exec("DROP DATABASE IF EXISTS `{$dbName}`");
            }

            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $this->info("  Database '{$dbName}' ready.");
        } catch (\PDOException $e) {
            $this->error("  Failed to connect to MySQL: {$e->getMessage()}");
            $this->error("  Make sure MySQL is running and credentials are correct.");
            return 1;
        }

        // Step 2: Run master migrations
        $this->newLine();
        $this->info('Step 2: Running master database migrations...');

        $migrationExit = \Artisan::call('migrate', [
            '--database' => 'mysql_master',
            '--path'     => 'database/migrations/master',
            '--force'    => true,
        ]);

        if ($migrationExit !== 0) {
            $this->error('  Migration failed:');
            $this->error(\Artisan::output());
            return 1;
        }
        $this->info('  Migrations completed.');

        // Step 3: Seed the master database
        $this->newLine();
        $this->info('Step 3: Seeding master database...');

        $seedExit = \Artisan::call('db:seed', [
            '--class' => 'Database\\Seeders\\Master\\MasterDatabaseSeeder',
            '--force' => true,
        ]);

        if ($seedExit !== 0) {
            $this->error('  Seeding failed:');
            $this->error(\Artisan::output());
            return 1;
        }
        $this->info('  Seeding completed.');

        // Summary
        $this->newLine();
        $this->info('=== Setup Complete ===');
        $this->newLine();
        $this->info('Master database: ' . $dbName);
        $this->info('Connection name: mysql_master');
        $this->newLine();
        $this->info('Registered entities:');
        $this->line('  - 3 Plans (Starter, Standard, Enterprise)');
        $this->line('  - 17 Modules (projects, tasks, deliverables, etc.)');
        $this->line('  - 1 Organization (TechXaro - Tenant #1)');
        $this->newLine();
        $this->info('TechXaro tenant details:');
        $this->line('  Slug:     techxaro');
        $this->line('  Database: pms_techxaro (existing, unchanged)');
        $this->line('  Domain:   techxaro.pms.techxaro.com');
        $this->line('  Plan:     Starter (default)');
        $this->newLine();
        $this->info('Available commands:');
        $this->line('  php artisan tenant:list              List all tenants');
        $this->line('  php artisan tenant:create            Create a new tenant');
        $this->line('  php artisan tenant:info techxaro     Show TechXaro details');
        $this->line('  php artisan tenant:stats             Show platform stats');

        return 0;
    }
}
