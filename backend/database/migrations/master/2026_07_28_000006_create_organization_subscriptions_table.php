<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create organization_subscriptions table (saas_master).
 *
 * Tracks which plan each organization is currently subscribed to,
 * along with billing period and subscription lifecycle dates.
 *
 * RUNS ON: saas_master database only.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organization_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('organization_plans');
            $table->string('billing_period')->default('monthly'); // monthly, yearly
            $table->string('status')->default('active'); // active, cancelled, past_due, trial
            $table->decimal('amount', 8, 2)->default(0);
            $table->string('currency')->default('USD');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('trial_ends_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organization_subscriptions');
    }
};
