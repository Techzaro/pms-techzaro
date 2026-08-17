<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->create('organization_storage_usage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('category', 50)->default('attachments');
            $table->string('file_path', 500);
            $table->string('file_name', 255);
            $table->string('mime_type', 100)->nullable();
            $table->unsignedBigInteger('file_size_bytes')->default(0);
            $table->string('uploaded_by_name', 255)->nullable();
            $table->unsignedBigInteger('uploaded_by_id')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_storage_usage');
    }
};
