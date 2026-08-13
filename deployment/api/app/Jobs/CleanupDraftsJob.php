<?php

namespace App\Jobs;

use App\Services\DraftService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class CleanupDraftsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public function __construct()
    {
        $this->onQueue('drafts');
    }

    public function handle(DraftService $draftService): void
    {
        $cleanupDays = config('drafts.cleanup_days', 30);
        $archiveDays = config('drafts.archive_days', 90);

        $archived = $draftService->archive($archiveDays);
        $deleted = $draftService->cleanup($cleanupDays);

        \Illuminate\Support\Facades\Log::info("Draft cleanup completed: {$archived} archived, {$deleted} deleted");
    }
}
