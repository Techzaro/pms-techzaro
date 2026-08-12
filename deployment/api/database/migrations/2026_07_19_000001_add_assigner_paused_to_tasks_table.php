<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->boolean('assigner_paused')->default(false)->after('paused_by');
            $table->timestamp('assigner_paused_at')->nullable()->after('assigner_paused');
            $table->foreignId('assigner_paused_by')->nullable()->after('assigner_paused_at')->constrained('users')->nullOnDelete();
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
