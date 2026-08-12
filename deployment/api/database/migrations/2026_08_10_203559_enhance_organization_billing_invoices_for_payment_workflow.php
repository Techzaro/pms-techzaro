<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->table('organization_billing_invoices', function (Blueprint $table) {
            $table->timestamp('approved_at')->nullable()->after('due_at');
            $table->string('approved_by', 255)->nullable()->after('approved_at');
            $table->timestamp('billing_period_start')->nullable()->after('billing_period');
            $table->timestamp('billing_period_end')->nullable()->after('billing_period_start');
            $table->text('notes')->nullable()->after('description');
            $table->string('rejection_reason', 500)->nullable()->after('notes');
            $table->string('renewal_reference', 100)->nullable()->after('invoice_number');

            $table->index('approved_at');
            $table->index(['organization_id', 'status']);
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
