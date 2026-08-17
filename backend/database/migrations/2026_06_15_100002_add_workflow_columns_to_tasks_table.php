<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'submitted_at')) {
                $table->timestamp('submitted_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'approved_at')) {
                $table->timestamp('approved_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'rejection_comment')) {
                $table->text('rejection_comment')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'approved_by')) {
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'rejected_by')) {
                $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'reopened_at')) {
                $table->timestamp('reopened_at')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'reopened_by')) {
                $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'reopen_comment')) {
                $table->text('reopen_comment')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'reopen_instructions')) {
                $table->text('reopen_instructions')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'reopen_new_deadline')) {
                $table->date('reopen_new_deadline')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'reopen_file_path')) {
                $table->string('reopen_file_path')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'reopen_file_name')) {
                $table->string('reopen_file_name')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropForeign(['rejected_by']);
            $table->dropForeign(['reopened_by']);
            $table->dropColumn([
                'submitted_at', 'approved_at', 'rejected_at', 'rejection_comment',
                'approved_by', 'rejected_by', 'reopened_at', 'reopened_by',
                'reopen_comment', 'reopen_instructions', 'reopen_new_deadline',
                'reopen_file_path', 'reopen_file_name',
            ]);
        });
    }
};
