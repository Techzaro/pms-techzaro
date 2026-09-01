<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('events')) {
            Schema::table('events', function (Blueprint $table) {
                if (!Schema::hasColumn('events', 'event_timezone')) {
                    $table->string('event_timezone', 64)->nullable()->after('all_day');
                }
                if (!Schema::hasColumn('events', 'event_date')) {
                    $table->date('event_date')->nullable()->after('event_timezone');
                }
                if (!Schema::hasColumn('events', 'event_start_time')) {
                    $table->time('event_start_time')->nullable()->after('event_date');
                }
                if (!Schema::hasColumn('events', 'event_end_time')) {
                    $table->time('event_end_time')->nullable()->after('event_start_time');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('events')) {
            Schema::table('events', function (Blueprint $table) {
                if (Schema::hasColumn('events', 'event_end_time')) {
                    $table->dropColumn('event_end_time');
                }
                if (Schema::hasColumn('events', 'event_start_time')) {
                    $table->dropColumn('event_start_time');
                }
                if (Schema::hasColumn('events', 'event_date')) {
                    $table->dropColumn('event_date');
                }
                if (Schema::hasColumn('events', 'event_timezone')) {
                    $table->dropColumn('event_timezone');
                }
            });
        }
    }
};
