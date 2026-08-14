<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'task_type')) {
                $table->string('task_type')->default('standard')->after('priority');
            }
            if (!Schema::hasColumn('tasks', 'daily_quantity')) {
                $table->integer('daily_quantity')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'total_days')) {
                $table->integer('total_days')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'deliverables_generated')) {
                $table->integer('deliverables_generated')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['task_type', 'daily_quantity', 'total_days', 'deliverables_generated']);
        });
    }
};
