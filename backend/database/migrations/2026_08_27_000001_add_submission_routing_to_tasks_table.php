<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('tasks', 'creator_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->foreignId('creator_id')->nullable()->after('assigned_by')->constrained('users')->nullOnDelete();
            });
        }
        \Illuminate\Support\Facades\DB::table('tasks')->whereNull('creator_id')->update(['creator_id' => \Illuminate\Support\Facades\DB::raw('assigned_by')]);
        
        if (!Schema::hasColumn('tasks', 'current_reviewer_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->foreignId('current_reviewer_id')->nullable()->after('current_owner')->constrained('users')->nullOnDelete();
            });
        }
        if (!Schema::hasColumn('tasks', 'current_submitter_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->foreignId('current_submitter_id')->nullable()->after('current_reviewer_id')->constrained('users')->nullOnDelete();
            });
        }
        if (!Schema::hasColumn('tasks', 'submission_stage')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->string('submission_stage', 40)->nullable()->after('current_submitter_id')->index();
            });
        }
        if (!Schema::hasColumn('tasks', 'submission_forwarded_by')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->json('submission_forwarded_by')->nullable()->after('submission_stage');
            });
        }
    }
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'submission_forwarded_by')) { $table->dropColumn('submission_forwarded_by'); }
            if (Schema::hasColumn('tasks', 'submission_stage')) { $table->dropColumn('submission_stage'); }
            if (Schema::hasColumn('tasks', 'current_submitter_id')) { $table->dropConstrainedForeignId('current_submitter_id'); }
            if (Schema::hasColumn('tasks', 'current_reviewer_id')) { $table->dropConstrainedForeignId('current_reviewer_id'); }
            if (Schema::hasColumn('tasks', 'creator_id')) { $table->dropConstrainedForeignId('creator_id'); }
        });
    }
};
