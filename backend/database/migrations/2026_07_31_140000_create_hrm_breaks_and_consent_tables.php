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
        // 1. Add screen_consent_agreed & shift_policy to users table
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (!Schema::hasColumn('users', 'screen_consent_agreed')) {
                    $table->boolean('screen_consent_agreed')->default(false);
                }
                if (!Schema::hasColumn('users', 'shift_policy')) {
                    $table->enum('shift_policy', ['PolicyA_Fixed', 'Flexible_40h'])->default('PolicyA_Fixed');
                }
            });
        }

        // 2. Work Breaks table for Pause / Resume Web Clock
        if (!Schema::hasTable('hrm_work_breaks')) {
            Schema::create('hrm_work_breaks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('attendance_id')->constrained('hrm_attendances')->onDelete('cascade');
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->timestamp('paused_at');
                $table->timestamp('resumed_at')->nullable();
                $table->integer('break_duration_minutes')->default(0);
                $table->string('reason')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('hrm_work_breaks')) {
            Schema::dropIfExists('hrm_work_breaks');
        }
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (Schema::hasColumn('users', 'screen_consent_agreed')) {
                    $table->dropColumn('screen_consent_agreed');
                }
                if (Schema::hasColumn('users', 'shift_policy')) {
                    $table->dropColumn('shift_policy');
                }
            });
        }
    }
};
