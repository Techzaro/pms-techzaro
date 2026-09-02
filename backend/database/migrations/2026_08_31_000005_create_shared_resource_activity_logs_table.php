<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_resource_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('connection_id')->nullable();
            $table->unsignedBigInteger('shared_resource_id')->nullable();
            $table->unsignedBigInteger('organization_id')->nullable()->comment('Org performing the action');
            $table->foreignId('user_id')->nullable();
            $table->string('action', 50)->comment('connected, disconnected, shared, unshared, permission_changed, access_granted, access_revoked, access_requested, access_approved, access_rejected');
            $table->string('resource_type', 50)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->string('old_permission', 30)->nullable();
            $table->string('new_permission', 30)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->json('details')->nullable();
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();

            $table->index('connection_id');
            $table->index('shared_resource_id');
            $table->index('organization_id');
            $table->index('user_id');
            $table->index('action');
            $table->index('acted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_resource_activity_logs');
    }
};
