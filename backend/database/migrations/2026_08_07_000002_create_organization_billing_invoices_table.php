<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_billing_invoices')) {
            Schema::connection('mysql_master')->create('organization_billing_invoices', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->foreignId('subscription_id')->nullable()->constrained('organization_subscriptions')->nullOnDelete();
                $table->foreignId('plan_id')->nullable()->constrained('organization_plans')->nullOnDelete();
                $table->string('invoice_number', 50)->unique();
                $table->string('status', 50)->default('paid');
                $table->float('amount')->default(0);
                $table->float('tax_amount')->default(0);
                $table->float('total_amount')->default(0);
                $table->string('currency', 10)->default('USD');
                $table->string('billing_period', 20)->default('monthly');
                $table->string('payment_method', 50)->nullable();
                $table->string('description', 500)->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('due_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index('organization_id');
                $table->index('status');
                $table->index('paid_at');
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_billing_invoices');
    }
};
