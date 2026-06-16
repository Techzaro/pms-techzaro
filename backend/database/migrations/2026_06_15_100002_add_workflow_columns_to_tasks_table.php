<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('status');
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->timestamp('rejected_at')->nullable()->after('approved_at');
            $table->text('rejection_comment')->nullable()->after('rejected_at');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete()->after('rejection_comment');
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete()->after('approved_by');
            $table->timestamp('reopened_at')->nullable()->after('rejected_by');
            $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete()->after('reopened_at');
            $table->text('reopen_comment')->nullable()->after('reopened_by');
            $table->text('reopen_instructions')->nullable()->after('reopen_comment');
            $table->date('reopen_new_deadline')->nullable()->after('reopen_instructions');
            $table->string('reopen_file_path')->nullable()->after('reopen_new_deadline');
            $table->string('reopen_file_name')->nullable()->after('reopen_file_path');
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
