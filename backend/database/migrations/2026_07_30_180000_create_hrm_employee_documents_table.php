<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hrm_employee_documents', function (Blueprint $table) {
            $table->id();
            $table->string('user_id')->nullable();
            $table->string('user_name');
            $table->string('user_email');
            $table->string('department')->default('Engineering');
            $table->string('title');
            $table->string('category')->default('Identity & CNIC');
            $table->text('file_url')->nullable();
            $table->string('file_name')->nullable();
            $table->string('status')->default('Verified');
            $table->string('expiry_date')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_employee_documents');
    }
};
