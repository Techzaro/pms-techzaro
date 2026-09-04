<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for Deliverable models.
 *
 * Transforms deliverable data into a consistent JSON structure,
 * including nested related resources (project, assignee, submissions, etc.).
 */
class DeliverableResource extends JsonResource
{
    /**
     * Transform the deliverable into an array.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array
     */
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'business_id' => $this->business_id ?? 'SUB-' . $this->id,
            'project_id' => $this->project_id,
            'task_id' => $this->task_id,
            'parent_deliverable_id' => $this->parent_deliverable_id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'priority' => $this->priority,
            'kb_ids' => $this->kb_ids ?? [],
            'event_ids' => $this->event_ids ?? [],
            'start_date' => $this->start_date?->format('Y-m-d\TH:i:s'),
            'due_date' => $this->due_date?->format('Y-m-d\TH:i:s'),
            'assigned_to' => $this->assigned_to,
            'created_by' => $this->created_by,
            'sort_order' => $this->sort_order,
            'estimated_hours' => $this->estimated_hours,
            'estimated_minutes' => $this->estimated_minutes,
            'labels' => $this->labels,
            'tags' => $this->tags,
            'followers' => $this->followers,
            'dependencies' => $this->dependencies,
            'submitted_at' => $this->submitted_at?->format('Y-m-d\TH:i:s'),
            'approved_at' => $this->approved_at?->format('Y-m-d\TH:i:s'),
            'rejected_at' => $this->rejected_at?->format('Y-m-d\TH:i:s'),
            'rejection_comment' => $this->rejection_comment,
            'reopened_at' => $this->reopened_at?->format('Y-m-d\TH:i:s'),
            'reopen_comment' => $this->reopen_comment,
            'reopen_instructions' => $this->reopen_instructions,
            'reopen_new_deadline' => $this->reopen_new_deadline?->format('Y-m-d\TH:i:s'),
            'completion_reason' => $this->completion_reason,
            'completion_notes' => $this->completion_notes,
            'acknowledged_at' => $this->acknowledged_at?->toIso8601String(),
            'paused_at' => $this->paused_at?->toIso8601String(),
            'assigner_paused' => $this->assigner_paused ?? false,
            'work_started_at' => $this->work_started_at?->toIso8601String(),
            'total_work_seconds' => $this->total_work_seconds ?? 0,
            'elapsed_seconds' => $this->elapsed_seconds ?? 0,
            'pause_count' => $this->pause_count ?? 0,
            'total_pause_seconds' => $this->total_pause_seconds ?? 0,
            'resume_count' => $this->resume_count ?? 0,
            'timer_state' => $this->timer_state ?? 'idle',
            'last_timer_event_at' => $this->last_timer_event_at?->toIso8601String(),
            'work_completed_at' => $this->work_completed_at?->toIso8601String(),
            'is_reopened' => (bool) ($this->is_reopened || !empty($this->reopened_at) || ($this->reopen_count ?? 0) > 0),
            'is_transferred' => (bool) ($this->is_transferred || (!empty($this->delegation_chain) && count($this->delegation_chain) > 0)),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'project' => ProjectMinResource::make($this->whenLoaded('project')),
            'assignee' => UserMinResource::make($this->whenLoaded('assignee')),
            'assignees' => UserMinResource::collection($this->whenLoaded('assignees')),
            'creator' => UserMinResource::make($this->whenLoaded('creator')),
            'task' => $this->whenLoaded('task', fn () => [
                'id' => $this->task->id,
                'title' => $this->task->title,
                'business_id' => $this->task->business_id ?? 'TSK-' . $this->task->id,
            ]),
            'children' => DeliverableResource::collection($this->whenLoaded('children')),
            'parent' => DeliverableResource::make($this->whenLoaded('parent')),
            'files' => $this->whenLoaded('files'),
            'submissions' => $this->whenLoaded('submissions'),
            'latest_submission' => SubmissionResource::make($this->whenLoaded('latestSubmission')),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'changes' => $this->whenLoaded('changes'),
            'unviewed_changes' => $this->whenLoaded('unviewedChanges'),
            'unviewed_changes_count' => $this->whenLoaded('unviewedChanges') ? $this->unviewedChanges->count() : 0,
            'approved_by' => UserMinResource::make($this->whenLoaded('approvedBy')),
            'rejected_by' => UserMinResource::make($this->whenLoaded('rejectedBy')),
            'reopened_by' => UserMinResource::make($this->whenLoaded('reopenedBy')),
            'acknowledged_by' => UserMinResource::make($this->whenLoaded('acknowledgedBy')),
            'paused_by' => UserMinResource::make($this->whenLoaded('pausedBy')),
            'has_submitted' => $this->has_submitted ?? false,
            'current_work_seconds' => $this->when($this->relationLoaded('pauseSessions') || $this->timer_state === 'running', fn () => $this->getCurrentWorkSeconds()),
            'current_elapsed_seconds' => $this->when($this->acknowledged_at, fn () => $this->getCurrentElapsedSeconds()),
        ];
    }
}
