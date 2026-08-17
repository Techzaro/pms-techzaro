<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_files', function (Blueprint $table) {
            if (!Schema::hasColumn('project_files', 'sort_order')) {
                $table->integer('sort_order')->default(0)->after('url');
            }
        });

        DB::statement('UPDATE project_files SET sort_order = id WHERE sort_order = 0');
    }

    public function down(): void
    {
        Schema::table('project_files', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
    }
};
