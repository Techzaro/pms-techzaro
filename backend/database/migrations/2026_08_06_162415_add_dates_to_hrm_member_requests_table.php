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
        Schema::table('hrm_member_requests', function (Blueprint $table) {
            $table->string('start_date')->nullable();
            $table->string('end_date')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('hrm_member_requests', function (Blueprint $table) {
            $table->dropColumn(['start_date', 'end_date']);
        });
    }
};
