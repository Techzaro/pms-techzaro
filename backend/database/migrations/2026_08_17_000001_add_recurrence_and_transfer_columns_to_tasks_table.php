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
            if (!Schema::hasColumn('tasks', 'recurrence_settings')) {
                $table->json('recurrence_settings')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'recurrence_start_date')) {
                $table->timestamp('recurrence_start_date')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'recurrence_end_date')) {
                $table->timestamp('recurrence_end_date')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'recurrence_status')) {
                $table->string('recurrence_status')->nullable()->default('active');
            }
            if (!Schema::hasColumn('tasks', 'allow_transfer')) {
                $table->boolean('allow_transfer')->default(true);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $columnsToDrop = [];
            foreach (['recurrence_settings', 'recurrence_start_date', 'recurrence_end_date', 'recurrence_status', 'allow_transfer'] as $col) {
                if (Schema::hasColumn('tasks', $col)) {
                    $columnsToDrop[] = $col;
                }
            }
            if (!empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};
