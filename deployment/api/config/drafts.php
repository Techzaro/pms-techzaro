<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Draft Retention Configuration
    |--------------------------------------------------------------------------
    |
    | Configure automatic cleanup and archiving of drafts.
    |
    */

    // Delete published/old drafts after this many days
    'cleanup_days' => env('DRAFT_CLEANUP_DAYS', 30),

    // Archive drafts after this many days of inactivity
    'archive_days' => env('DRAFT_ARCHIVE_DAYS', 90),

    // Auto-save debounce delay in seconds (frontend should match this)
    'auto_save_delay_seconds' => env('DRAFT_AUTO_SAVE_DELAY', 20),

    // Keep important drafts indefinitely (skip cleanup/archive)
    'keep_important_indefinitely' => true,
];
