<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'reopened_at')) {
                $table->timestamp('reopened_at')->nullable()->after('rejected_by');
            }
            if (!Schema::hasColumn('deliverables', 'reopened_by')) {
                $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('deliverables', 'reopen_comment')) {
                $table->text('reopen_comment')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'reopen_instructions')) {
                $table->text('reopen_instructions')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'reopen_new_deadline')) {
                $table->date('reopen_new_deadline')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'reopen_file_path')) {
                $table->string('reopen_file_path')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'reopen_file_name')) {
                $table->string('reopen_file_name')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['reopened_at', 'reopened_by', 'reopen_comment', 'reopen_instructions', 'reopen_new_deadline', 'reopen_file_path', 'reopen_file_name']);
        });
    }
};
