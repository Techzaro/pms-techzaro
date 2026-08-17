<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_milestones', function (Blueprint $table) {
            if (!Schema::hasColumn('project_milestones', 'description')) {
                $table->text('description')->nullable()->after('title');
            }
            if (!Schema::hasColumn('project_milestones', 'owner_id')) {
                $table->foreignId('owner_id')->nullable()->after('description')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('project_milestones', 'completed_at')) {
                $table->dateTime('completed_at')->nullable()->after('owner_id');
            }
            if (!Schema::hasColumn('project_milestones', 'progress')) {
                $table->tinyInteger('progress')->default(0)->after('completed_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('project_milestones', function (Blueprint $table) {
            foreach (['progress', 'completed_at', 'owner_id', 'description'] as $col) {
                if (Schema::hasColumn('project_milestones', $col)) {
                    if ($col === 'owner_id') {
                        $table->dropForeign(['owner_id']);
                    }
                    $table->dropColumn($col);
                }
            }
        });
    }
};
