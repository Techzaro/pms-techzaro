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
        try {
            Schema::table('task_user_notes', function (Blueprint $table) {
                $table->dropForeign(['task_id']);
                $table->dropForeign(['user_id']);
                $table->dropUnique('task_user_notes_task_id_user_id_unique');
                $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        } catch (\Throwable $e) {
            // Index already dropped or foreign keys already updated
        }
    }

    public function down(): void
    {
        Schema::table('task_user_notes', function (Blueprint $table) {
            $table->dropForeign(['task_id']);
            $table->dropForeign(['user_id']);
            $table->unique(['task_id', 'user_id']);
            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
