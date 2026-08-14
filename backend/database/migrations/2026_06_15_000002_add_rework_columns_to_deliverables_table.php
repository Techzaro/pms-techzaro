<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'rework_comment')) {
                $table->text('rework_comment')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'rework_instructions')) {
                $table->text('rework_instructions')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'rework_new_deadline')) {
                $table->date('rework_new_deadline')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'rework_file_path')) {
                $table->string('rework_file_path')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'rework_file_name')) {
                $table->string('rework_file_name')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['rework_comment', 'rework_instructions', 'rework_new_deadline', 'rework_file_path', 'rework_file_name']);
        });
    }
};
