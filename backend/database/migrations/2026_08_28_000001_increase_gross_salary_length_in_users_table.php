<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'gross_salary')) {
                $table->string('gross_salary', 1000)->nullable()->change();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('gross_salary', 255)->nullable()->change();
        });
    }
};
