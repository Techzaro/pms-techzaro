<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_project_members', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shared_resource_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('added_by')->nullable();
            $table->timestamps();

            $table->unique(['shared_resource_id', 'user_id', 'organization_id']);
            $table->foreign('shared_resource_id')->references('id')->on('shared_resources')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_project_members');
    }
};
