<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                // Yahan se after() hata diya gaya hai
                $table->string('user_name', 255)->nullable();
                $table->string('module', 50);
                $table->string('action', 50);
                $table->string('entity_type', 100)->nullable();
                $table->unsignedBigInteger('entity_id')->nullable();
                $table->text('description');
                $table->json('old_values')->nullable();
                $table->json('new_values')->nullable();
                $table->string('status', 20)->default('success');
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->string('browser', 100)->nullable();
                $table->string('os', 100)->nullable();
                $table->string('device', 100)->nullable();
                $table->string('request_method', 10)->nullable();
                $table->text('request_url')->nullable();
                $table->timestamps();

                $table->index('module');
                $table->index('action');
                $table->index('status');
                $table->index('created_at');
                $table->index(['module', 'action']);
                $table->index(['entity_type', 'entity_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};