<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('paused_at')->nullable()->after('acknowledged_by');
            $table->foreignId('paused_by')->nullable()->after('paused_at')->constrained('users')->nullOnDelete();
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
