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
        Schema::table('conversations', function (Blueprint $table) {
            if (!Schema::hasColumn('conversations', 'task_id')) {
                $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            }
            if (!Schema::hasColumn('conversations', 'deliverable_id')) {
                $table->foreignId('deliverable_id')->nullable()->constrained()->nullOnDelete();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign(['task_id']);
            $table->dropColumn('task_id');
            $table->dropForeign(['deliverable_id']);
            $table->dropColumn('deliverable_id');
        });
    }
};
