<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('submission_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('submission_id')->constrained()->cascadeOnDelete();
            $table->string('submission_type', 32)->comment('task, project, or deliverable');
            $table->string('file_name')->nullable();
            $table->string('original_name')->nullable();
            $table->string('file_path')->nullable();
            $table->string('file_type')->nullable()->comment('mime type');
            $table->unsignedBigInteger('file_size')->nullable();
            $table->enum('attachment_type', ['file', 'image', 'link'])->default('file');
            $table->string('url')->nullable()->comment('external link URL or local file path');
            $table->timestamps();

            $table->index(['submission_id', 'submission_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('submission_attachments');
    }
};
