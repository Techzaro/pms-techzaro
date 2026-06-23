<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ProjectMinResource extends JsonResource
{
    public function toArray($request)
    {
        if (!$this->resource) return null;
        return [
            'id' => $this->id,
            'title' => $this->title,
            'status' => $this->when($this->status, $this->status),
            'team_id' => $this->when($this->team_id, $this->team_id),
        ];
    }
}
