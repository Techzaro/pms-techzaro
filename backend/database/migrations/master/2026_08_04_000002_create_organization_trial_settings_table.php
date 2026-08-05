<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->create('organization_trial_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->unsignedInteger('trial_duration')->default(14);
            $table->string('trial_duration_unit', 10)->default('days');
            $table->unsignedInteger('max_users')->default(5);
            $table->unsignedInteger('max_projects')->default(5);
            $table->unsignedInteger('max_storage_gb')->default(5);
            $table->timestamps();

            $table->unique('organization_id');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('organization_trial_settings');
    }
};
