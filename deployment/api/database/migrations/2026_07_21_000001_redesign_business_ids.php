<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $schema = Schema::connection($this->getConnection());

        // ── Step 1: Add new columns (only if they don't exist) ───────
        if (!$schema->hasColumn('projects', 'project_number')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->integer('project_number')->nullable()->after('project_code');
            });
        }

        if (!$schema->hasColumn('projects', 'business_id')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->string('business_id', 30)->nullable()->after('project_number');
            });
        }

        if (!$schema->hasColumn('tasks', 'task_number')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->integer('task_number')->nullable()->after('task_code');
            });
        }

        if (!$schema->hasColumn('tasks', 'business_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->string('business_id', 30)->nullable()->after('task_number');
            });
        }

        if (!$schema->hasColumn('deliverables', 'subtask_number')) {
            Schema::table('deliverables', function (Blueprint $table) {
                $table->integer('subtask_number')->nullable()->after('subtask_code');
            });
        }

        if (!$schema->hasColumn('deliverables', 'business_id')) {
            Schema::table('deliverables', function (Blueprint $table) {
                $table->string('business_id', 40)->nullable()->after('subtask_number');
            });
        }

        // ── Step 2: Backfill projects ──────────────────────────────
        $projects = DB::table('projects')->whereNull('business_id')->orderBy('id')->get();
        $existingCodes = DB::table('projects')->whereNotNull('business_id')->pluck('project_code')->toArray();

        foreach ($projects as $project) {
            $initials = $this->generateInitials($project->title);
            $baseInitials = $initials;
            $counter = 1;
            while (in_array($initials, $existingCodes)) {
                $counter++;
                $initials = $baseInitials . $counter;
            }
            $existingCodes[] = $initials;

            $maxNumber = DB::table('projects')
                ->where('project_code', $initials)
                ->whereNotNull('project_number')
                ->max('project_number');
            $number = ($maxNumber ?? 0) + 1;

            DB::table('projects')->where('id', $project->id)->update([
                'project_code'   => $initials,
                'project_number' => $number,
                'business_id'    => $initials . '-' . $number,
            ]);
        }

        // Also handle projects that have project_code but no business_id (old data)
        $oldProjects = DB::table('projects')
            ->whereNull('business_id')
            ->whereNotNull('project_code')
            ->orderBy('id')
            ->get();

        foreach ($oldProjects as $project) {
            $initials = $this->generateInitials($project->title);
            $baseInitials = $initials;
            $counter = 1;
            while (in_array($initials, $existingCodes)) {
                $counter++;
                $initials = $baseInitials . $counter;
            }
            $existingCodes[] = $initials;

            $maxNumber = DB::table('projects')
                ->where('project_code', $initials)
                ->whereNotNull('project_number')
                ->max('project_number');
            $number = ($maxNumber ?? 0) + 1;

            DB::table('projects')->where('id', $project->id)->update([
                'project_code'   => $initials,
                'project_number' => $number,
                'business_id'    => $initials . '-' . $number,
            ]);
        }

        // ── Step 3: Backfill tasks ────────────────────────────────
        $tasks = DB::table('tasks')->whereNull('business_id')->orderBy('id')->get();
        $taskCounters = [];

        foreach ($tasks as $task) {
            $projectId = $task->project_id;
            if ($projectId) {
                $project = DB::table('projects')->where('id', $projectId)->first();
                if ($project && $project->project_code && $project->project_number) {
                    if (!isset($taskCounters[$projectId])) {
                        $taskCounters[$projectId] = DB::table('tasks')
                            ->where('project_id', $projectId)
                            ->whereNotNull('business_id')
                            ->max('task_number') ?? 0;
                    }
                    $taskCounters[$projectId]++;

                    DB::table('tasks')->where('id', $task->id)->update([
                        'task_number' => $taskCounters[$projectId],
                        'business_id' => $project->project_code . '-' . $project->project_number . '.' . $taskCounters[$projectId],
                    ]);
                    continue;
                }
            }
            // Standalone task
            DB::table('tasks')->where('id', $task->id)->update([
                'task_number' => $task->id,
                'business_id' => 'TASK-' . $task->id,
            ]);
        }

        // ── Step 4: Backfill deliverables ──────────────────────────
        $deliverables = DB::table('deliverables')->whereNull('business_id')->orderBy('id')->get();
        $dlvCounters = [];

        foreach ($deliverables as $dlv) {
            $taskId = $dlv->task_id;
            if ($taskId) {
                $taskBizId = DB::table('tasks')->where('id', $taskId)->value('business_id');
                if ($taskBizId) {
                    if (!isset($dlvCounters[$taskId])) {
                        $dlvCounters[$taskId] = DB::table('deliverables')
                            ->where('task_id', $taskId)
                            ->whereNotNull('business_id')
                            ->max('subtask_number') ?? 0;
                    }
                    $dlvCounters[$taskId]++;

                    DB::table('deliverables')->where('id', $dlv->id)->update([
                        'subtask_number' => $dlvCounters[$taskId],
                        'business_id'    => $taskBizId . '.' . $dlvCounters[$taskId],
                    ]);
                    continue;
                }
            }
            // Project-level or orphan
            $projectId = $dlv->project_id;
            if ($projectId) {
                $projBizId = DB::table('projects')->where('id', $projectId)->value('business_id');
                if ($projBizId) {
                    DB::table('deliverables')->where('id', $dlv->id)->update([
                        'subtask_number' => $dlv->id,
                        'business_id'    => $projBizId . '.' . $dlv->id,
                    ]);
                    continue;
                }
            }
            DB::table('deliverables')->where('id', $dlv->id)->update([
                'subtask_number' => $dlv->id,
                'business_id'    => 'SUB-' . $dlv->id,
            ]);
        }

        // ── Step 5: Add unique indexes (if not already present) ────
        $this->addUniqueIndexIfMissing($schema, 'projects', 'projects_business_id_unique', 'business_id');
        $this->addUniqueIndexIfMissing($schema, 'tasks', 'tasks_business_id_unique', 'business_id');
        $this->addUniqueIndexIfMissing($schema, 'deliverables', 'deliverables_business_id_unique', 'business_id');

        // ── Step 6: Drop old columns if they exist ─────────────────
        if ($schema->hasColumn('tasks', 'task_code')) {
            try { $schema->table('tasks', fn(Blueprint $t) => $t->dropUnique(['task_code'])); } catch (\Exception $e) {}
            $schema->table('tasks', fn(Blueprint $t) => $t->dropColumn('task_code'));
        }

        if ($schema->hasColumn('deliverables', 'subtask_code')) {
            try { $schema->table('deliverables', fn(Blueprint $t) => $t->dropUnique(['subtask_code'])); } catch (\Exception $e) {}
            $schema->table('deliverables', fn(Blueprint $t) => $t->dropColumn('subtask_code'));
        }

        // project_code stays — it holds the initials now (e.g., PMS)
        // But drop the unique index on it if it was added by old migration
        if ($schema->hasColumn('projects', 'project_code')) {
            try { $schema->table('projects', fn(Blueprint $t) => $t->dropUnique(['project_code'])); } catch (\Exception $e) {}
        }
    }

    public function down(): void
    {
        // Not reversible — data loss risk
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

    private function addUniqueIndexIfMissing($schema, string $table, string $indexName, string $column): void
    {
        if (!$schema->hasIndex($table, $indexName)) {
            try {
                Schema::table($table, function (Blueprint $t) use ($column) {
                    $t->unique($column);
                });
            } catch (\Exception $e) {
                // Index may already exist or data may have duplicates — skip silently
            }
        }
    }
};
