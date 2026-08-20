<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('hrm_member_requests')) {
            Schema::table('hrm_member_requests', function (Blueprint $table) {
                if (!Schema::hasColumn('hrm_member_requests', 'user_email')) {
                    $table->string('user_email')->nullable()->after('user_id');
                }
                if (!Schema::hasColumn('hrm_member_requests', 'reviewer_name')) {
                    $table->string('reviewer_name')->nullable()->after('status');
                }
                if (!Schema::hasColumn('hrm_member_requests', 'rejection_reason')) {
                    $table->text('rejection_reason')->nullable()->after('reviewer_name');
                }
            });

            // Modify category column type to string across MySQL/SQLite
            try {
                DB::statement("ALTER TABLE hrm_member_requests MODIFY category VARCHAR(255) NOT NULL DEFAULT 'General HR Inquiry'");
            } catch (\Throwable $e) {
                // Fallback for SQLite or driver variations
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
