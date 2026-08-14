<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'allow_transfer')) {
                $table->boolean('allow_transfer')->default(true);
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'allow_transfer')) {
                $table->boolean('allow_transfer')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('allow_transfer');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn('allow_transfer');
        });
    }
};
