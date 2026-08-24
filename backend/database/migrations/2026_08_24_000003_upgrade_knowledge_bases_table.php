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
        Schema::table('knowledge_bases', function (Blueprint $table) {
            if (!Schema::hasColumn('knowledge_bases', 'slug')) {
                $table->string('slug')->nullable()->after('title');
            }
            if (!Schema::hasColumn('knowledge_bases', 'category_id')) {
                $table->unsignedBigInteger('category_id')->nullable()->after('category');
            }
            if (!Schema::hasColumn('knowledge_bases', 'status')) {
                $table->string('status', 32)->default('published')->after('visibility_level');
            }
            if (!Schema::hasColumn('knowledge_bases', 'is_pinned')) {
                $table->boolean('is_pinned')->default(false);
            }
            if (!Schema::hasColumn('knowledge_bases', 'views_count')) {
                $table->unsignedBigInteger('views_count')->default(0);
            }
            if (!Schema::hasColumn('knowledge_bases', 'tags')) {
                $table->json('tags')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('knowledge_bases', function (Blueprint $table) {
            if (Schema::hasColumn('knowledge_bases', 'tags')) {
                $table->dropColumn('tags');
            }
            if (Schema::hasColumn('knowledge_bases', 'views_count')) {
                $table->dropColumn('views_count');
            }
            if (Schema::hasColumn('knowledge_bases', 'is_pinned')) {
                $table->dropColumn('is_pinned');
            }
            if (Schema::hasColumn('knowledge_bases', 'status')) {
                $table->dropColumn('status');
            }
            if (Schema::hasColumn('knowledge_bases', 'category_id')) {
                $table->dropColumn('category_id');
            }
            if (Schema::hasColumn('knowledge_bases', 'slug')) {
                $table->dropColumn('slug');
            }
        });
    }
};
