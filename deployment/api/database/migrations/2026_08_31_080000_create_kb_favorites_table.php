<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('kb_favorites')) {
            Schema::create('kb_favorites', function (Blueprint $table) {
                $table->id();
                $table->foreignId('knowledge_base_id')->constrained('knowledge_bases')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['knowledge_base_id', 'user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('kb_favorites');
    }
};
