<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_resource_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shared_resource_id')->constrained('shared_resources')->cascadeOnDelete();
            $table->foreignId('user_id')->comment('User from the external org');
            $table->string('permission_override', 30)->nullable()->comment('Override resource-level permission');
            $table->boolean('can_download')->nullable()->comment('Override resource-level download permission');
            $table->string('status', 20)->default('active')->comment('active, expired, revoked');
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('granted_by_user_id')->nullable()->comment('User who granted this access');
            $table->timestamps();

            $table->unique(['shared_resource_id', 'user_id'], 'unique_shared_resource_user');
            $table->index('user_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_resource_users');
    }
};
