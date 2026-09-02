<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->create('organization_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requesting_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('receiving_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->nullable()->comment('User in requesting org who initiated');
            $table->foreignId('approved_by_user_id')->nullable()->comment('User in receiving org who approved');
            $table->string('connection_code', 20)->unique()->comment('TXO-XXXXXXXX format');
            $table->string('status', 20)->default('pending')->comment('pending, active, rejected, expired, suspended, revoked');
            $table->text('request_message')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('suspended_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->json('metadata')->nullable()->comment('Extra connection metadata');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['requesting_organization_id', 'receiving_organization_id'], 'unique_org_connection');
            $table->index('status');
            $table->index('connection_code');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_connections');
    }
};
