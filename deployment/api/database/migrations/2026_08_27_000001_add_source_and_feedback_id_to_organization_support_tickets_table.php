<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organization_support_tickets', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'source')) {
                $table->string('source', 50)->default('manual')->after('category');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'tenant_feedback_id')) {
                $table->unsignedBigInteger('tenant_feedback_id')->nullable()->after('source');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'feedback_reference_number')) {
                $table->string('feedback_reference_number', 50)->nullable()->after('tenant_feedback_id');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'feedback_metadata')) {
                $table->text('feedback_metadata')->nullable()->after('feedback_reference_number');
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_support_tickets', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'source')) {
                $table->dropColumn('source');
            }
            if (Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'tenant_feedback_id')) {
                $table->dropColumn('tenant_feedback_id');
            }
            if (Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'feedback_reference_number')) {
                $table->dropColumn('feedback_reference_number');
            }
            if (Schema::connection('mysql_master')->hasColumn('organization_support_tickets', 'feedback_metadata')) {
                $table->dropColumn('feedback_metadata');
            }
        });
    }
};
