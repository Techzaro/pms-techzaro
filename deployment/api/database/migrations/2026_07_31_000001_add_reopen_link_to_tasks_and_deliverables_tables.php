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
            if (! Schema::hasColumn('tasks', 'reopen_link')) {
                $table->text('reopen_link')->nullable()->after('reopen_file_name');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (! Schema::hasColumn('deliverables', 'reopen_link')) {
                $table->text('reopen_link')->nullable()->after('reopen_file_name');
            }
            if (! Schema::hasColumn('deliverables', 'rework_link')) {
                $table->text('rework_link')->nullable()->after('rework_file_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'reopen_link')) {
                $table->dropColumn('reopen_link');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (Schema::hasColumn('deliverables', 'reopen_link')) {
                $table->dropColumn('reopen_link');
            }
            if (Schema::hasColumn('deliverables', 'rework_link')) {
                $table->dropColumn('rework_link');
            }
        });
    }
};
