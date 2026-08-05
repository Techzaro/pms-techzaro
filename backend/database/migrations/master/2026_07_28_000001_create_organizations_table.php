<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create organizations table (saas_master).
 *
 * This is the central registry of all tenants/organizations.
 * Each row represents one isolated tenant with its own database.
 *
 * RUNS ON: saas_master database only.
 * DO NOT run on tenant databases.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('database_name')->unique();
            $table->string('database_host')->default('127.0.0.1');
            $table->unsignedSmallInteger('database_port')->default(3306);
            $table->string('database_username')->default('root');
            $table->string('database_password')->nullable();
            $table->string('status')->default('active'); // active, inactive, suspended, trial
            $table->string('timezone')->default('Asia/Karachi');
            $table->string('logo_path')->nullable();
            $table->json('settings')->nullable();
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('suspended_at')->nullable();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organizations');
    }
};
