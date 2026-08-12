<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deliverable_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deliverable_id')->constrained()->cascadeOnDelete();
            $table->string('field_name', 64);
            $table->text('old_value')->nullable();
            $table->text('new_value')->nullable();
            $table->foreignId('modified_by')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_viewed')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliverable_changes');
    }
};
