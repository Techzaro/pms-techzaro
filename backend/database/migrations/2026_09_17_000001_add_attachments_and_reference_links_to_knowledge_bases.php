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
                if (!Schema::hasColumn('knowledge_bases', 'attachments')) {
                    $table->json('attachments')->nullable()->after('file_name');
                }
                if (!Schema::hasColumn('knowledge_bases', 'reference_links')) {
                    $table->json('reference_links')->nullable()->after('reference_link');
                }
            });
        }

        if (Schema::hasTable('kb_versions')) {
            Schema::table('kb_versions', function (Blueprint $table) {
                if (!Schema::hasColumn('kb_versions', 'attachments')) {
                    $table->json('attachments')->nullable()->after('file_name');
                }
                if (!Schema::hasColumn('kb_versions', 'reference_link')) {
                    $table->string('reference_link', 2048)->nullable()->after('file_name');
                }
                if (!Schema::hasColumn('kb_versions', 'reference_links')) {
                    $table->json('reference_links')->nullable()->after('reference_link');
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
                if (Schema::hasColumn('knowledge_bases', 'attachments')) {
                    $table->dropColumn('attachments');
                }
                if (Schema::hasColumn('knowledge_bases', 'reference_links')) {
                    $table->dropColumn('reference_links');
                }
            });
        }

        if (Schema::hasTable('kb_versions')) {
            Schema::table('kb_versions', function (Blueprint $table) {
                if (Schema::hasColumn('kb_versions', 'attachments')) {
                    $table->dropColumn('attachments');
                }
                if (Schema::hasColumn('kb_versions', 'reference_links')) {
                    $table->dropColumn('reference_links');
                }
            });
        }
    }
};
