<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'estimated_hours')) {
                $table->unsignedInteger('estimated_hours')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'estimated_minutes')) {
                $table->unsignedInteger('estimated_minutes')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'labels')) {
                $table->json('labels')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'tags')) {
                $table->json('tags')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'followers')) {
                $table->json('followers')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'dependencies')) {
                $table->json('dependencies')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'acknowledged_by')) {
                $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('deliverables', 'acknowledged_at')) {
                $table->timestamp('acknowledged_at')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'paused_by')) {
                $table->foreignId('paused_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('deliverables', 'paused_at')) {
                $table->timestamp('paused_at')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'assigner_paused')) {
                $table->boolean('assigner_paused')->default(false);
            }
            if (!Schema::hasColumn('deliverables', 'assigner_paused_at')) {
                $table->timestamp('assigner_paused_at')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'assigner_paused_by')) {
                $table->foreignId('assigner_paused_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('deliverables', 'work_started_at')) {
                $table->timestamp('work_started_at')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'total_work_seconds')) {
                $table->unsignedInteger('total_work_seconds')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'elapsed_seconds')) {
                $table->unsignedInteger('elapsed_seconds')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'pause_count')) {
                $table->unsignedInteger('pause_count')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'total_pause_seconds')) {
                $table->unsignedInteger('total_pause_seconds')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'resume_count')) {
                $table->unsignedInteger('resume_count')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'timer_state')) {
                $table->string('timer_state', 16)->default('idle');
            }
            if (!Schema::hasColumn('deliverables', 'last_timer_event_at')) {
                $table->timestamp('last_timer_event_at')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'work_completed_at')) {
                $table->timestamp('work_completed_at')->nullable();
            }
        });

        if (!Schema::hasTable('deliverable_user')) {
            Schema::create('deliverable_user', function (Blueprint $table) {
                $table->id();
                $table->foreignId('deliverable_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('due_date')->nullable();
                $table->string('status', 32)->default('pending');
                $table->timestamp('submitted_at')->nullable();
                $table->timestamps();
                $table->unique(['deliverable_id', 'user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('deliverable_user');

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn([
                'estimated_hours', 'estimated_minutes', 'labels', 'tags', 'followers', 'dependencies',
                'acknowledged_by', 'acknowledged_at', 'paused_by', 'paused_at',
                'assigner_paused', 'assigner_paused_at', 'assigner_paused_by',
                'work_started_at', 'total_work_seconds', 'elapsed_seconds',
                'pause_count', 'total_pause_seconds', 'resume_count',
                'timer_state', 'last_timer_event_at', 'work_completed_at',
            ]);
        });
    }
};
