<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deliverable_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->json('recurrence_settings')->nullable()->after('task_type');
            $table->string('recurrence_status')->default('active')->after('recurrence_settings');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliverable_templates');

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['recurrence_settings', 'recurrence_status']);
        });
    }
};
