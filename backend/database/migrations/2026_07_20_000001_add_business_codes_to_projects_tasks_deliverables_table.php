<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('project_code', 20)->nullable()->after('id');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->string('task_code', 30)->nullable()->after('id');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->string('subtask_code', 40)->nullable()->after('id');
        });

        // Backfill existing records with sequential business codes
        $projects = DB::table('projects')->orderBy('id')->get();
        foreach ($projects as $index => $project) {
            DB::table('projects')->where('id', $project->id)->update([
                'project_code' => 'PRJ-' . ($index + 1),
            ]);
        }

        // Backfill tasks with sequential numbers per project
        $tasks = DB::table('tasks')->orderBy('id')->get();
        $taskCounters = [];
        foreach ($tasks as $task) {
            $projectId = $task->project_id;
            if ($projectId) {
                if (!isset($taskCounters[$projectId])) {
                    $taskCounters[$projectId] = 0;
                }
                $taskCounters[$projectId]++;
                $projectCode = DB::table('projects')->where('id', $projectId)->value('project_code');
                $projectNumber = $projectCode ? str_replace('PRJ-', '', $projectCode) : $projectId;
                DB::table('tasks')->where('id', $task->id)->update([
                    'task_code' => 'TSK-' . $projectNumber . '.' . $taskCounters[$projectId],
                ]);
            } else {
                // Standalone tasks get a simple sequential code
                $taskNumber = $task->id;
                DB::table('tasks')->where('id', $task->id)->update([
                    'task_code' => 'TSK-' . $taskNumber,
                ]);
            }
        }

        // Backfill deliverables with sequential numbers per task
        $deliverables = DB::table('deliverables')->orderBy('id')->get();
        $dlvCounters = [];
        foreach ($deliverables as $dlv) {
            $taskId = $dlv->task_id;
            if ($taskId) {
                if (!isset($dlvCounters[$taskId])) {
                    $dlvCounters[$taskId] = 0;
                }
                $dlvCounters[$taskId]++;
                $task = DB::table('tasks')->where('id', $taskId)->first();
                DB::table('deliverables')->where('id', $dlv->id)->update([
                    'subtask_code' => $task->task_code . '.' . $dlvCounters[$taskId],
                ]);
            } else {
                // Project-level deliverables without task
                $projectId = $dlv->project_id;
                $projectCode = DB::table('projects')->where('id', $projectId)->value('project_code');
                $projectNumber = $projectCode ? str_replace('PRJ-', '', $projectCode) : $projectId;
                DB::table('deliverables')->where('id', $dlv->id)->update([
                    'subtask_code' => 'SUB-' . $projectNumber . '.' . $dlv->id,
                ]);
            }
        }

        // Add unique indexes
        Schema::table('projects', function (Blueprint $table) {
            $table->unique('project_code');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unique('task_code');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->unique('subtask_code');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['project_code']);
            $table->dropColumn('project_code');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['task_code']);
            $table->dropColumn('task_code');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropIndex(['subtask_code']);
            $table->dropColumn('subtask_code');
        });
    }
};
