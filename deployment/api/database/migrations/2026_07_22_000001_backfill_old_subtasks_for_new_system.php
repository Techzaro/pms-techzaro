<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Services\BusinessIdService;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Backfill project_id from parent task for old subtasks that have task_id but no project_id
        $subtasksWithTask = DB::table('deliverables')
            ->whereNotNull('task_id')
            ->whereNull('project_id')
            ->get();

        foreach ($subtasksWithTask as $subtask) {
            $taskProjectId = DB::table('tasks')->where('id', $subtask->task_id)->value('project_id');
            if ($taskProjectId) {
                DB::table('deliverables')
                    ->where('id', $subtask->id)
                    ->update(['project_id' => $taskProjectId]);
            }
        }

        // 2. Backfill project_id for subtasks that have no task_id and no project_id
        // These are orphan deliverables — leave project_id null (they're standalone)

        // 3. Backfill business_id for old subtasks that don't have one
        // Use the BusinessIdService to generate proper format
        $service = app(BusinessIdService::class);

        $subtasksWithoutBusinessId = DB::table('deliverables')
            ->whereNull('business_id')
            ->get();

        foreach ($subtasksWithoutBusinessId as $subtask) {
            $task = null;
            if ($subtask->task_id) {
                $task = \App\Models\Task::find($subtask->task_id);
            }

            if ($task) {
                $bizId = $service->generateSubtaskBusinessId($task);
            } elseif ($subtask->project_id) {
                $project = \App\Models\Project::find($subtask->project_id);
                $bizId = $project
                    ? $service->generateProjectDeliverableBusinessId($project, $subtask->id)
                    : 'SUB-' . $subtask->id;
            } else {
                $bizId = 'SUB-' . $subtask->id;
            }

            $parts = explode('.', $bizId);
            DB::table('deliverables')
                ->where('id', $subtask->id)
                ->update([
                    'business_id' => $bizId,
                    'subtask_number' => (int) end($parts),
                ]);
        }

        // 4. Ensure all old subtasks have created_by set (fall back to task creator if null)
        $subtasksWithoutCreator = DB::table('deliverables')
            ->whereNull('created_by')
            ->get();

        foreach ($subtasksWithoutCreator as $subtask) {
            $taskCreator = null;
            if ($subtask->task_id) {
                $taskCreator = DB::table('tasks')->where('id', $subtask->task_id)->value('created_by');
            }
            if ($taskCreator) {
                DB::table('deliverables')
                    ->where('id', $subtask->id)
                    ->update([
                        'created_by' => $taskCreator,
                        'updated_by' => $subtask->updated_by ?? $taskCreator,
                    ]);
            }
        }
    }

    public function down(): void
    {
        // This is a data migration — no schema changes to revert.
        // business_id and project_id backfills are non-destructive.
    }
};
