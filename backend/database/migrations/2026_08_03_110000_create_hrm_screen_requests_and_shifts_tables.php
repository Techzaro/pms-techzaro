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
        // 1. Live Screen Verification Requests Table (Admin Real-time Request Popup)
        if (!Schema::hasTable('hrm_screen_requests')) {
            Schema::create('hrm_screen_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->foreignId('requested_by')->constrained('users')->onDelete('cascade');
                $table->enum('status', ['Pending', 'Accepted', 'Rejected'])->default('Pending');
                $table->timestamp('responded_at')->nullable();
                $table->timestamps();
            });
        }

        // 2. Working Models & Unlimited Shift Templates Table
        if (!Schema::hasTable('hrm_shift_templates')) {
            Schema::create('hrm_shift_templates', function (Blueprint $table) {
                $table->id();
                $table->string('name'); // e.g. Fixed Morning Shift, Flexible 40h, Rotational Night
                $table->string('shift_type')->default('Fixed'); // Fixed, Flexible, Rotational, Split, Compressed, PartTime, Contractor
                $table->time('shift_start')->nullable();
                $table->time('shift_end')->nullable();
                $table->integer('grace_minutes')->default(15);
                $table->time('late_threshold')->nullable();
                $table->decimal('weekly_hours', 5, 2)->default(40.00);
                $table->json('rules_json')->nullable(); // Store extra rules: auto_absent, idle_timeout, screenshot_required
                $table->timestamps();
            });

            // Seed default shifts
            DB::table('hrm_shift_templates')->insert([
                [
                    'name' => 'Policy A - Fixed Morning Shift',
                    'shift_type' => 'Fixed',
                    'shift_start' => '09:00:00',
                    'shift_end' => '17:00:00',
                    'grace_minutes' => 15,
                    'late_threshold' => '09:15:00',
                    'weekly_hours' => 40.00,
                    'rules_json' => json_encode(['auto_absent' => true, 'idle_timeout_mins' => 15]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'Policy B - Flexible 40h Weekly',
                    'shift_type' => 'Flexible',
                    'shift_start' => null,
                    'shift_end' => null,
                    'grace_minutes' => 0,
                    'late_threshold' => null,
                    'weekly_hours' => 40.00,
                    'rules_json' => json_encode(['auto_absent' => false, 'idle_timeout_mins' => 30]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'Policy C - Rotational Night Shift',
                    'shift_type' => 'Rotational',
                    'shift_start' => '22:00:00',
                    'shift_end' => '06:00:00',
                    'grace_minutes' => 15,
                    'late_threshold' => '22:15:00',
                    'weekly_hours' => 40.00,
                    'rules_json' => json_encode(['auto_absent' => true, 'night_allowance' => true]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            ]);
        }

        // 3. Extend hrm_wfh_requests table with enterprise fields if missing
        Schema::table('hrm_wfh_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_wfh_requests', 'working_address')) {
                $table->string('working_address')->nullable();
            }
            if (!Schema::hasColumn('hrm_wfh_requests', 'expected_hours')) {
                $table->decimal('expected_hours', 4, 1)->default(8.0);
            }
            if (!Schema::hasColumn('hrm_wfh_requests', 'internet_status')) {
                $table->string('internet_status')->default('Fiber Broadband');
            }
            if (!Schema::hasColumn('hrm_wfh_requests', 'emergency_contact')) {
                $table->string('emergency_contact')->nullable();
            }
        });

        // 4. Extend hrm_leave_requests table with enterprise fields if missing
        Schema::table('hrm_leave_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_leave_requests', 'attachment')) {
                $table->string('attachment')->nullable();
            }
            if (!Schema::hasColumn('hrm_leave_requests', 'emergency_contact')) {
                $table->string('emergency_contact')->nullable();
            }
            if (!Schema::hasColumn('hrm_leave_requests', 'replacement_user_id')) {
                $table->foreignId('replacement_user_id')->nullable()->constrained('users')->onDelete('set null');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_shift_templates');
        Schema::dropIfExists('hrm_screen_requests');
    }
};
