<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            if (Schema::hasColumn('teams', 'description')) {
                $table->dropColumn('description');
            }
        });
    }

    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            if (!Schema::hasColumn('teams', 'description')) {
                $table->text('description')->nullable()->after('name');
            }
        });
    }
};
