<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\DatabaseBackupService;
use App\Services\Saas\Lifecycle\DatabaseRestoreService;
use Illuminate\Console\Command;

class TenantRestoreDbCommand extends Command
{
    protected $signature = 'tenant:restore-db {slugOrId : Organization slug or ID}
                            {--backup= : Backup name to restore from}
                            {--no-pre-backup : Skip creating a pre-restore backup}';

    protected $description = 'Restore a tenant database from a backup';

    public function handle(DatabaseRestoreService $restore, DatabaseBackupService $backup): int
    {
        $slugOrId = $this->argument('slugOrId');

        $org = $this->resolveOrganization($slugOrId);
        if (!$org) return 1;

        // List available backups
        $backups = $backup->listBackups($org);

        if (empty($backups)) {
            $this->error("No backups found for organization '{$org->slug}'.");
            $this->line("Create one first with: php artisan tenant:backup {$org->slug}");
            return 1;
        }

        $backupName = $this->option('backup');
        if (!$backupName) {
            $this->info("Available backups:");
            $this->newLine();
            $headers = ['Backup Name', 'Size', 'Created'];
            $rows = [];
            foreach ($backups as $b) {
                $rows[] = [
                    $b->backup_name,
                    $this->formatBytes($b->size_bytes),
                    $b->created_at,
                ];
            }
            $this->table($headers, $rows);
            $this->newLine();
            $backupName = $this->ask('Enter backup name to restore');
        }

        // Verify backup exists
        $backupRecord = $backup->getBackup($backupName);
        if (!$backupRecord) {
            $this->error("Backup '{$backupName}' not found.");
            return 1;
        }

        $createPreBackup = !$this->option('no-pre-backup');

        $this->warn("WARNING: This will overwrite the current database for '{$org->slug}'.");
        if ($createPreBackup) {
            $this->line("A pre-restore backup will be created automatically.");
        }

        if (!$this->confirm("Are you sure you want to restore from '{$backupName}'?", false)) {
            return 0;
        }

        $this->newLine();
        $this->info("Restoring database for: {$org->name}...");

        try {
            $result = $restore->restore($org, $backupName, $createPreBackup);
            $this->newLine();
            $this->info("Database restore completed successfully!");
            if ($result['pre_restore_backup']) {
                $this->line("Pre-restore backup: {$result['pre_restore_backup']}");
            }
            return 0;
        } catch (\Throwable $e) {
            $this->error("Restore failed: {$e->getMessage()}");
            return 1;
        }
    }

    protected function resolveOrganization(string $slugOrId): ?Organization
    {
        $org = is_numeric($slugOrId)
            ? Organization::find((int) $slugOrId)
            : Organization::where('slug', $slugOrId)->first();

        if (!$org) {
            $this->error("Organization not found: {$slugOrId}");
            return null;
        }

        return $org;
    }

    protected function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }
}
