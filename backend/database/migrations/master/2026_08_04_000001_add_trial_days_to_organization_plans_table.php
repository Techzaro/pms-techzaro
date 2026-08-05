<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->table('organization_plans', function (Blueprint $table) {
            $table->unsignedInteger('trial_duration')->default(14)->after('max_storage_gb');
            $table->string('trial_duration_unit', 10)->default('days')->after('trial_duration');
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->table('organization_plans', function (Blueprint $table) {
            $table->dropColumn(['trial_duration', 'trial_duration_unit']);
        });
    }
};
