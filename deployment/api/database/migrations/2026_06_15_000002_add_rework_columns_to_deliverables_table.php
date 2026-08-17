<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->text('rework_comment')->nullable()->after('reopen_file_name');
            $table->text('rework_instructions')->nullable()->after('rework_comment');
            $table->date('rework_new_deadline')->nullable()->after('rework_instructions');
            $table->string('rework_file_path')->nullable()->after('rework_new_deadline');
            $table->string('rework_file_name')->nullable()->after('rework_file_path');
        });
    }

    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['rework_comment', 'rework_instructions', 'rework_new_deadline', 'rework_file_path', 'rework_file_name']);
        });
    }
};
