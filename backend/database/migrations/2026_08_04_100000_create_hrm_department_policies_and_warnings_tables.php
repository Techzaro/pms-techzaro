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
        // 1. Add max_late_allowed to hrm_shift_templates if missing
        if (Schema::hasTable('hrm_shift_templates')) {
            Schema::table('hrm_shift_templates', function (Blueprint $table) {
                if (!Schema::hasColumn('hrm_shift_templates', 'max_late_allowed')) {
                    $table->integer('max_late_allowed')->default(3)->after('grace_minutes');
                }
            });
        }

        // 2. Department Policies Sync Table
        if (!Schema::hasTable('hrm_department_policies')) {
            Schema::create('hrm_department_policies', function (Blueprint $table) {
                $table->id();
                $table->string('department');
                $table->foreignId('shift_id')->nullable()->constrained('hrm_shift_templates')->onDelete('set null');
                $table->boolean('is_active')->default(true);
                $table->string('policy_notes')->nullable();
                $table->timestamps();
            });
        }

        // 3. Corporate Warnings Table
        if (!Schema::hasTable('hrm_warnings')) {
            Schema::create('hrm_warnings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->foreignId('shift_id')->nullable()->constrained('hrm_shift_templates')->onDelete('set null');
                $table->string('warning_type')->default('Late Arrival Policy Violation');
                $table->integer('late_count')->default(3);
                $table->json('late_dates_json')->nullable();
                $table->text('description')->nullable();
                $table->enum('status', ['Active', 'Removal Requested', 'Removed', 'Dismissed'])->default('Active');
                $table->text('removal_reason')->nullable();
                $table->timestamp('removal_requested_at')->nullable();
                $table->foreignId('removed_by')->nullable()->constrained('users')->onDelete('set null');
                $table->text('admin_notes')->nullable();
                $table->timestamp('removed_at')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_warnings');
        Schema::dropIfExists('hrm_department_policies');
        if (Schema::hasColumn('hrm_shift_templates', 'max_late_allowed')) {
            Schema::table('hrm_shift_templates', function (Blueprint $table) {
                $table->dropColumn('max_late_allowed');
            });
        }
    }
};
