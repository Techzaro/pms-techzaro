<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use App\Models\Deliverable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

/**
 * Service for generating hierarchical Business IDs for Projects, Tasks, and Deliverables.
 *
 * Format:
 *   Projects:   {Initials}-{Number}         (e.g., PMS-1)
 *   Tasks:      {Initials}-{Number}.{TaskN}  (e.g., PMS-1.2)
 *   Deliverables: {Initials}-{Number}.{TaskN}.{SubN} (e.g., PMS-1.2.3)
 *
 * IDs are immutable, unique, and never reused once generated.
 */
class BusinessIdService
{
    /**
     * Generate project initials from title.
     * - Multiple words: first letter of each word (e.g., "Project Management System" → "PMS")
     * - Single word: first 3 letters (e.g., "Marketing" → "MAR")
     */
    public function generateProjectInitials(string $title): string
    {
        $words = preg_split('/[\s_\-]+/', trim($title));
        $words = array_filter($words);

        if (count($words) === 1) {
            return strtoupper(substr($words[0], 0, 3));
        }

        return strtoupper(collect($words)->map(fn ($w) => $w[0])->implode(''));
    }

    /**
     * Get or create a project code (initials) and sequence number.
     * Returns ['code' => 'PMS', 'number' => 1, 'business_id' => 'PMS-1']
     */
    public function generateProjectBusinessId(Project $project): array
    {
        $initials = $this->generateProjectInitials($project->title);

        $number = DB::transaction(function () use ($initials) {
            $maxNumber = DB::table('projects')
                ->where('project_code', $initials)
                ->max('project_number');

            return ($maxNumber ?? 0) + 1;
        });

        $businessId = $initials . '-' . $number;

        return [
            'code'        => $initials,
            'number'      => $number,
            'business_id' => $businessId,
        ];
    }

    /**
     * Generate the next task business_id for a project.
     * Format: {ProjectCode}-{ProjectNumber}.{TaskNumber}
     * Task number resets per project.
     */
    public function generateTaskBusinessId(Project $project): string
    {
        $projectCode = $project->project_code;
        $projectNumber = $project->project_number;

        $nextTaskNumber = DB::transaction(function () use ($project) {
            $maxNumber = DB::table('tasks')
                ->where('project_id', $project->id)
                ->max('task_number');

            return ($maxNumber ?? 0) + 1;
        });

        return $projectCode . '-' . $projectNumber . '.' . $nextTaskNumber;
    }

    /**
     * Generate the next subtask business_id for a task.
     * Format: {ProjectCode}-{ProjectNumber}.{TaskNumber}.{SubtaskNumber}
     * Subtask number resets per task.
     */
    public function generateSubtaskBusinessId(Task $task): string
    {
        $taskBusinessId = $task->business_id;

        $nextSubtaskNumber = DB::transaction(function () use ($task) {
            $maxNumber = DB::table('deliverables')
                ->where('task_id', $task->id)
                ->max('subtask_number');

            return ($maxNumber ?? 0) + 1;
        });

        return $taskBusinessId . '.' . $nextSubtaskNumber;
    }

    /**
     * Generate a project-level deliverable business_id (no parent task).
     * Format: {ProjectBusinessId}.{DeliverableId}
     */
    public function generateProjectDeliverableBusinessId(Project $project, int $deliverableId): string
    {
        return $project->business_id . '.' . $deliverableId;
    }

    /**
     * Parse a business_id to extract hierarchy info.
     * Returns ['project_code', 'project_number', 'task_number', 'subtask_number'] or null.
     */
    public static function parseBusinessId(string $businessId): ?array
    {
        // Subtask: PMS-1.2.3
        if (preg_match('/^([A-Z]+)-(\d+)\.(\d+)\.(\d+)$/', $businessId, $m)) {
            return [
                'project_code'    => $m[1],
                'project_number'  => (int) $m[2],
                'task_number'     => (int) $m[3],
                'subtask_number'  => (int) $m[4],
            ];
        }

        // Task: PMS-1.2
        if (preg_match('/^([A-Z]+)-(\d+)\.(\d+)$/', $businessId, $m)) {
            return [
                'project_code'   => $m[1],
                'project_number' => (int) $m[2],
                'task_number'    => (int) $m[3],
            ];
        }

        // Project: PMS-1
        if (preg_match('/^([A-Z]+)-(\d+)$/', $businessId, $m)) {
            return [
                'project_code'   => $m[1],
                'project_number' => (int) $m[2],
            ];
        }

        return null;
    }

    /**
     * Backfill missing business_ids for all projects, tasks, and deliverables.
     * Safe to run multiple times — only processes records with null business_id.
     *
     * @return array ['projects' => int, 'tasks' => int, 'deliverables' => int]
     */
    public function backfillMissingBusinessIds(): array
    {
        $projectsCount = 0;
        $tasksCount = 0;
        $deliverablesCount = 0;

        // ── Projects ──────────────────────────────────────────────
        $existingCodes = DB::table('projects')->whereNotNull('business_id')->pluck('project_code')->toArray();
        $missingProjects = DB::table('projects')->whereNull('business_id')->orderBy('id')->get();

        foreach ($missingProjects as $project) {
            $initials = $this->generateProjectInitials($project->title);
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
            $projectsCount++;
        }

        // ── Tasks ─────────────────────────────────────────────────
        $taskCounters = [];
        $missingTasks = DB::table('tasks')->whereNull('business_id')->orderBy('id')->get();

        foreach ($missingTasks as $task) {
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
                    $tasksCount++;
                    continue;
                }
            }
            DB::table('tasks')->where('id', $task->id)->update([
                'task_number' => $task->id,
                'business_id' => 'TASK-' . $task->id,
            ]);
            $tasksCount++;
        }

        // ── Deliverables ──────────────────────────────────────────
        $dlvCounters = [];
        $missingDlv = DB::table('deliverables')->whereNull('business_id')->orderBy('id')->get();

        foreach ($missingDlv as $dlv) {
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
                    $deliverablesCount++;
                    continue;
                }
            }
            $projectId = $dlv->project_id;
            if ($projectId) {
                $projBizId = DB::table('projects')->where('id', $projectId)->value('business_id');
                if ($projBizId) {
                    DB::table('deliverables')->where('id', $dlv->id)->update([
                        'subtask_number' => $dlv->id,
                        'business_id'    => $projBizId . '.' . $dlv->id,
                    ]);
                    $deliverablesCount++;
                    continue;
                }
            }
            DB::table('deliverables')->where('id', $dlv->id)->update([
                'subtask_number' => $dlv->id,
                'business_id'    => 'SUB-' . $dlv->id,
            ]);
            $deliverablesCount++;
        }

        return [
            'projects'     => $projectsCount,
            'tasks'        => $tasksCount,
            'deliverables' => $deliverablesCount,
        ];
    }

    /**
     * Generate the next draft code (DRF-{n}).
     */
    public function generateDraftCode(): string
    {
        $nextNumber = Cache::remember('business_id_draft_counter', 3600, function () {
            $maxCode = DB::table('drafts')
                ->whereNotNull('draft_code')
                ->orderByRaw("CAST(SUBSTRING(draft_code, 5) AS UNSIGNED) DESC")
                ->value('draft_code');

            if ($maxCode) {
                return (int) str_replace('DRF-', '', $maxCode) + 1;
            }

            return 1;
        });

        Cache::increment('business_id_draft_counter');

        return 'DRF-' . str_pad($nextNumber, 6, '0', STR_PAD_LEFT);
    }
}
