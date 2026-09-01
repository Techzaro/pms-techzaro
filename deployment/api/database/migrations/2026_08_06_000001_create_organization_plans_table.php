<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_plans')) {
            Schema::connection('mysql_master')->create('organization_plans', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->text('description')->nullable();
                $table->float('price_monthly')->default(0);
                $table->float('price_yearly')->default(0);
                $table->integer('max_users')->default(10);
                $table->integer('max_projects')->default(5);
                $table->integer('max_storage_gb')->default(5);
                $table->integer('trial_duration')->default(14);
                $table->string('trial_duration_unit', 20)->default('days');
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_plans');
    }
};
