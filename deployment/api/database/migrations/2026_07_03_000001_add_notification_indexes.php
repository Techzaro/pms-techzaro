<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function hasIndex(string $table, string $index): bool
    {
        $indexes = DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$index]);
        return count($indexes) > 0;
    }

    private function addIndexIfMissing(string $table, array $columns, ?string $name = null): void
    {
        $idxName = $name ?? (implode('_', [$table, ...$columns, 'index']));
        if (!$this->hasIndex($table, $idxName)) {
            Schema::table($table, function (Blueprint $t) use ($columns, $idxName) {
                $t->index($columns, $idxName);
            });
        }
    }

    public function up(): void
    {
        // notifications — composite indexes for hot queries
        $this->addIndexIfMissing('notifications', ['user_id', 'created_at'], 'idx_notif_user_created');
        $this->addIndexIfMissing('notifications', ['user_id', 'is_read'], 'idx_notif_user_read');
        $this->addIndexIfMissing('notifications', ['type', 'related_module', 'related_id', 'user_id'], 'idx_notif_dedup');

        // task_user — pivot table for task assignees (reverse lookup)
        $this->addIndexIfMissing('task_user', ['task_id'], 'idx_task_user_task_id');

        // task_workflow_events — task_id lookups
        $this->addIndexIfMissing('task_workflow_events', ['task_id'], 'idx_twe_task_id');
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $t) {
            if ($this->hasIndex('notifications', 'idx_notif_user_created')) $t->dropIndex('idx_notif_user_created');
            if ($this->hasIndex('notifications', 'idx_notif_user_read')) $t->dropIndex('idx_notif_user_read');
            if ($this->hasIndex('notifications', 'idx_notif_dedup')) $t->dropIndex('idx_notif_dedup');
        });
        Schema::table('task_user', function (Blueprint $t) {
            if ($this->hasIndex('task_user', 'idx_task_user_task_id')) $t->dropIndex('idx_task_user_task_id');
        });
        Schema::table('task_workflow_events', function (Blueprint $t) {
            if ($this->hasIndex('task_workflow_events', 'idx_twe_task_id')) $t->dropIndex('idx_twe_task_id');
        });
    }
};
