<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_submissions', function (Blueprint $table) {
            if (!Schema::hasColumn('task_submissions', 'version_number')) {
                $table->integer('version_number')->default(1);
            }
            if (!Schema::hasColumn('task_submissions', 'status')) {
                $table->string('status', 32)->default('pending');
            }
            if (!Schema::hasColumn('task_submissions', 'approved_by')) {
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('task_submissions', 'approved_at')) {
                $table->timestamp('approved_at')->nullable();
            }
            if (!Schema::hasColumn('task_submissions', 'reopened_by')) {
                $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('task_submissions', 'reopened_at')) {
                $table->timestamp('reopened_at')->nullable();
            }
            if (!Schema::hasColumn('task_submissions', 'reopen_reason')) {
                $table->text('reopen_reason')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('task_submissions', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropForeign(['reopened_by']);
            $table->dropColumn([
                'version_number', 'status', 'approved_by', 'approved_at',
                'reopened_by', 'reopened_at', 'reopen_reason',
            ]);
        });
    }
};
