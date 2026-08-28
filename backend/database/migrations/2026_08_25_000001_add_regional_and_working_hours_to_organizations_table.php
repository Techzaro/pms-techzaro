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
        $connection = config('tenancy.master_connection', 'mysql_master');

        if (Schema::connection($connection)->hasTable('organizations')) {
            Schema::connection($connection)->table('organizations', function (Blueprint $table) use ($connection) {
                if (!Schema::connection($connection)->hasColumn('organizations', 'default_timezone')) {
                    $table->string('default_timezone', 64)->default('UTC')->after('status');
                }
                if (!Schema::connection($connection)->hasColumn('organizations', 'enforce_working_hours')) {
                    $table->boolean('enforce_working_hours')->default(false)->after('default_timezone');
                }
                if (!Schema::connection($connection)->hasColumn('organizations', 'working_hours')) {
                    $table->json('working_hours')->nullable()->after('enforce_working_hours');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $connection = config('tenancy.master_connection', 'mysql_master');

        if (Schema::connection($connection)->hasTable('organizations')) {
            Schema::connection($connection)->table('organizations', function (Blueprint $table) use ($connection) {
                if (Schema::connection($connection)->hasColumn('organizations', 'working_hours')) {
                    $table->dropColumn('working_hours');
                }
                if (Schema::connection($connection)->hasColumn('organizations', 'enforce_working_hours')) {
                    $table->dropColumn('enforce_working_hours');
                }
                if (Schema::connection($connection)->hasColumn('organizations', 'default_timezone')) {
                    $table->dropColumn('default_timezone');
                }
            });
        }
    }
};
