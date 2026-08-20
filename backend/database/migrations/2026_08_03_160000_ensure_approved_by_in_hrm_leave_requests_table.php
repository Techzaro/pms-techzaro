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
        if (Schema::hasTable('hrm_leave_requests')) {
            Schema::table('hrm_leave_requests', function (Blueprint $table) {
                if (!Schema::hasColumn('hrm_leave_requests', 'approved_by')) {
                    $table->unsignedBigInteger('approved_by')->nullable()->after('status');
                }
                if (!Schema::hasColumn('hrm_leave_requests', 'rejection_reason')) {
                    $table->string('rejection_reason')->nullable()->after('approved_by');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('hrm_leave_requests')) {
            Schema::table('hrm_leave_requests', function (Blueprint $table) {
                if (Schema::hasColumn('hrm_leave_requests', 'approved_by')) {
                    $table->dropColumn('approved_by');
                }
                if (Schema::hasColumn('hrm_leave_requests', 'rejection_reason')) {
                    $table->dropColumn('rejection_reason');
                }
            });
        }
    }
};
