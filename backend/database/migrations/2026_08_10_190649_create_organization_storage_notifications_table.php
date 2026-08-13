<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->create('organization_storage_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('type', 50);
            $table->string('severity', 20)->default('warning');
            $table->string('title', 255);
            $table->text('message');
            $table->json('metadata')->nullable();
            $table->boolean('is_read')->default(false);
            $table->boolean('is_dismissed')->default(false);
            $table->boolean('email_sent')->default(false);
            $table->timestamp('read_at')->nullable();
            $table->timestamp('dismissed_at')->nullable();
            $table->timestamps();

            $table->index('organization_id', 'stor_notif_org_idx');
            $table->index('type', 'stor_notif_type_idx');
            $table->index(['organization_id', 'is_dismissed'], 'stor_notif_org_dismissed_idx');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_storage_notifications');
    }
};
