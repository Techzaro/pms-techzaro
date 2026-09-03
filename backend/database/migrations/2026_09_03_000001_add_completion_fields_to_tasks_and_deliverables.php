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
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'completion_reason')) {
                $table->string('completion_reason')->nullable()->after('description');
            }
            if (!Schema::hasColumn('tasks', 'completion_notes')) {
                $table->text('completion_notes')->nullable()->after('completion_reason');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'completion_reason')) {
                $table->string('completion_reason')->nullable()->after('description');
            }
            if (!Schema::hasColumn('deliverables', 'completion_notes')) {
                $table->text('completion_notes')->nullable()->after('completion_reason');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('tasks', 'completion_reason')) {
                $cols[] = 'completion_reason';
            }
            if (Schema::hasColumn('tasks', 'completion_notes')) {
                $cols[] = 'completion_notes';
            }
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('deliverables', 'completion_reason')) {
                $cols[] = 'completion_reason';
            }
            if (Schema::hasColumn('deliverables', 'completion_notes')) {
                $cols[] = 'completion_notes';
            }
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
