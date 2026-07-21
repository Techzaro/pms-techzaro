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
