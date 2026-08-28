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
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (!Schema::hasColumn('users', 'timezone')) {
                    $table->string('timezone', 64)->nullable()->after('status');
                }
                if (!Schema::hasColumn('users', 'language')) {
                    $table->string('language', 32)->default('English')->after('timezone');
                }
                if (!Schema::hasColumn('users', 'date_format')) {
                    $table->string('date_format', 32)->default('DD/MM/YYYY')->after('language');
                }
                if (!Schema::hasColumn('users', 'time_format')) {
                    $table->string('time_format', 32)->default('12-hour')->after('date_format');
                }
                if (!Schema::hasColumn('users', 'working_hours')) {
                    $table->json('working_hours')->nullable()->after('time_format');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (Schema::hasColumn('users', 'working_hours')) {
                    $table->dropColumn('working_hours');
                }
                if (Schema::hasColumn('users', 'time_format')) {
                    $table->dropColumn('time_format');
                }
                if (Schema::hasColumn('users', 'date_format')) {
                    $table->dropColumn('date_format');
                }
                if (Schema::hasColumn('users', 'language')) {
                    $table->dropColumn('language');
                }
                if (Schema::hasColumn('users', 'timezone')) {
                    $table->dropColumn('timezone');
                }
            });
        }
    }
};
