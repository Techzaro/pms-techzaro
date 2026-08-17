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
        if (!Schema::hasTable('projects')) {
            Schema::create('projects', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->longText('description')->nullable();
                $table->longText('goals')->nullable();
                $table->longText('sheets_documents')->nullable();
                $table->string('website_name')->nullable();
                $table->string('website_link')->nullable();
                $table->unsignedBigInteger('team_id')->nullable();
                $table->json('assigned_users')->nullable();
                $table->string('status')->default('Planned');
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();
                $table->unsignedBigInteger('created_by');
                $table->timestamps();

                $table->foreign('team_id')->references('id')->on('teams')->onDelete('set null');
                $table->foreign('created_by')->references('id')->on('users')->onDelete('cascade');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
