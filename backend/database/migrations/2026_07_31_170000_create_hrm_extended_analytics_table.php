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
        // HRM Daily Analytics Summary Table (Aggregates performance, focus time, utilization %)
        if (!Schema::hasTable('hrm_daily_analytics')) {
            Schema::create('hrm_daily_analytics', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->date('date');
                $table->decimal('total_worked_hours', 8, 2)->default(0);
                $table->decimal('break_hours', 8, 2)->default(0);
                $table->decimal('productive_hours', 8, 2)->default(0);
                $table->decimal('idle_hours', 8, 2)->default(0);
                $table->decimal('overtime_hours', 8, 2)->default(0);
                $table->decimal('billable_hours', 8, 2)->default(0);
                $table->decimal('non_billable_hours', 8, 2)->default(0);
                $table->decimal('productivity_score', 5, 2)->default(95.00); // % score
                $table->decimal('utilization_rate', 5, 2)->default(88.50); // % rate
                $table->integer('late_minutes')->default(0);
                $table->string('attendance_status')->default('Present'); // Present, Late, Absent, Half Day, WFH, On Leave
                $table->timestamps();

                $table->unique(['user_id', 'date']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_daily_analytics');
    }
};
