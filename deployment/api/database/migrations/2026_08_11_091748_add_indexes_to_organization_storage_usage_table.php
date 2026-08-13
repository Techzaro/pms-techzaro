<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organization_storage_usage', function (Blueprint $table) {
            $table->index('created_at', 'su_created_at_idx');
            $table->index('file_size_bytes', 'su_file_size_idx');
            $table->index(['organization_id', 'created_at'], 'su_org_created_idx');
            $table->index(['organization_id', 'file_size_bytes'], 'su_org_size_idx');
            $table->index(['organization_id', 'category'], 'su_org_category_idx');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_storage_usage', function (Blueprint $table) {
            $table->dropIndex('su_created_at_idx');
            $table->dropIndex('su_file_size_idx');
            $table->dropIndex('su_org_created_idx');
            $table->dropIndex('su_org_size_idx');
            $table->dropIndex('su_org_category_idx');
        });
    }
};
