<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::dropIfExists('project_user_submissions');
        Schema::dropIfExists('project_submissions');

        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropForeign(['rejected_by']);
            $table->dropForeign(['reopened_by']);
            $table->dropColumn([
                'submitted_at',
                'approved_at',
                'rejected_at',
                'rejection_comment',
                'approved_by',
                'rejected_by',
                'reopened_at',
                'reopened_by',
                'reopen_comment',
                'reopen_instructions',
                'reopen_new_deadline',
                'reopen_file_path',
                'reopen_file_name',
            ]);
        });
    }

    public function down()
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('sort_order');
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->timestamp('rejected_at')->nullable()->after('approved_at');
            $table->text('rejection_comment')->nullable()->after('rejected_at');
            $table->unsignedBigInteger('approved_by')->nullable()->after('rejection_comment');
            $table->unsignedBigInteger('rejected_by')->nullable()->after('approved_by');
            $table->timestamp('reopened_at')->nullable()->after('rejected_by');
            $table->unsignedBigInteger('reopened_by')->nullable()->after('reopened_at');
            $table->text('reopen_comment')->nullable()->after('reopened_by');
            $table->text('reopen_instructions')->nullable()->after('reopen_comment');
            $table->timestamp('reopen_new_deadline')->nullable()->after('reopen_instructions');
            $table->string('reopen_file_path')->nullable()->after('reopen_new_deadline');
            $table->string('reopen_file_name')->nullable()->after('reopen_file_path');
        });

        Schema::create('project_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('pending');
            $table->text('comment')->nullable();
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->json('links')->nullable();
            $table->text('review_comment')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamps();
        });

        Schema::create('project_user_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('pending');
            $table->text('comment')->nullable();
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->json('links')->nullable();
            $table->text('review_comment')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamps();
        });
    }
};
