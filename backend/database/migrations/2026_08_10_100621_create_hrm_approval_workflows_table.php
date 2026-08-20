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
        Schema::create('hrm_approval_workflows', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('application_type_id')->nullable()->comment('Null means it applies to all types');
            $table->integer('step_order');
            $table->string('approver_type'); // Role, Manager, User
            $table->string('approver_id')->nullable(); // Either the role name or user ID
            $table->timestamps();

            // Note: Not adding hard foreign keys to keep it flexible based on multi-tenant logic
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_approval_workflows');
    }
};
