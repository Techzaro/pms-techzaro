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

// Inspire command: displays an inspiring quote
Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
