<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('task_workflow_events')) {
            Schema::create('task_workflow_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('action', 32);
                $table->text('comment')->nullable();
                $table->text('instructions')->nullable();
                $table->date('new_deadline')->nullable();
                $table->string('file_path')->nullable();
                $table->string('file_name')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_workflow_events');
    }
};
