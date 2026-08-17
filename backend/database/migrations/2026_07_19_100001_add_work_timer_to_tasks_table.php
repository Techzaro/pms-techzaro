<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'work_started_at')) {
                $table->timestamp('work_started_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'total_work_seconds')) {
                $table->unsignedInteger('total_work_seconds')->default(0);
            }
            if (!Schema::hasColumn('tasks', 'timer_state')) {
                $table->string('timer_state', 16)->default('idle');
            }
            if (!Schema::hasColumn('tasks', 'last_timer_event_at')) {
                $table->timestamp('last_timer_event_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'work_completed_at')) {
                $table->timestamp('work_completed_at')->nullable();
            }
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
