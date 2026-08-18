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
        if (!Schema::hasTable('hrm_application_types')) {
            Schema::create('hrm_application_types', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code')->unique();
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });

            // Seed standard initial application types
            $initialTypes = [
                ['name' => 'Work From Home (WFH)', 'code' => 'WFH', 'description' => 'Request to work remotely or from home.'],
                ['name' => 'Leave Application', 'code' => 'LEAVE', 'description' => 'Casual, Sick, Annual, or Unpaid Leave application.'],
                ['name' => 'Attendance Correction', 'code' => 'CORRECTION', 'description' => 'Correction for missed clock in/out punch.'],
                ['name' => 'Equipment & Hardware Request', 'code' => 'EQUIPMENT', 'description' => 'Request laptop, monitor, peripherals or assets.'],
                ['name' => 'Document & Certificate Request', 'code' => 'DOCUMENT', 'description' => 'Request experience letter, NOC, salary slip, etc.'],
                ['name' => 'Medical Expense Claim', 'code' => 'MEDICAL', 'description' => 'Submit medical reimbursement claim.'],
                ['name' => 'Loan / Advance Salary Request', 'code' => 'LOAN', 'description' => 'Request salary advance or financial loan.'],
                ['name' => 'General HR Inquiry', 'code' => 'GENERAL', 'description' => 'General HR questions or corporate policy inquiry.'],
                ['name' => 'Other (Custom Request)', 'code' => 'OTHER', 'description' => 'Custom user-specified application type.'],
            ];

            foreach ($initialTypes as $type) {
                DB::table('hrm_application_types')->insert([
                    'name' => $type['name'],
                    'code' => $type['code'],
                    'description' => $type['description'],
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_application_types');
    }
};
