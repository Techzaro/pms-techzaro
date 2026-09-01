<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organizations')) {
            Schema::connection('mysql_master')->create('organizations', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->string('type')->default('tenant');
                $table->string('database_name')->nullable();
                $table->string('database_host')->nullable();
                $table->integer('database_port')->default(3306);
                $table->string('database_username')->nullable();
                $table->string('database_password')->nullable();
                $table->string('status', 50)->default('active');
                $table->string('timezone', 50)->default('UTC');
                $table->string('email_policy', 50)->default('all');
                $table->string('logo_path', 500)->nullable();
                $table->json('settings')->nullable();
                $table->timestamp('trial_ends_at')->nullable();
                $table->timestamp('suspended_at')->nullable();
                $table->softDeletes();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organizations');
    }
};
