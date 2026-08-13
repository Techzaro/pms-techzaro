<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Update existing event types to new values
        DB::table('events')->where('type', 'meeting')->update(['type' => 'Meeting']);
        DB::table('events')->where('type', 'deadline')->update(['type' => 'Meeting']);
        DB::table('events')->where('type', 'task')->update(['type' => 'Meeting']);
        DB::table('events')->where('type', 'personal')->update(['type' => 'Other']);
        DB::table('events')->where('type', 'other')->update(['type' => 'Other']);

        // Update default value for new events
        DB::statement("ALTER TABLE events MODIFY COLUMN type VARCHAR(32) DEFAULT 'Meeting' NOT NULL");
    }

    public function down(): void
    {
        DB::table('events')->whereIn('type', [
            'Training', 'Workshop', 'Client Meeting', 'Company Event',
            'Holiday', 'Interview', 'Project Milestone', 'Internship Activity'
        ])->update(['type' => 'Meeting']);

        DB::table('events')->where('type', 'Other')->update(['type' => 'other']);

        DB::statement("ALTER TABLE events MODIFY COLUMN type VARCHAR(32) DEFAULT 'meeting' NOT NULL");
    }
};
