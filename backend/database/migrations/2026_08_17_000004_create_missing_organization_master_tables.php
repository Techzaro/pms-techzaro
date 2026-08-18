<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        $schema = Schema::connection($this->connection);

        if (!$schema->hasTable('organization_domains')) {
            $schema->create('organization_domains', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->string('domain')->unique();
                $table->boolean('is_primary')->default(true);
                $table->boolean('is_verified')->default(false);
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();

                $table->index(['organization_id', 'is_primary']);
            });
        }

        if (!$schema->hasTable('organization_subscription_history')) {
            $schema->create('organization_subscription_history', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->foreignId('plan_id')->constrained('organization_plans')->cascadeOnDelete();
                $table->foreignId('previous_plan_id')->nullable()->constrained('organization_plans')->nullOnDelete();
                $table->string('event_type', 50);
                $table->string('status', 50)->nullable();
                $table->string('billing_period', 20)->nullable();
                $table->decimal('amount', 10, 2)->default(0);
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();
                $table->string('changed_by')->default('System');
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index(['organization_id', 'created_at'], 'org_sub_history_org_created_idx');
                $table->index('event_type');
            });
        }

        if (!$schema->hasTable('organization_trial_settings')) {
            $schema->create('organization_trial_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->unique()->constrained('organizations')->cascadeOnDelete();
                $table->unsignedInteger('trial_duration')->default(14);
                $table->string('trial_duration_unit', 20)->default('days');
                $table->unsignedInteger('max_users')->default(5);
                $table->unsignedInteger('max_projects')->default(3);
                $table->unsignedInteger('max_storage_gb')->default(1);
                $table->timestamps();
            });
        }

        if (!$schema->hasTable('activity_logs')) {
            $schema->create('activity_logs', function (Blueprint $table) {
                $table->id();
                $table->string('user')->nullable();
                $table->string('action');
                $table->string('target')->nullable();
                $table->string('ip', 45)->nullable();
                $table->string('status', 50)->default('success');
                $table->text('details')->nullable();
                $table->timestamps();

                $table->index(['status', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        $schema = Schema::connection($this->connection);
        $schema->dropIfExists('activity_logs');
        $schema->dropIfExists('organization_trial_settings');
        $schema->dropIfExists('organization_subscription_history');
        $schema->dropIfExists('organization_domains');
    }
};
