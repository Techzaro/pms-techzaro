<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (DB::getSchemaBuilder()->hasColumn('tasks', 'task_code')) {
                try { $table->dropUnique(['task_code']); } catch (\Exception $e) {}
                $table->dropColumn('task_code');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (DB::getSchemaBuilder()->hasColumn('deliverables', 'subtask_code')) {
                try { $table->dropUnique(['subtask_code']); } catch (\Exception $e) {}
                $table->dropColumn('subtask_code');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('task_code', 30)->nullable()->after('id');
            $table->unique('task_code');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->string('subtask_code', 40)->nullable()->after('id');
            $table->unique('subtask_code');
        });
    }
};
