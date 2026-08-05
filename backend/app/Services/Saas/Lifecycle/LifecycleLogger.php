<?php

namespace App\Services\Saas\Lifecycle;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * LifecycleLogger.
 *
 * Logs every lifecycle action for auditing and debugging.
 * Stores logs in both the application log and a master DB table.
 *
 * Actions logged:
 * - provision, activate, suspend, archive, restore, delete
 * - backup, backup_restore
 * - state_transition, isolation_check
 */
class LifecycleLogger
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Log a lifecycle action.
     *
     * @param string $action The action name (e.g., "suspend", "activate").
     * @param Organization $organization The organization affected.
     * @param string $result The result ("success", "failed").
     * @param array $context Additional context data.
     * @param string|null $userId The user who performed the action.
     */
    public function log(
        string $action,
        Organization $organization,
        string $result = 'success',
        array $context = [],
        ?string $userId = null,
    ): void {
        $logEntry = [
            'timestamp'        => now()->toIso8601String(),
            'organization_id'  => $organization->id,
            'organization_slug' => $organization->slug,
            'action'           => $action,
            'result'           => $result,
            'user_id'          => $userId ?? (auth()->id() ?? 'system'),
            'context'          => $context,
        ];

        // Application log
        $level = $result === 'success' ? 'info' : 'warning';
        Log::$level("Tenant lifecycle: {$action}", $logEntry);

        // Master DB audit trail
        $this->storeInDatabase($logEntry);
    }

    /**
     * Get lifecycle logs for an organization.
     */
    public function getForOrganization(Organization $organization, int $limit = 50): array
    {
        return DB::connection($this->masterConnection)
            ->table('tenant_lifecycle_logs')
            ->where('organization_id', $organization->id)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    /**
     * Get recent lifecycle logs across all organizations.
     */
    public function getRecent(int $limit = 100): array
    {
        return DB::connection($this->masterConnection)
            ->table('tenant_lifecycle_logs')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    /**
     * Ensure the lifecycle logs table exists.
     */
    public function ensureTable(): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();

        $pdo->exec("CREATE TABLE IF NOT EXISTS `tenant_lifecycle_logs` (
            `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `organization_id` BIGINT UNSIGNED NOT NULL,
            `organization_slug` VARCHAR(100) NOT NULL,
            `action` VARCHAR(50) NOT NULL,
            `result` VARCHAR(20) NOT NULL DEFAULT 'success',
            `user_id` VARCHAR(100) NULL,
            `context` JSON NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_org_id` (`organization_id`),
            INDEX `idx_action` (`action`),
            INDEX `idx_created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    /**
     * Store a log entry in the master database.
     */
    protected function storeInDatabase(array $entry): void
    {
        try {
            $this->ensureTable();

            DB::connection($this->masterConnection)
                ->table('tenant_lifecycle_logs')
                ->insert([
                    'organization_id'   => $entry['organization_id'],
                    'organization_slug' => $entry['organization_slug'],
                    'action'            => $entry['action'],
                    'result'            => $entry['result'],
                    'user_id'           => $entry['user_id'],
                    'context'           => json_encode($entry['context']),
                    'created_at'        => $entry['timestamp'],
                ]);
        } catch (\Throwable $e) {
            Log::error("Failed to store lifecycle log in database", [
                'error' => $e->getMessage(),
                'entry' => $entry,
            ]);
        }
    }
}
