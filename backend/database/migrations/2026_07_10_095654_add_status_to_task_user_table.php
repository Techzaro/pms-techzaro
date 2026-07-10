<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_user', function (Blueprint $table) {
            $table->string('status', 32)->nullable()->default('pending')->after('due_date');
            $table->timestamp('submitted_at')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('task_user', function (Blueprint $table) {
            $table->dropColumn(['status', 'submitted_at']);
        });
    }
};
