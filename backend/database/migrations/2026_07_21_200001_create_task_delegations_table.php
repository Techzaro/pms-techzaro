<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('task_delegations')) {
            Schema::create('task_delegations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->constrained()->cascadeOnDelete();
                $table->foreignId('deliverable_id')->nullable()->constrained('deliverables')->cascadeOnDelete();
                $table->foreignId('delegated_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('delegated_to')->constrained('users')->cascadeOnDelete();
                $table->foreignId('parent_delegation_id')->nullable()->constrained('task_delegations')->nullOnDelete();
                $table->string('reason');
                $table->text('reason_detail')->nullable();
                $table->integer('delegation_level')->default(1);
                $table->string('status')->default('pending'); // pending, accepted, rejected, revoked
                $table->timestamp('accepted_at')->nullable();
                $table->timestamp('rejected_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['task_id', 'status']);
                $table->index(['deliverable_id', 'status']);
                $table->index('delegated_to');
                $table->index('parent_delegation_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_delegations');
    }
};
