<?php

/**
 * Console route definitions for the PMS backend.
 * This file defines Artisan commands and scheduled tasks.
 */
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Console\Commands\SendEventReminders;

/*
| Scheduled Tasks
| Define scheduled commands and cron jobs.
*/

// Send event reminders every minute
Schedule::command('events:send-reminders')->everyMinute();
Schedule::command('events:process-reminders')->everyMinute();

// Send task reminders every 5 minutes
Schedule::command('tasks:send-reminders')->everyFiveMinutes();

// Check task deadlines every 5 minutes
Schedule::command('tasks:check-deadlines')->everyFiveMinutes();

// Generate daily deliverables for recurring tasks at midnight
Schedule::command('deliverables:generate-daily')->dailyAt('00:01');

// Cleanup and archive old drafts daily at 3:00 AM
Schedule::job(new \App\Jobs\CleanupDraftsJob)->dailyAt('03:00');

// Renew expired subscriptions and create pending billing invoices daily at 1:00 AM
Schedule::command('subscriptions:renew')->dailyAt('01:00')->withoutOverlapping();

/*
| Artisan Commands
| Custom Artisan commands for the application.
*/

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Manually register FixTenantColumns command
Artisan::command('tenants:fix-columns', function () {
    $database = $this->option('database');
    $runAll = $this->option('all');

    if (!$database && !$runAll) {
        $this->error('Usage: php artisan tenants:fix-columns --all OR --database=<name>');
        return;
    }

    $databases = [];

    if ($database) {
        $databases[] = $database;
    } elseif ($runAll) {
        $organizations = \App\Models\Master\Organization::whereIn('status', ['active', 'trial'])->get();
        if ($organizations->isEmpty()) {
            $this->warn('No active/trial organizations found.');
            return;
        }
        foreach ($organizations as $org) {
            $databases[] = $org->database_name;
        }
    }

    $this->info("Processing " . count($databases) . " tenant database(s)...");

    foreach ($databases as $db) {
        $result = \App\Console\Commands\FixTenantColumns::fixDatabaseQuiet($db);
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
})->purpose('Fix missing columns in tenant databases')
  ->addOption('database', null, \Symfony\Component\Console\Input\InputOption::VALUE_REQUIRED, 'Specific tenant database')
  ->addOption('all', null, \Symfony\Component\Console\Input\InputOption::VALUE_NONE, 'Fix all tenant databases');

// Manually register FixMasterColumns command
Artisan::command('master:fix-columns', function () {
    $result = \App\Console\Commands\FixMasterColumns::fixMasterDatabaseQuiet();
    foreach ($result['logs'] as $log) {
        if ($log['type'] === 'info') {
            $this->line("  <info>{$log['message']}</info>");
        } else {
            $this->error("  {$log['message']}");
        }
    }
    $this->info("Total fixes applied: {$result['fixed']}");
})->purpose('Fix missing columns in master (saas_master) database');
