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
        if (! Schema::hasColumn('tasks', 'has_edited_submission')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->boolean('has_edited_submission')->default(false)->after('status');
            });
        }
        if (! Schema::hasColumn('deliverables', 'has_edited_submission')) {
            Schema::table('deliverables', function (Blueprint $table) {
                $table->boolean('has_edited_submission')->default(false)->after('status');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('tasks', 'has_edited_submission')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->dropColumn('has_edited_submission');
            });
        }
        if (Schema::hasColumn('deliverables', 'has_edited_submission')) {
            Schema::table('deliverables', function (Blueprint $table) {
                $table->dropColumn('has_edited_submission');
            });
        }
    }
};
