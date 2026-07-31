<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hrm_interview_scorecards', function (Blueprint $table) {
            $table->id();
            $table->string('candidate_id');
            $table->string('interviewer_name')->default('Muhammad Ahsan');
            $table->integer('technical_score')->default(4);
            $table->integer('communication_score')->default(4);
            $table->integer('problem_solving_score')->default(4);
            $table->integer('cultural_fit_score')->default(4);
            $table->decimal('overall_rating', 3, 2)->default(4.00);
            $table->string('recommendation')->default('Hire');
            $table->text('comments')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_interview_scorecards');
    }
};
