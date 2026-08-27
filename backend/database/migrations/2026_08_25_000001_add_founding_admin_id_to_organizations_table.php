<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'founding_admin_id')) {
                $table->unsignedBigInteger('founding_admin_id')->nullable()->after('admin_email');
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organizations', 'founding_admin_id')) {
                $table->dropColumn('founding_admin_id');
            }
        });
    }
};
