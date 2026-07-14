<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('task_type')->default('standard')->after('priority');
            $table->integer('daily_quantity')->nullable()->after('task_type');
            $table->integer('total_days')->nullable()->after('daily_quantity');
            $table->integer('deliverables_generated')->default(0)->after('total_days');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['task_type', 'daily_quantity', 'total_days', 'deliverables_generated']);
        });
    }
};
