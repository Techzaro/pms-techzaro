<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create plan_modules table (saas_master).
 *
 * Pivot table linking plans to modules. Defines which modules
 * are included in each subscription plan.
 *
 * RUNS ON: saas_master database only.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('plan_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_id')->constrained('organization_plans')->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('saas_modules')->cascadeOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->unique(['plan_id', 'module_id']);
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('plan_modules');
    }
};
