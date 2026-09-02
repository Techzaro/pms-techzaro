<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('knowledge_bases')) {
            Schema::create('knowledge_bases', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->longText('content')->nullable();
                $table->string('category')->default('General');
                $table->enum('visibility_level', ['private', 'project_team', 'department_team', 'organization'])->default('organization');
                $table->unsignedBigInteger('project_id')->nullable();
                $table->string('department')->nullable();
                $table->string('organization')->nullable();
                $table->string('file_path')->nullable();
                $table->string('file_name')->nullable();
                $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
                $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamps();

                $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_bases');
    }
};
