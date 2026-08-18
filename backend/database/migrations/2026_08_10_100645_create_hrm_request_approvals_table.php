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
        Schema::create('hrm_request_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('request_id');
            $table->integer('step_order');
            $table->string('approver_type'); // Role, Manager, User
            $table->string('approver_id')->nullable(); 
            $table->string('status')->default('Pending'); // Pending, Approved, Rejected
            $table->text('comments')->nullable();
            $table->timestamp('actioned_at')->nullable();
            $table->timestamps();
            
            $table->foreign('request_id')->references('id')->on('hrm_member_requests')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hrm_request_approvals');
    }
};
