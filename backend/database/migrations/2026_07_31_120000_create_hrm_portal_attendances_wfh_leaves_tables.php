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
        // 1. Attendance Records
        if (!Schema::hasTable('hrm_attendances')) {
            Schema::create('hrm_attendances', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->date('date');
                $table->time('clock_in')->nullable();
                $table->time('clock_out')->nullable();
                $table->enum('work_mode', ['Office', 'WFH', 'Field'])->default('Office');
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->string('location_address')->nullable();
                $table->enum('status', ['Present', 'Late', 'Half Day', 'Absent', 'On Leave'])->default('Present');
                $table->integer('work_duration_minutes')->default(0);
                $table->integer('overtime_minutes')->default(0);
                $table->string('ip_address')->nullable();
                $table->timestamps();
            });
        }

        // 2. WFH Requests & Approvals
        if (!Schema::hasTable('hrm_wfh_requests')) {
            Schema::create('hrm_wfh_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->date('request_date');
                $table->text('reason');
                $table->enum('status', ['Pending', 'Approved', 'Rejected'])->default('Pending');
                $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();
                $table->timestamps();
            });
        }

        // 3. Work Snapshots / Work Proof Screenshots
        if (!Schema::hasTable('hrm_work_snapshots')) {
            Schema::create('hrm_work_snapshots', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->foreignId('attendance_id')->nullable()->constrained('hrm_attendances')->onDelete('set null');
                $table->foreignId('wfh_request_id')->nullable()->constrained('hrm_wfh_requests')->onDelete('set null');
                $table->longText('snapshot_data'); // Base64 or URL
                $table->timestamp('captured_at');
                $table->string('notes')->nullable();
                $table->timestamps();
            });
        }

        // 4. Leave Applications
        if (!Schema::hasTable('hrm_leave_requests')) {
            Schema::create('hrm_leave_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->enum('leave_type', ['Casual', 'Sick', 'Annual', 'Unpaid'])->default('Casual');
                $table->date('start_date');
                $table->date('end_date');
                $table->decimal('total_days', 3, 1)->default(1.0);
                $table->text('reason');
                $table->string('attachment_file')->nullable();
                $table->enum('status', ['Pending', 'Approved', 'Rejected'])->default('Pending');
                $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
                $table->string('rejection_reason')->nullable();
                $table->timestamps();
            });
        }

        // 5. Salary Slips
        if (!Schema::hasTable('hrm_salary_slips')) {
            Schema::create('hrm_salary_slips', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('month_year'); // e.g. July 2026
                $table->decimal('basic_salary', 10, 2);
                $table->decimal('allowances', 10, 2)->default(0.00);
                $table->decimal('deductions', 10, 2)->default(0.00);
                $table->decimal('net_salary', 10, 2);
                $table->string('pdf_path')->nullable();
                $table->enum('status', ['Draft', 'Paid', 'Generated'])->default('Generated');
                $table->timestamps();
            });
        }

        // 6. Member HR Dynamic Requests
        if (!Schema::hasTable('hrm_member_requests')) {
            Schema::create('hrm_member_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->enum('category', ['WFH Request', 'Equipment Request', 'Document Request', 'General HR Inquiry'])->default('General HR Inquiry');
                $table->string('subject');
                $table->text('details');
                $table->enum('priority', ['Low', 'Medium', 'High'])->default('Medium');
                $table->enum('status', ['Pending', 'Approved', 'Rejected', 'Closed'])->default('Pending');
                $table->text('hr_response')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_member_requests');
        Schema::dropIfExists('hrm_salary_slips');
        Schema::dropIfExists('hrm_leave_requests');
        Schema::dropIfExists('hrm_work_snapshots');
        Schema::dropIfExists('hrm_wfh_requests');
        Schema::dropIfExists('hrm_attendances');
    }
};
