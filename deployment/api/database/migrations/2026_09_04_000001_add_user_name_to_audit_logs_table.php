<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('audit_logs') && !Schema::hasColumn('audit_logs', 'user_name')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->string('user_name', 255)->nullable()->after('user_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('audit_logs') && Schema::hasColumn('audit_logs', 'user_name')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->dropColumn('user_name');
            });
        }
    }
};
