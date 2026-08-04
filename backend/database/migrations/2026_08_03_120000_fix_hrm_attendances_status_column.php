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
        // Change status column in hrm_attendances to VARCHAR string so any status (Completed, Paused, Present, Late, etc) fits cleanly
        DB::statement("ALTER TABLE `hrm_attendances` MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'Present'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE `hrm_attendances` MODIFY COLUMN `status` ENUM('Present', 'Late', 'Half Day', 'Absent', 'On Leave') NOT NULL DEFAULT 'Present'");
    }
};
