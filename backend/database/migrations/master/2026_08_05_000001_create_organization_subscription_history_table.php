<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organization_subscription_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('organization_plans');
            $table->foreignId('previous_plan_id')->nullable()->constrained('organization_plans');
            $table->string('event_type'); // trial_started, plan_assigned, plan_changed, plan_upgraded, plan_downgraded, subscription_renewed, subscription_cancelled, subscription_suspended, subscription_reactivated
            $table->string('status')->default('active'); // active, cancelled, trial, replaced
            $table->string('billing_period')->default('monthly');
            $table->decimal('amount', 8, 2)->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->string('changed_by')->nullable(); // user name or 'System'
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('plan_id');
            $table->index('event_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organization_subscription_history');
    }
};
