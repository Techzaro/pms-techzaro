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
        if (Schema::hasTable('knowledge_bases')) {
            Schema::table('knowledge_bases', function (Blueprint $table) {
                if (!Schema::hasColumn('knowledge_bases', 'reference_link')) {
                    $table->string('reference_link', 2048)->nullable()->after('file_name');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('knowledge_bases')) {
            Schema::table('knowledge_bases', function (Blueprint $table) {
                if (Schema::hasColumn('knowledge_bases', 'reference_link')) {
                    $table->dropColumn('reference_link');
                }
            });
        }
    }
};
