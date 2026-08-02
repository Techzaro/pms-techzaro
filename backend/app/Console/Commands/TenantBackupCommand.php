<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\Lifecycle\DatabaseBackupService;
use Illuminate\Console\Command;

class TenantBackupCommand extends Command
{
    protected $signature = 'tenant:backup {slugOrId : Organization slug or ID}';

    protected $description = 'Create a backup of a tenant database';

    public function handle(DatabaseBackupService $backup): int
    {
        $slugOrId = $this->argument('slugOrId');

        $org = $this->resolveOrganization($slugOrId);
        if (!$org) return 1;

        $this->info("Creating backup for: {$org->name} ({$org->slug})...");
        $this->line("Database: {$org->database_name}");

        try {
            $result = $backup->backup($org);
            $this->newLine();
            $this->info("Backup completed successfully!");
            $this->table(['Field', 'Value'], [
                ['Backup Name', $result['backup_name']],
                ['Size', $this->formatBytes($result['size_bytes'])],
                ['Path', $result['backup_path']],
            ]);
            return 0;
        } catch (\Throwable $e) {
            $this->error("Backup failed: {$e->getMessage()}");
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
