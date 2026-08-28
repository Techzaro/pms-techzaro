<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('creator_id')->nullable()->after('assigned_by')->constrained('users')->nullOnDelete();
            $table->foreignId('current_reviewer_id')->nullable()->after('current_owner')->constrained('users')->nullOnDelete();
            $table->foreignId('current_submitter_id')->nullable()->after('current_reviewer_id')->constrained('users')->nullOnDelete();
            $table->string('submission_stage', 40)->nullable()->after('current_submitter_id')->index();
            $table->json('submission_forwarded_by')->nullable()->after('submission_stage');
        });

        DB::table('tasks')->whereNull('creator_id')->update(['creator_id' => DB::raw('assigned_by')]);
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('creator_id');
            $table->dropConstrainedForeignId('current_reviewer_id');
            $table->dropConstrainedForeignId('current_submitter_id');
            $table->dropColumn(['submission_stage', 'submission_forwarded_by']);
        });
    }
};
