<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'paused_at')) {
                $table->timestamp('paused_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'paused_by')) {
                $table->foreignId('paused_by')->nullable()->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['paused_by']);
            $table->dropColumn(['paused_at', 'paused_by']);
        });
    }
};
