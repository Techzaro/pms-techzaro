<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('user_device_tokens')) {
            Schema::create('user_device_tokens', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('device_token', 500);
                $table->string('device_type', 32)->default('browser');
                $table->timestamp('last_active_at')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'device_token']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_device_tokens');
    }
};
