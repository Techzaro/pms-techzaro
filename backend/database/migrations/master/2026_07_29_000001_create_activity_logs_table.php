<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('mysql_master')->create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('user')->nullable();
            $table->string('action');
            $table->string('target')->nullable();
            $table->string('ip')->nullable();
            $table->string('status')->default('success');
            $table->text('details')->nullable();
            $table->timestamps();

            $table->index('action');
            $table->index('status');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('activity_logs');
    }
};
