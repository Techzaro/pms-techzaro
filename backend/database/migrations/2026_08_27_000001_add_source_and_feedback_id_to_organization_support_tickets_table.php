<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organization_support_tickets', function (Blueprint $table) {
            $table->string('source', 50)->default('manual')->after('category');
            $table->unsignedBigInteger('tenant_feedback_id')->nullable()->after('source');
            $table->string('feedback_reference_number', 50)->nullable()->after('tenant_feedback_id');
            $table->text('feedback_metadata')->nullable()->after('feedback_reference_number');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_support_tickets', function (Blueprint $table) {
            $table->dropColumn(['source', 'tenant_feedback_id', 'feedback_reference_number', 'feedback_metadata']);
        });
    }
};
