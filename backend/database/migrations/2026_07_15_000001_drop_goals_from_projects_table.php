<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'goals')) {
                $table->dropColumn('goals');
            }
            if (Schema::hasColumn('projects', 'goals_checklist')) {
                $table->dropColumn('goals_checklist');
            }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->longText('goals')->nullable()->after('description');
            $table->json('goals_checklist')->nullable()->after('goals');
        });
    }
};
