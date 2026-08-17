<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->json('team_ids')->nullable()->after('team_id');
        });

        DB::table('projects')
            ->whereNotNull('team_id')
            ->update(['team_ids' => DB::raw('JSON_ARRAY(team_id)')]);
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('team_ids');
        });
    }
};
