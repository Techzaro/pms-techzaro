<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->boolean('allow_transfer')->default(true)->after('delegation_count');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->boolean('allow_transfer')->default(true)->after('delegation_count');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('allow_transfer');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn('allow_transfer');
        });
    }
};
