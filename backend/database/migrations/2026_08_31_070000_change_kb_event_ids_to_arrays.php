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
        foreach (['projects', 'tasks', 'deliverables'] as $tableName) {
            if (Schema::hasTable($tableName)) {
                Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                    if (Schema::hasColumn($tableName, 'kb_id')) {
                        $table->dropColumn('kb_id');
                    }
                    if (Schema::hasColumn($tableName, 'event_id')) {
                        $table->dropColumn('event_id');
                    }
                    if (!Schema::hasColumn($tableName, 'kb_ids')) {
                        $table->json('kb_ids')->nullable();
                    }
                    if (!Schema::hasColumn($tableName, 'event_ids')) {
                        $table->json('event_ids')->nullable();
                    }
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['projects', 'tasks', 'deliverables'] as $tableName) {
            if (Schema::hasTable($tableName)) {
                Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                    if (Schema::hasColumn($tableName, 'kb_ids')) {
                        $table->dropColumn('kb_ids');
                    }
                    if (Schema::hasColumn($tableName, 'event_ids')) {
                        $table->dropColumn('event_ids');
                    }
                    if (!Schema::hasColumn($tableName, 'kb_id')) {
                        $table->unsignedBigInteger('kb_id')->nullable();
                    }
                    if (!Schema::hasColumn($tableName, 'event_id')) {
                        $table->unsignedBigInteger('event_id')->nullable();
                    }
                });
            }
        }
    }
};
