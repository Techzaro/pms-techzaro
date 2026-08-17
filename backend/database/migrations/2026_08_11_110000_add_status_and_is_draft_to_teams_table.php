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
        Schema::table('teams', function (Blueprint $table) {
            if (!Schema::hasColumn('teams', 'status')) {
                $table->string('status')->default('active')->after('description');
            }
            if (!Schema::hasColumn('teams', 'is_draft')) {
                $table->boolean('is_draft')->default(false)->after('status');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            if (Schema::hasColumn('teams', 'is_draft')) {
                $table->dropColumn('is_draft');
            }
            if (Schema::hasColumn('teams', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
