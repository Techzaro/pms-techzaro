<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_subscriptions')) {
            Schema::connection('mysql_master')->create('organization_subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->foreignId('plan_id')->nullable()->constrained('organization_plans')->nullOnDelete();
                $table->string('billing_period', 20)->default('monthly');
                $table->string('status', 50)->default('active');
                $table->float('amount')->default(0);
                $table->string('currency', 10)->default('USD');
                $table->boolean('is_custom')->default(false);
                $table->float('custom_price_monthly')->nullable();
                $table->float('custom_price_yearly')->nullable();
                $table->integer('custom_max_users')->nullable();
                $table->integer('custom_max_projects')->nullable();
                $table->integer('custom_max_storage_gb')->nullable();
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->timestamp('trial_ends_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index('organization_id');
                $table->index('status');
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_subscriptions');
    }
};
