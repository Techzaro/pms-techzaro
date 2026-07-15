<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Full API resource for Project models.
 *
 * Includes all project fields, related resources (tasks, deliverables,
 * team, submissions), and computed progress statistics.
 */
class ProjectResource extends JsonResource
{
    /**
     * Transform the project into a complete array representation.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array
     */
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'priority' => $this->priority,
            'client_name' => $this->client_name,
            'category' => $this->category,
            'budget' => $this->budget,
            'start_date' => $this->start_date?->format('Y-m-d\TH:i:s'),
            'end_date' => $this->end_date?->format('Y-m-d\TH:i:s'),
            'active_deadline' => $this->active_deadline?->format('Y-m-d\TH:i:s'),
            'created_by' => $this->created_by,
            'team_id' => $this->team_id,
            'assigned_users' => $this->assigned_users,
            'user_due_dates' => $this->user_due_dates,
            'sidebar_notes' => $this->sidebar_notes,
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
            'creator' => UserMinResource::make($this->whenLoaded('creator')),
            'team' => TeamResource::make($this->whenLoaded('team')),
            'tasks' => TaskMinResource::collection($this->whenLoaded('tasks')),
            'milestones' => $this->whenLoaded('milestones'),
            'files' => $this->whenLoaded('files'),
            'deliverables' => DeliverableResource::collection($this->whenLoaded('deliverables')),
            'submissions' => $this->whenLoaded('submissions'),
            'user_submissions' => $this->whenLoaded('userSubmissions', function () {
                return $this->userSubmissions->map(fn($s) => [
                    'id' => $s->id,
                    'user_id' => $s->user_id,
                    'status' => $s->status,
                    'comment' => $s->comment,
                    'file_path' => $s->file_path,
                    'file_name' => $s->file_name,
                    'links' => $s->links,
                    'submitted_at' => $s->submitted_at?->format('Y-m-d\TH:i:s'),
                    'reviewed_at' => $s->reviewed_at?->format('Y-m-d\TH:i:s'),
                    'reviewed_by' => $s->reviewed_by,
                    'review_comment' => $s->review_comment,
                    'user' => [
                        'id' => $s->user?->id,
                        'name' => $s->user?->name,
                        'role' => $s->user?->role,
                        'email' => $s->user?->email,
                    ],
                    'reviewer' => $s->reviewer ? [
                        'id' => $s->reviewer->id,
                        'name' => $s->reviewer->name,
                    ] : null,
                ]);
            }),
            'latest_submission' => $this->whenLoaded('latestSubmission'),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'approved_by' => $this->whenLoaded('approvedBy')?->name,
            'rejected_by' => $this->whenLoaded('rejectedBy')?->name,
            'reopened_by' => $this->whenLoaded('reopenedBy')?->name,
            'total_tasks' => $this->total_tasks ?? $this->tasks_count ?? 0,
            'completed_tasks' => $this->completed_tasks ?? 0,
            // Compute progress percentage only when total_tasks is available
            'progress_percent' => $this->when($this->total_tasks ?? $this->tasks_count, function () {
                $total = $this->total_tasks ?? $this->tasks_count ?? 0;
                if ($total === 0) return 0;
                return (int) round(($this->completed_tasks / $total) * 100);
            }),
        ];
    }
}
