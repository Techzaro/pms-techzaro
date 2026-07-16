<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Full API resource for Project models.
 *
 * Includes all project fields, related resources (tasks, deliverables,
 * team), and computed progress statistics.
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
            'sidebar_notes' => $this->sidebar_notes,
            'created_at' => $this->created_at?->format('Y-m-d\TH:i:s'),
            'updated_at' => $this->updated_at?->format('Y-m-d\TH:i:s'),
            'creator' => UserMinResource::make($this->whenLoaded('creator')),
            'team' => TeamResource::make($this->whenLoaded('team')),
            'tasks' => TaskMinResource::collection($this->whenLoaded('tasks')),
            'milestones' => $this->whenLoaded('milestones'),
            'files' => $this->whenLoaded('files'),
            'deliverables' => DeliverableResource::collection($this->whenLoaded('deliverables')),
            'workflow_events' => $this->whenLoaded('workflowEvents'),
            'total_tasks' => $this->total_tasks ?? $this->tasks_count ?? 0,
            'completed_tasks' => $this->completed_tasks ?? 0,
            'progress_percent' => $this->when($this->total_tasks ?? $this->tasks_count, function () {
                $total = $this->total_tasks ?? $this->tasks_count ?? 0;
                if ($total === 0) return 0;
                return (int) round(($this->completed_tasks / $total) * 100);
            }),
        ];
    }
}
