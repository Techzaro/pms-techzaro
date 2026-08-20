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
            if (!Schema::hasColumn('tasks', 'recurrence_start_date')) {
                $table->timestamp('recurrence_start_date')->nullable()->after('recurrence_settings');
            }
            if (!Schema::hasColumn('tasks', 'recurrence_end_date')) {
                $table->timestamp('recurrence_end_date')->nullable()->after('recurrence_start_date');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['recurrence_start_date', 'recurrence_end_date']);
        });
    }
};
