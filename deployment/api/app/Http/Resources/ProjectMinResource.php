<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Minimal API resource for Project models.
 *
 * Provides only essential project fields (id, title, status, team_id)
 * for use as a nested reference in other resources.
 */
class ProjectMinResource extends JsonResource
{
    /**
     * Transform the project into a minimal array representation.
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
            'title' => $this->title,
            'business_id' => $this->business_id ?? 'PRJ-' . $this->id,
            'status' => $this->when($this->status, $this->status),
            'team_id' => $this->when($this->team_id, $this->team_id),
        ];
    }
}
