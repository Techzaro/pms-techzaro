<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'assigner_paused')) {
                $table->boolean('assigner_paused')->default(false);
            }
            if (!Schema::hasColumn('tasks', 'assigner_paused_at')) {
                $table->timestamp('assigner_paused_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'assigner_paused_by')) {
                $table->foreignId('assigner_paused_by')->nullable()->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['assigner_paused_by']);
            $table->dropColumn(['assigner_paused', 'assigner_paused_at', 'assigner_paused_by']);
        });
    }
};
