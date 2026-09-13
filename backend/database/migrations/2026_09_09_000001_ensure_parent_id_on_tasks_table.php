<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('tasks', 'parent_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->unsignedBigInteger('parent_id')->nullable()->after('project_id')->index();
                $table->foreign('parent_id')->references('id')->on('tasks')->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('tasks', 'parent_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->dropForeign(['parent_id']);
                $table->dropColumn('parent_id');
            });
        }
    }
};
