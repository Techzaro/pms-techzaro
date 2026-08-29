<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'creator_id')) {
                $table->foreignId('creator_id')->nullable()->after('assigned_by')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'current_submitter_id')) {
                $table->foreignId('current_submitter_id')->nullable()->after('current_owner')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'current_reviewer_id')) {
                $table->foreignId('current_reviewer_id')->nullable()->after('current_submitter_id')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'submission_stage')) {
                $table->string('submission_stage', 64)->nullable()->after('current_reviewer_id');
            }
            if (!Schema::hasColumn('tasks', 'submission_forwarded_by')) {
                $table->json('submission_forwarded_by')->nullable()->after('submission_stage');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'submission_forwarded_by')) {
                $table->dropColumn('submission_forwarded_by');
            }
            if (Schema::hasColumn('tasks', 'submission_stage')) {
                $table->dropColumn('submission_stage');
            }
            if (Schema::hasColumn('tasks', 'current_reviewer_id')) {
                $table->dropForeign(['current_reviewer_id']);
                $table->dropColumn('current_reviewer_id');
            }
            if (Schema::hasColumn('tasks', 'current_submitter_id')) {
                $table->dropForeign(['current_submitter_id']);
                $table->dropColumn('current_submitter_id');
            }
            if (Schema::hasColumn('tasks', 'creator_id')) {
                $table->dropForeign(['creator_id']);
                $table->dropColumn('creator_id');
            }
        });
    }
};
