<?php

namespace App\Jobs;

use App\Models\Master\Organization;
use App\Services\StorageFileService;
use App\Services\StorageNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class StorageCleanupJob implements ShouldQueue
{
    use Queueable;

    public int $orgId;
    public string $action;
    public ?int $months;
    public ?float $minSizeGb;

    /**
     * Create a new job instance.
     */
    public function __construct(
        int $orgId,
        string $action = 'check',
        ?int $months = null,
        ?float $minSizeGb = null
    ) {
        $this->orgId = $orgId;
        $this->action = $action;
        $this->months = $months;
        $this->minSizeGb = $minSizeGb;
        $this->queue = 'storage';
        $this->tries = 3;
        $this->timeout = 120;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $org = Organization::on('mysql_master')->find($this->orgId);
        if (!$org) {
            Log::warning("StorageCleanupJob: Org {$this->orgId} not found");
            return;
        }

        switch ($this->action) {
            case 'check':
                $this->checkAndNotify($org);
                break;

            case 'auto_delete':
                $this->autoDeleteOldest($org);
                break;

            case 'delete_old':
                if ($this->months) {
                    $result = StorageFileService::deleteOldFiles($org, $this->months);
                    Log::info("StorageCleanupJob: Deleted {$result['deleted_count']} old files for org {$this->orgId}");
                }
                break;

            case 'delete_large':
                if ($this->minSizeGb) {
                    $result = StorageFileService::deleteLargeFiles($org, $this->minSizeGb);
                    Log::info("StorageCleanupJob: Deleted {$result['deleted_count']} large files for org {$this->orgId}");
                }
                break;

            default:
                Log::warning("StorageCleanupJob: Unknown action '{$this->action}'");
        }
    }

    /**
     * Check storage thresholds and send notifications.
     */
    private function checkAndNotify(Organization $org): void
    {
        $notifications = StorageNotificationService::checkAndNotify($org);
        if (!empty($notifications)) {
            Log::info("StorageCleanupJob: Created " . count($notifications) . " notifications for org {$this->orgId}");
        }
    }

    /**
     * Auto-delete oldest files when storage is critically full.
     */
    private function autoDeleteOldest(Organization $org): void
    {
        $usage = StorageFileService::getCurrentUsage($org);

        // Only auto-delete if usage is above critical threshold
        $settings = $org->getStorageSettings();
        if ($usage['usage_percent'] < $settings['critical_threshold']) {
            return;
        }

        // Free 10% of total storage
        $freeBytes = (int) ($usage['max_bytes'] * 0.10);
        $freed = StorageFileService::autoDeleteOldest($org, $freeBytes);

        if ($freed > 0) {
            Log::info("StorageCleanupJob: Auto-deleted files for org {$this->orgId}, freed " . round($freed / (1024 * 1024), 2) . " MB");

            // Re-check and notify after cleanup
            StorageNotificationService::checkAndNotify($org);
        }
    }

    /**
     * The job failed to process.
     */
    public function failed(\Throwable $exception): void
    {
        Log::error("StorageCleanupJob failed for org {$this->orgId}: " . $exception->getMessage());
    }
}
