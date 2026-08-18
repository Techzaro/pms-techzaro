<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('hrm_application_fields')) {
            Schema::create('hrm_application_fields', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id')->nullable()->index();
                $table->foreignId('application_type_id')->constrained('hrm_application_types')->cascadeOnDelete();
                $table->string('field_label');
                $table->string('field_name');
                $table->string('field_type');
                $table->boolean('is_required')->default(false);
                $table->string('validation_rules')->nullable();
                $table->json('options')->nullable();
                $table->integer('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('hrm_workflows') && !Schema::hasTable('hrm_workflow_application_types')) {
            Schema::create('hrm_workflow_application_types', function (Blueprint $table) {
                $table->id();
                $table->foreignId('hrm_workflow_id')->constrained('hrm_workflows')->cascadeOnDelete();
                $table->unsignedBigInteger('application_type_id');
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_workflow_application_types');
        Schema::dropIfExists('hrm_application_fields');
    }
};
