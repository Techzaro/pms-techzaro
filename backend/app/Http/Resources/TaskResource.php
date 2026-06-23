<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'title' => $this->title,
            'description' => $this->description,
            'requirements' => $this->requirements,
            'status' => $this->status,
            'priority' => $this->priority,
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
            'subtasks' => $this->whenLoaded('subtasks'),
            'files' => $this->whenLoaded('files'),
            'submissions' => $this->whenLoaded('submissions'),
            'latest_submission' => SubmissionResource::make($this->whenLoaded('latestSubmission')),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'approved_by' => UserMinResource::make($this->whenLoaded('approvedBy')),
            'rejected_by' => UserMinResource::make($this->whenLoaded('rejectedBy')),
            'reopened_by' => UserMinResource::make($this->whenLoaded('reopenedBy')),
            'unviewed_changes' => $this->whenLoaded('unviewedChanges'),
            'deliverables' => DeliverableResource::collection($this->whenLoaded('deliverables')),
        ];
    }
}
