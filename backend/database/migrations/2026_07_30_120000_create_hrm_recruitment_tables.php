<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hrm_job_openings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('title');
            $table->string('department');
            $table->string('location');
            $table->string('type')->default('Full-time');
            $table->string('status')->default('Open');
            $table->integer('openings')->default(1);
            $table->string('posted_date');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('hrm_candidates', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('job_id')->nullable();
            $table->string('stage')->default('Applied');
            $table->string('applied_date');
            $table->string('source')->default('LinkedIn');
            $table->integer('rating')->default(0);
            $table->text('notes')->nullable();
            $table->string('resume_url')->nullable();
            $table->timestamps();
        });

        Schema::create('hrm_onboardings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('candidate_id')->nullable();
            $table->string('name');
            $table->string('role');
            $table->string('start_date');
            $table->string('buddy')->nullable();
            $table->string('status')->default('Pending');
            $table->json('tasks')->nullable();
            $table->timestamps();
        });

        Schema::create('hrm_offer_letters', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('candidate_id')->nullable();
            $table->string('candidate_name');
            $table->string('candidate_email');
            $table->string('job_title');
            $table->string('department');
            $table->string('employment_type')->default('Full-time');
            $table->decimal('base_salary', 12, 2)->default(0);
            $table->decimal('bonus', 12, 2)->default(0);
            $table->text('benefits')->nullable();
            $table->string('start_date');
            $table->string('expiry_date');
            $table->string('reporting_manager')->nullable();
            $table->string('template')->default('Standard');
            $table->text('custom_clauses')->nullable();
            $table->string('status')->default('Draft');
            $table->string('issued_date')->nullable();
            $table->string('sent_date')->nullable();
            $table->string('responded_date')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_offer_letters');
        Schema::dropIfExists('hrm_onboardings');
        Schema::dropIfExists('hrm_candidates');
        Schema::dropIfExists('hrm_job_openings');
    }
};
