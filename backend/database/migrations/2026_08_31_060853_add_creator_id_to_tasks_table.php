<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'creator_id')) {
                $table->unsignedBigInteger('creator_id')->nullable()->after('assigned_by');
            }
        });

        Schema::table('projects', function (Blueprint $table) {
            if (!Schema::hasColumn('projects', 'creator_id')) {
                $table->unsignedBigInteger('creator_id')->nullable()->after('created_by');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'creator_id')) {
                $table->unsignedBigInteger('creator_id')->nullable()->after('created_by');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'creator_id')) {
                $table->dropColumn('creator_id');
            }
        });

        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'creator_id')) {
                $table->dropColumn('creator_id');
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (Schema::hasColumn('deliverables', 'creator_id')) {
                $table->dropColumn('creator_id');
            }
        });
    }
};
