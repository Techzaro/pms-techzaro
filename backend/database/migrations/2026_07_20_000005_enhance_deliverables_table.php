<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->unsignedInteger('estimated_hours')->nullable()->after('priority');
            $table->unsignedInteger('estimated_minutes')->nullable()->after('estimated_hours');
            $table->json('labels')->nullable()->after('estimated_minutes');
            $table->json('tags')->nullable()->after('labels');
            $table->json('followers')->nullable()->after('tags');
            $table->json('dependencies')->nullable()->after('followers');
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete()->after('sort_order');
            $table->timestamp('acknowledged_at')->nullable()->after('acknowledged_by');
            $table->foreignId('paused_by')->nullable()->constrained('users')->nullOnDelete()->after('acknowledged_at');
            $table->timestamp('paused_at')->nullable()->after('paused_by');
            $table->boolean('assigner_paused')->default(false)->after('paused_at');
            $table->timestamp('assigner_paused_at')->nullable()->after('assigner_paused');
            $table->foreignId('assigner_paused_by')->nullable()->constrained('users')->nullOnDelete()->after('assigner_paused_at');
            $table->timestamp('work_started_at')->nullable()->after('assigner_paused_by');
            $table->unsignedInteger('total_work_seconds')->default(0)->after('work_started_at');
            $table->unsignedInteger('elapsed_seconds')->default(0)->after('total_work_seconds');
            $table->unsignedInteger('pause_count')->default(0)->after('elapsed_seconds');
            $table->unsignedInteger('total_pause_seconds')->default(0)->after('pause_count');
            $table->unsignedInteger('resume_count')->default(0)->after('total_pause_seconds');
            $table->string('timer_state', 16)->default('idle')->after('resume_count');
            $table->timestamp('last_timer_event_at')->nullable()->after('timer_state');
            $table->timestamp('work_completed_at')->nullable()->after('last_timer_event_at');
        });

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
