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
        if (Schema::hasTable('hrm_screen_requests') && !Schema::hasColumn('hrm_screen_requests', 'rejection_reason')) {
            Schema::table('hrm_screen_requests', function (Blueprint $table) {
                $table->string('rejection_reason')->nullable()->after('status');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('hrm_screen_requests') && Schema::hasColumn('hrm_screen_requests', 'rejection_reason')) {
            Schema::table('hrm_screen_requests', function (Blueprint $table) {
                $table->dropColumn('rejection_reason');
            });
        }
    }
};
