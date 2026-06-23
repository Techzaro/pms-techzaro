<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class DeliverableResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'task_id' => $this->task_id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'priority' => $this->priority,
            'due_date' => $this->due_date?->format('Y-m-d\TH:i:s'),
            'assigned_to' => $this->assigned_to,
            'created_by' => $this->created_by,
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
            'assignee' => UserMinResource::make($this->whenLoaded('assignee')),
            'creator' => UserMinResource::make($this->whenLoaded('creator')),
            'task' => $this->whenLoaded('task', fn () => ['id' => $this->task->id, 'title' => $this->task->title]),
            'submissions' => $this->whenLoaded('submissions'),
            'latest_submission' => SubmissionResource::make($this->whenLoaded('latestSubmission')),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'approved_by' => UserMinResource::make($this->whenLoaded('approvedBy')),
            'rejected_by' => UserMinResource::make($this->whenLoaded('rejectedBy')),
            'reopened_by' => UserMinResource::make($this->whenLoaded('reopenedBy')),
            'has_submitted' => $this->has_submitted ?? false,
        ];
    }
}
