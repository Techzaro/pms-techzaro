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
        Schema::table('hrm_member_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_member_requests', 'reviewer_name')) {
                $table->string('reviewer_name')->nullable()->after('status');
            }
            if (!Schema::hasColumn('hrm_member_requests', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable()->after('reviewer_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('hrm_member_requests', function (Blueprint $table) {
            $table->dropColumn(['reviewer_name', 'rejection_reason']);
        });
    }
};
