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
        Schema::dropIfExists('hrm_approval_workflows');

        Schema::create('hrm_workflows', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('department');
            $table->timestamps();
        });

        Schema::create('hrm_workflow_application_types', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hrm_workflow_id');
            $table->unsignedBigInteger('application_type_id');
            $table->timestamps();

            $table->foreign('hrm_workflow_id')->references('id')->on('hrm_workflows')->onDelete('cascade');
        });

        Schema::create('hrm_workflow_steps', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hrm_workflow_id');
            $table->integer('step_order');
            $table->string('approver_type'); // Role, User
            $table->string('approver_id')->nullable(); 
            $table->timestamps();

            $table->foreign('hrm_workflow_id')->references('id')->on('hrm_workflows')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_workflow_steps');
        Schema::dropIfExists('hrm_workflow_application_types');
        Schema::dropIfExists('hrm_workflows');
    }
};
