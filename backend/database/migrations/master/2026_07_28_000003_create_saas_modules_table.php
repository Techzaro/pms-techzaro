<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create saas_modules table (saas_master).
 *
 * Defines the available feature modules that can be enabled
 * per organization/plan. Modules control access to PMS features.
 *
 * RUNS ON: saas_master database only.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('saas_modules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('category')->default('core'); // core, premium, enterprise
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false); // enabled for all plans by default
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('category');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('saas_modules');
    }
};
