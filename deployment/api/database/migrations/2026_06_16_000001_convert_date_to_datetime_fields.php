<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dateTime('start_date')->nullable()->change();
            $table->dateTime('end_date')->nullable()->change();
            $table->dateTime('reopen_new_deadline')->nullable()->change();
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dateTime('due_date')->nullable()->change();
            $table->dateTime('reopen_new_deadline')->nullable()->change();
            $table->dateTime('rework_new_deadline')->nullable()->change();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dateTime('reopen_new_deadline')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->date('start_date')->nullable()->change();
            $table->date('end_date')->nullable()->change();
            $table->date('reopen_new_deadline')->nullable()->change();
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->date('due_date')->nullable()->change();
            $table->date('reopen_new_deadline')->nullable()->change();
            $table->date('rework_new_deadline')->nullable()->change();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->date('reopen_new_deadline')->nullable()->change();
        });
    }
};
