<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_email_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('task_notifications')->default(true);
            $table->boolean('deliverable_notifications')->default(true);
            $table->boolean('project_notifications')->default(true);
            $table->boolean('event_notifications')->default(true);
            $table->boolean('system_notifications')->default(true);
            $table->timestamps();

            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_email_preferences');
    }
};
