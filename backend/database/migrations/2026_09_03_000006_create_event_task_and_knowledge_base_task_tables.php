<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('event_task')) {
            Schema::create('event_task', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['event_id', 'task_id']);
            });
        }

        if (!Schema::hasTable('knowledge_base_task')) {
            Schema::create('knowledge_base_task', function (Blueprint $table) {
                $table->id();
                $table->foreignId('knowledge_base_id')->constrained('knowledge_bases')->cascadeOnDelete();
                $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['knowledge_base_id', 'task_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_base_task');
        Schema::dropIfExists('event_task');
    }
};
