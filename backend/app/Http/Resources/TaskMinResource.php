<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TaskMinResource extends JsonResource
{
    public function toArray($request)
    {
        if (!$this->resource) return null;
        return [
            'id' => $this->id,
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

    private function computeProgress(): int
    {
        $total = $this->total_deliverables ?? 0;
        if ($total === 0) return 0;
        return (int) round(($this->approved_deliverables / $total) * 100);
    }
}
