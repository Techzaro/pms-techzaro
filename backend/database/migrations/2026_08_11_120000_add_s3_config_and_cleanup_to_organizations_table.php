<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->string('storage_s3_bucket')->nullable()->after('storage_s3_prefix');
            $table->string('storage_s3_region')->default('us-east-1')->after('storage_s3_bucket');
            $table->string('storage_s3_access_key')->nullable()->after('storage_s3_region');
            $table->string('storage_s3_secret_key')->nullable()->after('storage_s3_access_key');
            $table->integer('storage_cleanup_months')->default(6)->after('storage_s3_secret_key');
            $table->integer('storage_large_file_threshold_mb')->default(500)->after('storage_cleanup_months');
            $table->boolean('storage_auto_cleanup')->default(true)->after('storage_large_file_threshold_mb');
            $table->integer('custom_max_storage_gb')->nullable()->after('storage_auto_cleanup');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->dropColumn([
                'storage_s3_bucket',
                'storage_s3_region',
                'storage_s3_access_key',
                'storage_s3_secret_key',
                'storage_cleanup_months',
                'storage_large_file_threshold_mb',
                'storage_auto_cleanup',
                'custom_max_storage_gb',
            ]);
        });
    }
};
