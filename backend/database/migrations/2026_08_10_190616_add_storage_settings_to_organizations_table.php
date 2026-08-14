<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_auto_delete')) {
                $table->boolean('storage_auto_delete')->default(false)->after('settings');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_overwrite')) {
                $table->boolean('storage_overwrite')->default(true);
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_warn_threshold')) {
                $table->integer('storage_warn_threshold')->default(80);
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_critical_threshold')) {
                $table->integer('storage_critical_threshold')->default(90);
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_pin_threshold')) {
                $table->integer('storage_pin_threshold')->default(95);
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_driver')) {
                $table->string('storage_driver')->default('local');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_s3_prefix')) {
                $table->string('storage_s3_prefix')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->dropColumn([
                'storage_auto_delete',
                'storage_overwrite',
                'storage_warn_threshold',
                'storage_critical_threshold',
                'storage_pin_threshold',
                'storage_driver',
                'storage_s3_prefix',
            ]);
        });
    }
};
