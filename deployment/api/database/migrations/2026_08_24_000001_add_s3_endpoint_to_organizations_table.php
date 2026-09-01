<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_s3_endpoint')) {
                $table->string('storage_s3_endpoint')->nullable()->after('storage_s3_secret_key');
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->dropColumn('storage_s3_endpoint');
        });
    }
};
