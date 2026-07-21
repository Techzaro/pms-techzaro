<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Minimal API resource for Task models.
 *
 * Provides essential task fields plus computed deliverables progress
 * for use in project listings and dashboards.
 */
class TaskMinResource extends JsonResource
{
    /**
     * Transform the task into a minimal array with progress data.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array|null Null if the underlying resource is null
     */
    public function toArray($request)
    {
        if (!$this->resource) return null;
        return [
            'id' => $this->id,
            'business_id' => $this->business_id,
            'title' => $this->title,
            'status' => $this->status,
            'priority' => $this->priority,
            'start_date' => $this->start_date?->format('Y-m-d\TH:i:s'),
            'end_date' => $this->end_date?->format('Y-m-d\TH:i:s'),
            'assignees' => \App\Http\Resources\UserMinResource::collection($this->whenLoaded('assignees')),
            'assigner' => $this->whenLoaded('assigner', fn () => [
                'id' => $this->assigner->id,
                'name' => $this->assigner->name,
                'role' => $this->assigner->role,
            ]),
            'total_deliverables' => $this->total_deliverables ?? 0,
            'approved_deliverables' => $this->approved_deliverables ?? 0,
            'pending_deliverables_count' => $this->pending_deliverables ?? 0,
            'deliverables_progress' => $this->computeProgress(),
        ];
    }

    /**
     * Compute deliverables completion progress as a percentage.
     *
     * @return int 0-100 percentage, or 0 if no deliverables exist
     */
    private function computeProgress(): int
    {
        $total = (int) ($this->total_deliverables ?? 0);
        if ($total <= 0) return 0;
        return (int) round(($this->approved_deliverables / $total) * 100);
    }
}
