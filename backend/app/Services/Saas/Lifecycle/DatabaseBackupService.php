<?php

namespace App\Services\Saas\Lifecycle;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DatabaseBackupService.
 *
 * Handles backup operations for tenant databases:
 * - Create full database backups
 * - Store backup metadata
 * - Track backup history
 * - List available backups
 */
class DatabaseBackupService
{
    protected string $masterConnection;
    protected string $backupPath;

    public function __construct(
        protected LifecycleLogger $logger,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
        $this->backupPath = storage_path('app/backups/tenants');
    }

    /**
     * Create a full backup of a tenant database.
     *
     * @return array{success: bool, backup_path: string, backup_name: string, size_bytes: int}
     * @throws \RuntimeException If backup fails.
     */
    public function backup(Organization $organization): array
    {
        $backupName = $this->generateBackupName($organization);
        $backupPath = $this->backupPath . "/{$organization->id}/{$backupName}";

        Log::info("Starting backup for organization: {$organization->slug}", [
            'database' => $organization->database_name,
        ]);

        // Ensure backup directory exists
        $dir = dirname($backupPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Generate SQL dump
        $sql = $this->generateSqlDump($organization->database_name);

        // Write to file
        file_put_contents($backupPath, $sql);

        $size = filesize($backupPath);

        // Store backup metadata
        $this->storeBackupMetadata($organization, $backupName, $backupPath, $size);

        $this->logger->log('backup', $organization, 'success', [
            'backup_name' => $backupName,
            'size_bytes'  => $size,
        ]);

        Log::info("Backup completed for organization: {$organization->slug}", [
            'backup_name' => $backupName,
            'size_bytes'  => $size,
        ]);

        return [
            'success'     => true,
            'backup_path' => $backupPath,
            'backup_name' => $backupName,
            'size_bytes'  => $size,
        ];
    }

    /**
     * List all backups for an organization.
     */
    public function listBackups(Organization $organization): array
    {
        return DB::connection($this->masterConnection)
            ->table('tenant_backups')
            ->where('organization_id', $organization->id)
            ->orderByDesc('created_at')
            ->get()
            ->toArray();
    }

    /**
     * Get backup details by name.
     */
    public function getBackup(string $backupName): ?object
    {
        return DB::connection($this->masterConnection)
            ->table('tenant_backups')
            ->where('backup_name', $backupName)
            ->first();
    }

    /**
     * Delete a backup.
     */
    public function deleteBackup(string $backupName): bool
    {
        $backup = $this->getBackup($backupName);
        if (!$backup) {
            return false;
        }

        // Delete file
        if (file_exists($backup->backup_path)) {
            unlink($backup->backup_path);
        }

        // Delete metadata
        DB::connection($this->masterConnection)
            ->table('tenant_backups')
            ->where('backup_name', $backupName)
            ->delete();

        return true;
    }

    /**
     * Generate SQL dump using mysqldump (if available) or PHP-based approach.
     */
    protected function generateSqlDump(string $databaseName): string
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        // Try mysqldump first (faster, more reliable)
        $mysqldumpPath = $this->findMysqldump();

        if ($mysqldumpPath) {
            return $this->runMysqldump(
                $mysqldumpPath,
                $databaseName,
                $masterConfig['host'],
                $masterConfig['port'],
                $masterConfig['username'],
                $masterConfig['password'] ?? ''
            );
        }

        // Fallback: PHP-based dump
        return $this->generatePhpDump($databaseName);
    }

    /**
     * Find the mysqldump binary path.
     */
    protected function findMysqldump(): ?string
    {
        $paths = [
            'mysqldump',
            'C:/xampp/mysql/bin/mysqldump.exe',
            '/usr/bin/mysqldump',
            '/usr/local/bin/mysqldump',
        ];

        foreach ($paths as $path) {
            $output = [];
            $exitCode = 0;
            exec("{$path} --version 2>&1", $output, $exitCode);
            if ($exitCode === 0) {
                return $path;
            }
        }

        return null;
    }

    /**
     * Run mysqldump to create a SQL dump.
     */
    protected function runMysqldump(
        string $mysqldumpPath,
        string $database,
        string $host,
        int $port,
        string $username,
        string $password,
    ): string {
        $escapedPassword = escapeshellarg($password);
        $escapedDb = escapeshellarg($database);
        $cmd = "{$mysqldumpPath} --host={$host} --port={$port} --user={$username} --password={$escapedPassword} --single-transaction --routines --triggers {$escapedDb} 2>&1";

        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0) {
            throw new \RuntimeException("mysqldump failed: " . implode("\n", $output));
        }

        return implode("\n", $output);
    }

    /**
     * Generate SQL dump using PHP (fallback when mysqldump is not available).
     */
    protected function generatePhpDump(string $databaseName): string
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant_backup', [
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

        $pdo = DB::connection('tenant_backup')->getPdo();

        $sql = "-- Tenant Database Backup\n";
        $sql .= "-- Database: {$databaseName}\n";
        $sql .= "-- Date: " . now()->toIso8601String() . "\n\n";
        $sql .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

        // Get all tables
        $tables = $pdo->prepare("SHOW TABLES");
        $tables->execute();
        $tableNames = $tables->fetchAll(\PDO::FETCH_COLUMN);

        foreach ($tableNames as $table) {
            // Get create table statement
            $createStmt = $pdo->prepare("SHOW CREATE TABLE `{$table}`");
            $createStmt->execute();
            $createRow = $createStmt->fetch(\PDO::FETCH_ASSOC);

            $sql .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $sql .= $createRow['Create Table'] . ";\n\n";

            // Get data
            $dataStmt = $pdo->prepare("SELECT * FROM `{$table}`");
            $dataStmt->execute();
            $rows = $dataStmt->fetchAll(\PDO::FETCH_NUM);

            if (!empty($rows)) {
                // Get column count for bulk inserts
                $colCount = $dataStmt->columnCount();
                $sql .= "INSERT INTO `{$table}` VALUES\n";

                $valueRows = [];
                foreach ($rows as $row) {
                    $values = array_map(function ($val) use ($pdo) {
                        if ($val === null) return 'NULL';
                        return $pdo->quote($val);
                    }, $row);
                    $valueRows[] = '  (' . implode(', ', $values) . ')';
                }
                $sql .= implode(",\n", $valueRows) . ";\n\n";
            }
        }

        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

        config()->offsetUnset('database.connections.tenant_backup');

        return $sql;
    }

    /**
     * Generate a unique backup name.
     */
    protected function generateBackupName(Organization $organization): string
    {
        return $organization->slug . '_' . now()->format('Y-m-d_His') . '.sql';
    }

    /**
     * Store backup metadata in master database.
     */
    protected function storeBackupMetadata(
        Organization $organization,
        string $backupName,
        string $backupPath,
        int $size,
    ): void {
        $this->ensureBackupTable();

        DB::connection($this->masterConnection)
            ->table('tenant_backups')
            ->insert([
                'organization_id'   => $organization->id,
                'organization_slug' => $organization->slug,
                'backup_name'       => $backupName,
                'backup_path'       => $backupPath,
                'size_bytes'        => $size,
                'database_name'     => $organization->database_name,
                'created_at'        => now(),
            ]);
    }

    /**
     * Ensure the backup metadata table exists.
     */
    protected function ensureBackupTable(): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();

        $pdo->exec("CREATE TABLE IF NOT EXISTS `tenant_backups` (
            `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `organization_id` BIGINT UNSIGNED NOT NULL,
            `organization_slug` VARCHAR(100) NOT NULL,
            `backup_name` VARCHAR(255) NOT NULL,
            `backup_path` VARCHAR(500) NOT NULL,
            `size_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `database_name` VARCHAR(100) NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE INDEX `idx_backup_name` (`backup_name`),
            INDEX `idx_org_id` (`organization_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
}
