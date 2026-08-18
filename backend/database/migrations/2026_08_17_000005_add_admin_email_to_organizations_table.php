<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection('mysql_master');

        if ($schema->hasTable('organizations') && !$schema->hasColumn('organizations', 'admin_email')) {
            $schema->table('organizations', function (Blueprint $table) {
                $table->string('admin_email')->nullable()->after('email_policy')->index();
            });
        }
    }

    public function down(): void
    {
        $schema = Schema::connection('mysql_master');

        if ($schema->hasTable('organizations') && $schema->hasColumn('organizations', 'admin_email')) {
            $schema->table('organizations', function (Blueprint $table) {
                $table->dropColumn('admin_email');
            });
        }
    }
};
