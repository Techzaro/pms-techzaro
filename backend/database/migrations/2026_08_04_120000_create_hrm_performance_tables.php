<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Employee Performance OKRs & Goals Table
        if (!Schema::hasTable('hrm_performance_goals')) {
            Schema::create('hrm_performance_goals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('goal_title');
                $table->string('category')->default('Technical'); // Technical, Productivity, Quality, Leadership
                $table->decimal('target_value', 10, 2)->default(100.00);
                $table->decimal('current_value', 10, 2)->default(0.00);
                $table->string('unit')->default('%'); // %, Hours, Tasks, Score
                $table->integer('weightage')->default(25); // 0-100%
                $table->enum('status', ['On Track', 'At Risk', 'Behind', 'Completed'])->default('On Track');
                $table->date('due_date')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamps();
            });
        }

        // 2. 360 Degree Performance Appraisals Table
        if (!Schema::hasTable('hrm_performance_appraisals')) {
            Schema::create('hrm_performance_appraisals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->foreignId('evaluator_id')->nullable()->constrained('users')->onDelete('set null');
                $table->string('period_name')->default('Q3 2026');
                $table->decimal('technical_score', 3, 1)->default(4.0); // 1.0 - 5.0
                $table->decimal('timeliness_score', 3, 1)->default(4.0);
                $table->decimal('collaboration_score', 3, 1)->default(4.0);
                $table->decimal('problem_solving_score', 3, 1)->default(4.0);
                $table->decimal('communication_score', 3, 1)->default(4.0);
                $table->decimal('overall_score', 3, 1)->default(4.0);
                $table->string('rating_tier')->default('Meets Expectations'); // Exceeds Expectations, Meets Expectations, Needs Improvement, Unsatisfactory
                $table->text('feedback_notes')->nullable();
                $table->boolean('promotion_eligible')->default(false);
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_performance_appraisals');
        Schema::dropIfExists('hrm_performance_goals');
    }
};
