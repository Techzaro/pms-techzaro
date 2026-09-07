<?php

namespace App\Listeners;

use Illuminate\Database\Events\MigrationsFinished;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;

/**
 * AfterMigrationListener.
 *
 * Automatically syncs all tenant databases after master DB migrations complete.
 * This ensures new columns/tables from migrations are propagated to all tenants.
 *
 * Only fires when `php artisan migrate` is run on the MASTER database.
 * Does NOT fire for tenant-specific operations.
 */
class AfterMigrationListener
{
    /**
     * Handle the migration finished event.
     */
    public function handle(MigrationsFinished $event): void
    {
        // Only sync if this was a real migration run (not dry-run)
        if ($event->force === false && app()->runningInConsole()) {
            // When running interactively, ask before syncing
            if (app('console')->confirm('Sync tenant databases with new schema?', false)) {
                $this->syncTenants();
            }
            return;
        }

        // Auto-sync silently in background
        $this->syncTenants();
    }

    /**
     * Run tenants:sync-schema --all in the background.
     */
    protected function syncTenants(): void
    {
        try {
            Log::info('AfterMigrationListener: Starting automatic tenant schema sync');

            Artisan::call('tenants:sync-schema', ['--all' => true, '--quiet' => true]);

            $output = Artisan::output();
            Log::info('AfterMigrationListener: Sync completed', ['output' => trim($output)]);
        } catch (\Throwable $e) {
            Log::error('AfterMigrationListener: Sync failed: ' . $e->getMessage());
        }
    }
}
