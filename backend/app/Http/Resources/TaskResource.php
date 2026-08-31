<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Full API resource for Task models.
 *
 * Includes all task fields, related resources (project, assignees,
 * deliverables, submissions, workflow events), and loaded relationships.
 */
class TaskResource extends JsonResource
{
    /**
     * Transform the task into a complete array representation.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array
     */
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'business_id' => $this->business_id ?? 'TSK-' . $this->id,
            'project_id' => $this->project_id,
            'title' => $this->title,
            'description' => $this->description,
            'requirements' => $this->requirements,
            'status' => $this->status,
            'priority' => $this->priority,
            'kb_ids' => $this->kb_ids ?? [],
            'event_ids' => $this->event_ids ?? [],
            'start_date' => $this->start_date?->format('Y-m-d\TH:i:s'),
            'end_date' => $this->end_date?->format('Y-m-d\TH:i:s'),
            'assigned_to' => $this->assigned_to,
            'assigned_by' => $this->assigned_by,
            'sort_order' => $this->sort_order,
            'submitted_at' => $this->submitted_at?->format('Y-m-d\TH:i:s'),
            'approved_at' => $this->approved_at?->format('Y-m-d\TH:i:s'),
            'rejected_at' => $this->rejected_at?->format('Y-m-d\TH:i:s'),
            'rejection_comment' => $this->rejection_comment,
            'reopened_at' => $this->reopened_at?->format('Y-m-d\TH:i:s'),
            'reopen_comment' => $this->reopen_comment,
            'reopen_instructions' => $this->reopen_instructions,
            'reopen_new_deadline' => $this->reopen_new_deadline?->format('Y-m-d\TH:i:s'),
            'created_at' => $this->created_at?->format('Y-m-d\TH:i:s'),
            'updated_at' => $this->updated_at?->format('Y-m-d\TH:i:s'),
            'project' => ProjectMinResource::make($this->whenLoaded('project')),
            'assignees' => UserMinResource::collection($this->whenLoaded('assignees')),
            'assigner' => UserMinResource::make($this->whenLoaded('assigner')),
            'files' => $this->whenLoaded('files'),
            'submissions' => $this->whenLoaded('submissions'),
            'latest_submission' => SubmissionResource::make($this->whenLoaded('latestSubmission')),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'approved_by' => UserMinResource::make($this->whenLoaded('approvedBy')),
            'rejected_by' => UserMinResource::make($this->whenLoaded('rejectedBy')),
            'reopened_by' => UserMinResource::make($this->whenLoaded('reopenedBy')),
            'unviewed_changes' => $this->whenLoaded('unviewedChanges'),
            'deliverables' => DeliverableResource::collection($this->whenLoaded('deliverables')),
            'timer' => [
                'state' => $this->timer_state ?? 'idle',
                'total_work_seconds' => $this->total_work_seconds ?? 0,
                'formatted' => \App\Models\Task::formatDuration($this->total_work_seconds ?? 0),
                'work_started_at' => $this->work_started_at?->format('Y-m-d\TH:i:s'),
                'work_completed_at' => $this->work_completed_at?->format('Y-m-d\TH:i:s'),
            ],
        ];
    }
}
