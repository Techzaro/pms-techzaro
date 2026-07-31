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
        // 1. Global HRM Settings Table (Country, Currency, Timezone, Weekend Days, Payroll Frequency)
        if (!Schema::hasTable('hrm_global_settings')) {
            Schema::create('hrm_global_settings', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->text('value')->nullable();
                $table->timestamps();
            });

            // Seed default global HR settings
            DB::table('hrm_global_settings')->insert([
                ['key' => 'country', 'value' => 'United States', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'time_zone', 'value' => 'America/New_York', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'currency', 'value' => 'USD', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'weekend_days', 'value' => json_encode(['Saturday', 'Sunday']), 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'work_week_start', 'value' => 'Monday', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'payroll_frequency', 'value' => 'Monthly', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'policy_a_shift_start', 'value' => '09:00:00', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'policy_a_late_after', 'value' => '09:15:00', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'policy_a_grace_minutes', 'value' => '15', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'policy_b_weekly_hours', 'value' => '40', 'created_at' => now(), 'updated_at' => now()],
            ]);
        }

        // 2. Automatic & Manual Timesheets Table
        if (!Schema::hasTable('hrm_timesheets')) {
            Schema::create('hrm_timesheets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('period_type')->default('Monthly'); // Weekly, Monthly
                $table->string('period_name'); // e.g. July 2026, Week 31 2026
                $table->date('start_date');
                $table->date('end_date');
                $table->decimal('total_worked_hours', 8, 2)->default(0);
                $table->decimal('total_break_hours', 8, 2)->default(0);
                $table->decimal('total_overtime_hours', 8, 2)->default(0);
                $table->decimal('pms_project_hours', 8, 2)->default(0);
                $table->enum('status', ['Draft', 'Submitted', 'Approved', 'Locked'])->default('Draft');
                $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_timesheets');
        Schema::dropIfExists('hrm_global_settings');
    }
};
