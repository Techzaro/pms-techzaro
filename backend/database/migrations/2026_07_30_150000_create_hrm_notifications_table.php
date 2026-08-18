<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hrm_notifications', function (Blueprint $table) {
            $table->id();
            $table->string('type')->default('info');
            $table->string('candidate_name')->nullable();
            $table->string('title');
            $table->text('message');
            $table->boolean('read')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_notifications');
    }
};
