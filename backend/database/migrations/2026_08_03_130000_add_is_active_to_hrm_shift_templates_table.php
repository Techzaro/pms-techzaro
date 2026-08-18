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
        Schema::table('hrm_shift_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_shift_templates', 'is_active')) {
                $table->boolean('is_active')->default(false)->after('rules_json');
            }
        });

        // Set the first policy (Policy A) as active by default if none is active
        DB::table('hrm_shift_templates')->limit(1)->update(['is_active' => true]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('hrm_shift_templates', function (Blueprint $table) {
            if (Schema::hasColumn('hrm_shift_templates', 'is_active')) {
                $table->dropColumn('is_active');
            }
        });
    }
};
