<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // ── Step 1: Add new columns ──────────────────────────────────
        Schema::table('projects', function (Blueprint $table) {
            $table->integer('project_number')->nullable()->after('project_code');
            $table->string('business_id', 30)->nullable()->after('project_number');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->integer('task_number')->nullable()->after('task_code');
            $table->string('business_id', 30)->nullable()->after('task_number');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->integer('subtask_number')->nullable()->after('subtask_code');
            $table->string('business_id', 40)->nullable()->after('subtask_number');
        });

        // ── Step 2: Generate project initials + numbers ──────────────
        $projects = DB::table('projects')->orderBy('id')->get();
        $initialsMap = [];

        foreach ($projects as $index => $project) {
            $number = $index + 1;
            $initials = $this->generateInitials($project->title);

            // Handle duplicate initials by appending number
            $baseInitials = $initials;
            $counter = 1;
            while (in_array($initials, $initialsMap)) {
                $counter++;
                $initials = $baseInitials . $counter;
            }
            $initialsMap[$project->id] = $initials;

            DB::table('projects')->where('id', $project->id)->update([
                'project_code'   => $initials,
                'project_number' => $number,
                'business_id'    => $initials . '-' . $number,
            ]);
        }

        // ── Step 3: Generate task numbers + business_ids ─────────────
        $tasks = DB::table('tasks')->orderBy('id')->get();
        $taskCounters = [];

        foreach ($tasks as $task) {
            $projectId = $task->project_id;

            if ($projectId && isset($initialsMap[$projectId])) {
                if (!isset($taskCounters[$projectId])) {
                    $taskCounters[$projectId] = 0;
                }
                $taskCounters[$projectId]++;

                $projectCode = $initialsMap[$projectId];
                $projectNumber = DB::table('projects')->where('id', $projectId)->value('project_number');
                $taskNumber = $taskCounters[$projectId];

                DB::table('tasks')->where('id', $task->id)->update([
                    'project_code' => $projectCode,
                    'task_number'  => $taskNumber,
                    'business_id'  => $projectCode . '-' . $projectNumber . '.' . $taskNumber,
                ]);
            } else {
                // Standalone task: STAND-{id}
                DB::table('tasks')->where('id', $task->id)->update([
                    'task_number' => $task->id,
                    'business_id' => 'TASK-' . $task->id,
                ]);
            }
        }

        // ── Step 4: Generate deliverable numbers + business_ids ──────
        $deliverables = DB::table('deliverables')->orderBy('id')->get();
        $dlvCounters = [];

        foreach ($deliverables as $dlv) {
            $taskId = $dlv->task_id;

            if ($taskId) {
                if (!isset($dlvCounters[$taskId])) {
                    $dlvCounters[$taskId] = 0;
                }
                $dlvCounters[$taskId]++;

                $taskBusinessId = DB::table('tasks')->where('id', $taskId)->value('business_id');
                $subtaskNumber = $dlvCounters[$taskId];

                DB::table('deliverables')->where('id', $dlv->id)->update([
                    'subtask_number' => $subtaskNumber,
                    'business_id'    => $taskBusinessId . '.' . $subtaskNumber,
                ]);
            } else {
                // Project-level deliverable
                $projectId = $dlv->project_id;
                if ($projectId) {
                    $projectBizId = DB::table('projects')->where('id', $projectId)->value('business_id');
                    DB::table('deliverables')->where('id', $dlv->id)->update([
                        'subtask_number' => $dlv->id,
                        'business_id'    => $projectBizId . '.' . $dlv->id,
                    ]);
                } else {
                    DB::table('deliverables')->where('id', $dlv->id)->update([
                        'subtask_number' => $dlv->id,
                        'business_id'    => 'SUB-' . $dlv->id,
                    ]);
                }
            }
        }

        // ── Step 5: Add unique indexes ──────────────────────────────
        Schema::table('projects', function (Blueprint $table) {
            $table->unique('business_id');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unique('business_id');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->unique('business_id');
        });

        // ── Step 6: Drop old indexes then old code columns ───────────
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['project_code']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['task_code']);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropIndex(['subtask_code']);
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('project_code');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('task_code');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn('subtask_code');
        });
    }

    public function down(): void
    {
        // Reverse: re-add old columns from business_id, then drop new columns
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['business_id']);
            $table->dropColumn(['business_id', 'project_number']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['business_id']);
            $table->dropColumn(['business_id', 'task_number']);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropIndex(['business_id']);
            $table->dropColumn(['business_id', 'subtask_number']);
        });
    }

    private function generateInitials(string $title): string
    {
        $words = preg_split('/[\s_\-]+/', trim($title));
        $words = array_filter($words);

        if (count($words) === 1) {
            return strtoupper(substr($words[0], 0, 3));
        }

        return strtoupper(collect($words)->map(fn($w) => $w[0])->implode(''));
    }
};
