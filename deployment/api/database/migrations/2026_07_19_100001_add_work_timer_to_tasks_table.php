<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('work_started_at')->nullable()->after('assigner_paused_by');
            $table->unsignedInteger('total_work_seconds')->default(0)->after('work_started_at');
            $table->string('timer_state', 16)->default('idle')->after('total_work_seconds');
            $table->timestamp('last_timer_event_at')->nullable()->after('timer_state');
            $table->timestamp('work_completed_at')->nullable()->after('last_timer_event_at');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn([
                'work_started_at',
                'total_work_seconds',
                'timer_state',
                'last_timer_event_at',
                'work_completed_at',
            ]);
        });
    }
};
