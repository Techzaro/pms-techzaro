<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organization_billing_invoices', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'approved_at')) {
                $table->timestamp('approved_at')->nullable()->after('due_at');
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'approved_by')) {
                $table->string('approved_by', 255)->nullable();
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'billing_period_start')) {
                $table->timestamp('billing_period_start')->nullable();
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'billing_period_end')) {
                $table->timestamp('billing_period_end')->nullable();
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'notes')) {
                $table->text('notes')->nullable();
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'rejection_reason')) {
                $table->string('rejection_reason', 500)->nullable();
            }
            if (!Schema::connection('mysql_master')->hasColumn('organization_billing_invoices', 'renewal_reference')) {
                $table->string('renewal_reference', 100)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_billing_invoices', function (Blueprint $table) {
            $table->dropColumn([
                'approved_at',
                'approved_by',
                'billing_period_start',
                'billing_period_end',
                'notes',
                'rejection_reason',
                'renewal_reference',
            ]);
            $table->dropIndex(['organization_id', 'status']);
        });
    }
};
