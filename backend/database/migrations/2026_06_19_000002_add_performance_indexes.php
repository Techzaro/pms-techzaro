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
        $idxName = $name ?? implode('_', [$table, ...$columns, 'index']);
        if (!$this->hasIndex($table, $idxName)) {
            Schema::table($table, function (Blueprint $t) use ($columns, $idxName) {
                $t->index($columns, $idxName);
            });
        }
    }

    public function up(): void
    {
        $this->addIndexIfMissing('tasks', ['status']);
        $this->addIndexIfMissing('tasks', ['assigned_to']);
        $this->addIndexIfMissing('tasks', ['assigned_by']);
        $this->addIndexIfMissing('tasks', ['project_id']);
        $this->addIndexIfMissing('tasks', ['end_date', 'status']);
        $this->addIndexIfMissing('tasks', ['assigned_by', 'status']);

        $this->addIndexIfMissing('projects', ['status']);
        $this->addIndexIfMissing('projects', ['created_by']);
        $this->addIndexIfMissing('projects', ['team_id']);
        $this->addIndexIfMissing('projects', ['end_date', 'status']);

        $this->addIndexIfMissing('deliverables', ['status']);
        $this->addIndexIfMissing('deliverables', ['assigned_to']);
        $this->addIndexIfMissing('deliverables', ['created_by']);
        $this->addIndexIfMissing('deliverables', ['project_id']);
        $this->addIndexIfMissing('deliverables', ['task_id']);
        $this->addIndexIfMissing('deliverables', ['due_date']);

        $this->addIndexIfMissing('deliverable_submissions', ['deliverable_id']);
        $this->addIndexIfMissing('deliverable_submissions', ['submitted_by']);

        $this->addIndexIfMissing('task_submissions', ['task_id']);
        $this->addIndexIfMissing('task_submissions', ['submitted_by']);

        $this->addIndexIfMissing('project_submissions', ['project_id']);
        $this->addIndexIfMissing('project_submissions', ['submitted_by']);

        $this->addIndexIfMissing('task_workflow_events', ['task_id', 'action', 'created_at'], 'idx_twe_task_action_created');
        $this->addIndexIfMissing('project_workflow_events', ['project_id', 'action', 'created_at'], 'idx_pwe_project_action_created');
        $this->addIndexIfMissing('deliverable_workflow_events', ['deliverable_id', 'event_type', 'created_at'], 'idx_dwe_dlv_event_type_created');

        $this->addIndexIfMissing('notifications', ['user_id', 'is_read', 'created_at'], 'idx_notif_user_read_created');
        $this->addIndexIfMissing('project_activities', ['project_id', 'created_at']);
        $this->addIndexIfMissing('task_user', ['task_id', 'user_id']);
        $this->addIndexIfMissing('team_user', ['team_id', 'user_id']);
        $this->addIndexIfMissing('project_visibility', ['project_id', 'user_id', 'is_visible'], 'idx_pvis_project_user_visible');

        $this->addIndexIfMissing('subtasks', ['task_id']);
        $this->addIndexIfMissing('subtasks', ['assigned_to']);
        $this->addIndexIfMissing('subtasks', ['status']);

        $this->addIndexIfMissing('task_changes', ['task_id', 'is_viewed']);
        $this->addIndexIfMissing('project_changes', ['project_id', 'is_viewed']);
        $this->addIndexIfMissing('deliverable_changes', ['deliverable_id', 'is_viewed']);
    }

    public function down(): void
    {
        // No-op: removing indexes is handled by fresh migrations
    }
};
