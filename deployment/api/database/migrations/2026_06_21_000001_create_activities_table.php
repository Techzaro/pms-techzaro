<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('activity_type');
            $table->string('related_module')->nullable();
            $table->unsignedBigInteger('related_id')->nullable();
            $table->text('description');
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['related_module', 'related_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
