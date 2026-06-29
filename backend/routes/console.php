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

/*
| Artisan Commands
| Custom Artisan commands for the application.
*/

// Inspire command: displays an inspiring quote
Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
