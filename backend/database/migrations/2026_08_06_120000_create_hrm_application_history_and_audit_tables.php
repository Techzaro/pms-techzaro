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
        // 1. Immutable Audit Trail for HRM Applications
        if (!Schema::hasTable('hrm_request_audits')) {
            Schema::create('hrm_request_audits', function (Blueprint $table) {
                $table->id();
                $table->string('request_type'); // WFH Request, Leave Application, Attendance Correction, Member Request, Screen Request, Warning Removal
                $table->unsignedBigInteger('request_id');
                $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('set null');
                $table->string('user_name')->nullable();
                $table->string('user_role')->nullable();
                $table->string('action'); // Application Submitted, Application Edited, Document Uploaded, Document Removed, Status Changed, Assigned Admin Changed, Viewed by Admin, Comment Added, Reply Added, Info Requested, Returned for Revision, Resubmitted, Approved, Rejected, Cancelled, Closed
                $table->string('previous_status')->nullable();
                $table->string('new_status')->nullable();
                $table->text('remarks')->nullable();
                $table->json('metadata')->nullable();
                $table->string('ip_address')->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamps();

                $table->index(['request_type', 'request_id']);
                $table->index('user_id');
            });
        }

        // 2. Threaded Comments & Communications for HRM Applications
        if (!Schema::hasTable('hrm_request_comments')) {
            Schema::create('hrm_request_comments', function (Blueprint $table) {
                $table->id();
                $table->string('request_type');
                $table->unsignedBigInteger('request_id');
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->text('comment');
                $table->boolean('is_internal')->default(false);
                $table->unsignedBigInteger('parent_id')->nullable();
                $table->timestamps();

                $table->index(['request_type', 'request_id']);
            });
        }

        // 3. Document Attachments for HRM Applications
        if (!Schema::hasTable('hrm_request_attachments')) {
            Schema::create('hrm_request_attachments', function (Blueprint $table) {
                $table->id();
                $table->string('request_type');
                $table->unsignedBigInteger('request_id');
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('file_name');
                $table->string('file_path');
                $table->unsignedBigInteger('file_size')->nullable();
                $table->string('file_type')->nullable();
                $table->timestamps();

                $table->index(['request_type', 'request_id']);
            });
        }

        // 4. Ensure assigned_admin_id and priority columns exist in HRM request tables
        $hrmTables = [
            'hrm_wfh_requests',
            'hrm_leave_requests',
            'hrm_attendance_corrections',
            'hrm_member_requests',
            'hrm_screen_requests',
            'hrm_warnings'
        ];

        foreach ($hrmTables as $tbl) {
            if (Schema::hasTable($tbl)) {
                Schema::table($tbl, function (Blueprint $table) use ($tbl) {
                    if (!Schema::hasColumn($tbl, 'assigned_admin_id')) {
                        $table->foreignId('assigned_admin_id')->nullable()->constrained('users')->onDelete('set null');
                    }
                    if (!Schema::hasColumn($tbl, 'priority') && $tbl !== 'hrm_member_requests') {
                        $table->enum('priority', ['Low', 'Medium', 'High', 'Urgent'])->default('Medium');
                    }
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_request_attachments');
        Schema::dropIfExists('hrm_request_comments');
        Schema::dropIfExists('hrm_request_audits');

        $hrmTables = [
            'hrm_wfh_requests',
            'hrm_leave_requests',
            'hrm_attendance_corrections',
            'hrm_member_requests',
            'hrm_screen_requests',
            'hrm_warnings'
        ];

        foreach ($hrmTables as $tbl) {
            if (Schema::hasTable($tbl)) {
                Schema::table($tbl, function (Blueprint $table) use ($tbl) {
                    if (Schema::hasColumn($tbl, 'assigned_admin_id')) {
                        $table->dropForeign([$tbl . '_assigned_admin_id_foreign']);
                        $table->dropColumn('assigned_admin_id');
                    }
                    if (Schema::hasColumn($tbl, 'priority') && $tbl !== 'hrm_member_requests') {
                        $table->dropColumn('priority');
                    }
                });
            }
        }
    }
};
