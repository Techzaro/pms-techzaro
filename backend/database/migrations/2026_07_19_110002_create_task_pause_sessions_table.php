<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('task_pause_sessions')) {
            Schema::create('task_pause_sessions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('reason', 64);
                $table->text('reason_detail')->nullable();
                $table->timestamp('paused_at');
                $table->timestamp('resumed_at')->nullable();
                $table->unsignedInteger('duration_seconds')->default(0);
                $table->foreignId('resumed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->boolean('is_auto_paused')->default(false);
                $table->timestamps();

                $table->index(['task_id', 'paused_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_pause_sessions');
    }
};
