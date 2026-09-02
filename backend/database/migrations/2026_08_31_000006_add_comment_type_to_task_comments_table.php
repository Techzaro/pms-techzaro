<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            if (!Schema::hasColumn('task_comments', 'comment_type')) {
                $table->string('comment_type', 20)->default('internal')->after('body')->comment('internal, external');
            }
            if (!Schema::hasColumn('task_comments', 'visible_to_organizations')) {
                $table->json('visible_to_organizations')->nullable()->after('comment_type')->comment('Array of org IDs that can see this comment');
            }
        });
    }

    public function down(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            if (Schema::hasColumn('task_comments', 'visible_to_organizations')) {
                $table->dropColumn('visible_to_organizations');
            }
            if (Schema::hasColumn('task_comments', 'comment_type')) {
                $table->dropColumn('comment_type');
            }
        });
    }
};
