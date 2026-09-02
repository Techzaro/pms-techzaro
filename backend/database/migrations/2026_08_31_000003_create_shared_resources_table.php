<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_resources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('connection_id')->comment('References organization_connections.id in master DB');
            $table->unsignedBigInteger('shared_by_organization_id')->comment('Org that owns the resource');
            $table->unsignedBigInteger('shared_with_organization_id')->comment('Org receiving access');
            $table->string('resource_type', 50)->comment('project, task, document, event, knowledge_base');
            $table->unsignedBigInteger('resource_id');
            $table->string('permission', 30)->default('view')->comment('view, comment, collaborate');
            $table->boolean('can_download')->default(false);
            $table->string('status', 20)->default('active')->comment('active, expired, revoked');
            $table->foreignId('shared_by_user_id')->nullable()->comment('User who shared');
            $table->foreignId('approved_by_user_id')->nullable()->comment('User who approved');
            $table->text('notes')->nullable();
            $table->timestamp('shared_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('resource_type');
            $table->index(['resource_type', 'resource_id']);
            $table->index('connection_id');
            $table->index('status');
            $table->index('shared_with_organization_id');
            $table->unique(['connection_id', 'resource_type', 'resource_id'], 'unique_shared_resource');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_resources');
    }
};
