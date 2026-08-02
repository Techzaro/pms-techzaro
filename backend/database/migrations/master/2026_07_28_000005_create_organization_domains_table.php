<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: Create organization_domains table (saas_master).
 *
 * Maps custom domains/subdomains to organizations.
 * Supports both subdomain (*.pms.techxaro.com) and custom domain routing.
 *
 * RUNS ON: saas_master database only.
 */
return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organization_domains', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('domain')->unique();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index('domain');
            $table->index('is_primary');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organization_domains');
    }
};
