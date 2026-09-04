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
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'parent_deliverable_id')) {
                $table->foreignId('parent_deliverable_id')
                    ->nullable()
                    ->after('task_id')
                    ->constrained('deliverables')
                    ->nullOnDelete();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            if (Schema::hasColumn('deliverables', 'parent_deliverable_id')) {
                $table->dropForeign(['parent_deliverable_id']);
                $table->dropColumn('parent_deliverable_id');
            }
        });
    }
};
