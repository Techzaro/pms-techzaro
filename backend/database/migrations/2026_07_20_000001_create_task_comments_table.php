<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('task_comments')) {
            Schema::create('task_comments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('parent_id')->nullable()->constrained('task_comments')->cascadeOnDelete();
                $table->text('body');
                $table->string('file_path')->nullable();
                $table->string('file_name')->nullable();
                $table->string('file_size')->nullable();
                $table->boolean('is_edited')->default(false);
                $table->timestamp('edited_at')->nullable();
                $table->timestamp('deleted_at')->nullable();
                $table->timestamps();

                $table->index('task_id');
                $table->index(['task_id', 'created_at']);
                $table->index('parent_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_comments');
    }
};
