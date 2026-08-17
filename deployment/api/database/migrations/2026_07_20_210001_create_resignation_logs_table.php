<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resignation_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('resigned_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('resigned_at');
            $table->text('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->integer('total_projects_returned')->default(0);
            $table->integer('total_tasks_returned')->default(0);
            $table->integer('total_deliverables_returned')->default(0);
            $table->integer('total_events_returned')->default(0);
            $table->integer('total_drafts_created')->default(0);
            $table->integer('total_notifications_sent')->default(0);
            $table->json('draft_owners')->nullable();
            $table->json('affected_items')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resignation_logs');
    }
};
