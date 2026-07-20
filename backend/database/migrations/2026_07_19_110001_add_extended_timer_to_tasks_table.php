<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedInteger('elapsed_seconds')->default(0)->after('total_work_seconds');
            $table->unsignedInteger('pause_count')->default(0)->after('elapsed_seconds');
            $table->unsignedInteger('total_pause_seconds')->default(0)->after('pause_count');
            $table->unsignedInteger('resume_count')->default(0)->after('total_pause_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn([
                'elapsed_seconds',
                'pause_count',
                'total_pause_seconds',
                'resume_count',
            ]);
        });
    }
};
