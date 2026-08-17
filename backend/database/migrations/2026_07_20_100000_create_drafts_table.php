<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('drafts')) {
            Schema::create('drafts', function (Blueprint $table) {
                $table->id();
                $table->string('draft_code', 20)->unique();
                $table->string('module_type', 50);
                $table->unsignedBigInteger('original_record_id')->nullable();
                $table->json('draft_data');
                $table->string('title', 255)->default('Untitled Draft');
                $table->unsignedBigInteger('created_by');
                $table->unsignedBigInteger('last_edited_by');
                $table->string('status', 30)->default('draft');
                $table->boolean('is_important')->default(false);
                $table->timestamp('last_auto_saved_at')->nullable();
                $table->unsignedInteger('version')->default(1);
                $table->unsignedBigInteger('project_id')->nullable();
                $table->unsignedBigInteger('parent_id')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('created_by')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('last_edited_by')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
                $table->foreign('parent_id')->references('id')->on('tasks')->nullOnDelete();
                $table->index(['module_type', 'created_by']);
                $table->index(['status', 'created_by']);
                $table->index('project_id');
                $table->index('draft_code');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('drafts');
    }
};
