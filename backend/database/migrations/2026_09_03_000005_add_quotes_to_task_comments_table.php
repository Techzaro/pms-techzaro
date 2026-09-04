<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('task_comments')) {
            Schema::table('task_comments', function (Blueprint $table) {
                if (!Schema::hasColumn('task_comments', 'quoted_message_id')) {
                    $table->foreignId('quoted_message_id')->nullable()->after('parent_id')->constrained('task_comments')->nullOnDelete();
                }
                if (!Schema::hasColumn('task_comments', 'quoted_text')) {
                    $table->text('quoted_text')->nullable()->after('quoted_message_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('task_comments')) {
            Schema::table('task_comments', function (Blueprint $table) {
                if (Schema::hasColumn('task_comments', 'quoted_message_id')) {
                    $table->dropForeign(['quoted_message_id']);
                    $table->dropColumn('quoted_message_id');
                }
                if (Schema::hasColumn('task_comments', 'quoted_text')) {
                    $table->dropColumn('quoted_text');
                }
            });
        }
    }
};
