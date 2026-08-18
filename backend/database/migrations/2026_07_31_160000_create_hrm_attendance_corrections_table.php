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
        // Attendance Correction / Manual Entry Requests Table
        if (!Schema::hasTable('hrm_attendance_corrections')) {
            Schema::create('hrm_attendance_corrections', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->date('date');
                $table->time('requested_clock_in')->nullable();
                $table->time('requested_clock_out')->nullable();
                $table->string('work_mode')->default('Office');
                $table->text('reason');
                $table->enum('status', ['Pending', 'Approved', 'Rejected'])->default('Pending');
                $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_attendance_corrections');
    }
};
