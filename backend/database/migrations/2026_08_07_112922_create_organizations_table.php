<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('organizations')) {
            Schema::create('organizations', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->string('type')->default('standard');
                $table->string('database_name')->nullable();
                $table->string('database_host')->nullable();
                $table->string('database_port')->nullable();
                $table->string('database_username')->nullable();
                $table->string('database_password')->nullable();
                $table->string('status')->default('active');
                $table->string('timezone')->default('UTC');
                $table->string('email_policy')->nullable();
                $table->string('logo_path')->nullable();
                $table->json('settings')->nullable();
                $table->timestamp('trial_ends_at')->nullable();
                $table->timestamp('suspended_at')->nullable();
                $table->softDeletes();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('organizations');
    }
};
