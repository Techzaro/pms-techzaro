<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            if (!Schema::hasColumn('task_comments', 'deliverable_id')) {
                $table->foreignId('deliverable_id')->nullable()->constrained()->nullOnDelete();
                $table->index('deliverable_id');
                $table->index(['deliverable_id', 'created_at']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            $table->dropForeign(['deliverable_id']);
            $table->dropIndex(['deliverable_id', 'created_at']);
            $table->dropIndex('deliverable_id');
            $table->dropColumn('deliverable_id');
        });
    }
};
