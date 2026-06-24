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
        // users — role & active are filtered on every page
        $this->addIndexIfMissing('users', ['role'], 'idx_users_role');
        $this->addIndexIfMissing('users', ['active'], 'idx_users_active');
        $this->addIndexIfMissing('users', ['sort_order', 'id'], 'idx_users_sort_order_id');

        // teams — leader_id has no FK index
        $this->addIndexIfMissing('teams', ['leader_id'], 'idx_teams_leader_id');
        $this->addIndexIfMissing('teams', ['created_by'], 'idx_teams_created_by');

        // events — used in date-range & global queries
        $this->addIndexIfMissing('events', ['is_global'], 'idx_events_is_global');
        $this->addIndexIfMissing('events', ['type'], 'idx_events_type');
        $this->addIndexIfMissing('events', ['start_date', 'end_date'], 'idx_events_dates');

        // pivot tables — user_id lookups
        $this->addIndexIfMissing('event_users', ['user_id'], 'idx_event_users_user_id');
        $this->addIndexIfMissing('task_user', ['user_id'], 'idx_task_user_user_id');

        // notifications — sender & type filters
        $this->addIndexIfMissing('notifications', ['sender_user_id'], 'idx_notif_sender');
        $this->addIndexIfMissing('notifications', ['type'], 'idx_notifications_type');
        $this->addIndexIfMissing('notifications', ['related_module', 'related_id'], 'idx_notif_related');

        // FK columns with no indexes
        $this->addIndexIfMissing('project_milestones', ['project_id'], 'idx_project_milestones_project_id');
        $this->addIndexIfMissing('task_files', ['task_id'], 'idx_task_files_task_id');
        $this->addIndexIfMissing('project_files', ['project_id'], 'idx_project_files_project_id');

        // workflow event user_id lookups
        $this->addIndexIfMissing('deliverable_workflow_events', ['user_id'], 'idx_dwe_user_id');
        $this->addIndexIfMissing('project_workflow_events', ['user_id'], 'idx_pwe_user_id');

        // project_activities user joins
        $this->addIndexIfMissing('project_activities', ['user_id'], 'idx_project_activities_user_id');

        // subtasks assigned_by
        $this->addIndexIfMissing('subtasks', ['assigned_by'], 'idx_subtasks_assigned_by');

        // task workflow users
        $this->addIndexIfMissing('tasks', ['approved_by'], 'idx_tasks_approved_by');
        $this->addIndexIfMissing('tasks', ['rejected_by'], 'idx_tasks_rejected_by');
        $this->addIndexIfMissing('tasks', ['reopened_by'], 'idx_tasks_reopened_by');

        // deliverable workflow users
        $this->addIndexIfMissing('deliverables', ['approved_by'], 'idx_deliverables_approved_by');
        $this->addIndexIfMissing('deliverables', ['rejected_by'], 'idx_deliverables_rejected_by');
        $this->addIndexIfMissing('deliverables', ['reopened_by'], 'idx_deliverables_reopened_by');
    }

    public function down(): void
    {
        // No-op: handled by fresh migrations
    }
};
