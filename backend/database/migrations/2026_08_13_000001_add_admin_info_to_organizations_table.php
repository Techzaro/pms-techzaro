<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'admin_name')) {
                $table->string('admin_name')->nullable()->after('slug');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'admin_email')) {
                $table->string('admin_email')->nullable()->after('admin_name');
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $table->dropColumn(['admin_name', 'admin_email']);
        });
    }
};
