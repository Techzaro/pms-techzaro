<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_identities', function (Blueprint $table) {
            $table->id();
            $table->string('normalized_email')->unique();
            $table->string('original_email');
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('type', 20)->default('primary');
            $table->boolean('verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->string('verification_token')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_identities');
    }
};
