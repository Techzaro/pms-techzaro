<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create organization_plans table (saas_master).
 *
 * Defines the subscription plans available for organizations.
 * Each plan has a name, pricing, limits, and billing interval.
 *
 * RUNS ON: saas_master database only.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organization_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->decimal('price_monthly', 8, 2)->default(0);
            $table->decimal('price_yearly', 8, 2)->default(0);
            $table->unsignedInteger('max_users')->default(10);
            $table->unsignedInteger('max_projects')->default(10);
            $table->unsignedInteger('max_storage_gb')->default(5);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('is_active');
            $table->index('is_default');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organization_plans');
    }
};
