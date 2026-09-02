<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sharing_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->foreignId('user_id')->nullable()->comment('Target user, null = broadcast to all admins');
            $table->unsignedBigInteger('from_organization_id')->nullable();
            $table->string('type', 50)->comment('connection_request, connection_approved, connection_rejected, access_requested, access_approved, access_rejected, resource_shared, permission_changed, access_expiring, access_expired, access_revoked, organization_disconnected');
            $table->string('title', 255);
            $table->text('message')->nullable();
            $table->json('data')->nullable()->comment('Related IDs, resource info, etc');
            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('user_id');
            $table->index('type');
            $table->index('is_read');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sharing_notifications');
    }
};
