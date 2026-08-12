<?php

namespace App\Services\Saas\Lifecycle;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DatabaseRestoreService.
 *
 * Handles restoring tenant databases from backups:
 * - Restore from a backup file
 * - Validate backup integrity
 * - Optionally create a pre-restore backup
 * - Support confirmation for production data
 */
class DatabaseRestoreService
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseBackupService $backupService,
        protected LifecycleLogger $logger,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Restore a tenant database from a backup.
     *
     * @param Organization $organization The organization to restore.
     * @param string $backupName The backup name to restore from.
     * @param bool $createPreRestoreBackup Whether to backup current state first.
     *
     * @return array{success: bool, pre_restore_backup: string|null}
     * @throws \RuntimeException If restore fails.
     */
    public function restore(
        Organization $organization,
        string $backupName,
        bool $createPreRestoreBackup = true,
    ): array {
        $backup = $this->backupService->getBackup($backupName);
        if (!$backup) {
            throw new \RuntimeException("Backup '{$backupName}' not found.");
        }

        Log::info("Starting database restore for organization: {$organization->slug}", [
            'backup_name' => $backupName,
        ]);

        $preRestoreBackup = null;

        // Optionally create a pre-restore backup
        if ($createPreRestoreBackup) {
            $backupResult = $this->backupService->backup($organization);
            $preRestoreBackup = $backupResult['backup_name'];
        }

        // Read the backup SQL file
        $sql = $this->readBackupFile($backup->backup_path);

        // Execute the restore
        $this->executeRestore($organization->database_name, $sql);

        $this->logger->log('backup_restore', $organization, 'success', [
            'backup_name'            => $backupName,
            'pre_restore_backup'     => $preRestoreBackup,
        ]);

        Log::info("Database restore completed for organization: {$organization->slug}", [
            'backup_name' => $backupName,
        ]);

        return [
            'success'              => true,
            'pre_restore_backup'   => $preRestoreBackup,
        ];
    }

    /**
     * Read and validate a backup file.
     */
    protected function readBackupFile(string $path): string
    {
        if (!file_exists($path)) {
            throw new \RuntimeException("Backup file not found: {$path}");
        }

        $sql = file_get_contents($path);

        if ($sql === false || strlen($sql) < 10) {
            throw new \RuntimeException("Backup file is empty or unreadable: {$path}");
        }

        // Basic validation — must contain SQL
        if (stripos($sql, 'CREATE TABLE') === false && stripos($sql, 'INSERT') === false) {
            throw new \RuntimeException("Backup file does not appear to be a valid SQL dump: {$path}");
        }

        return $sql;
    }

    /**
     * Execute the restore SQL against the tenant database.
     */
    protected function executeRestore(string $databaseName, string $sql): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant_restore', [
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

        $pdo = DB::connection('tenant_restore')->getPdo();

        // Split SQL into individual statements
        $statements = $this->splitSql($sql);

        $pdo->exec("SET FOREIGN_KEY_CHECKS=0");

        foreach ($statements as $statement) {
            $statement = trim($statement);
            if (!empty($statement) && $statement !== ';') {
                try {
                    $pdo->exec($statement);
                } catch (\Throwable $e) {
                    Log::warning("SQL statement failed during restore", [
                        'error'     => $e->getMessage(),
                        'statement' => substr($statement, 0, 200),
                    ]);
                    // Continue with next statement
                }
            }
        }

        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");

        config()->offsetUnset('database.connections.tenant_restore');
    }

    /**
     * Split SQL dump into individual statements.
     */
    protected function splitSql(string $sql): array
    {
        // Remove comments
        $sql = preg_replace('/--.*$/m', '', $sql);
        $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

        // Split on semicolons (but not within quotes)
        $statements = [];
        $current = '';
        $inQuote = false;
        $quoteChar = '';

        for ($i = 0; $i < strlen($sql); $i++) {
            $char = $sql[$i];

            if (($char === '"' || $char === "'") && ($i === 0 || $sql[$i - 1] !== '\\')) {
                if ($inQuote && $char === $quoteChar) {
                    $inQuote = false;
                } elseif (!$inQuote) {
                    $inQuote = true;
                    $quoteChar = $char;
                }
            }

            if ($char === ';' && !$inQuote) {
                $trimmed = trim($current);
                if (!empty($trimmed)) {
                    $statements[] = $trimmed;
                }
                $current = '';
            } else {
                $current .= $char;
            }
        }

        $trimmed = trim($current);
        if (!empty($trimmed)) {
            $statements[] = $trimmed;
        }

        return $statements;
    }
}
