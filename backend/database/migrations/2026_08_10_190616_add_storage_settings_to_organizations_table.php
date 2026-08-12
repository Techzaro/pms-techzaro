<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->boolean('storage_auto_delete')->default(false)->after('settings');
            $table->boolean('storage_overwrite')->default(true)->after('storage_auto_delete');
            $table->integer('storage_warn_threshold')->default(80)->after('storage_overwrite');
            $table->integer('storage_critical_threshold')->default(90)->after('storage_warn_threshold');
            $table->integer('storage_pin_threshold')->default(95)->after('storage_critical_threshold');
            $table->string('storage_driver')->default('local')->after('storage_pin_threshold');
            $table->string('storage_s3_prefix')->nullable()->after('storage_driver');
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
