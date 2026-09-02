<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'organization_code')) {
                $table->string('organization_code', 20)->unique()->nullable()->after('name')->comment('Org-specific code e.g. GOO-XXXXX, MUG-XXXXX');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'country')) {
                $table->string('country', 100)->nullable()->after('timezone');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'website')) {
                $table->string('website', 255)->nullable()->after('country');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'description')) {
                $table->text('description')->nullable()->after('website');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'industry')) {
                $table->string('industry', 100)->nullable()->after('description');
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            $columns = ['industry', 'description', 'website', 'country', 'organization_code'];
            foreach ($columns as $column) {
                if (Schema::connection('mysql_master')->hasColumn('organizations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
