<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TeamResource extends JsonResource
{
    public function toArray($request)
    {
        if (!$this->resource) return null;
        return [
            'id' => $this->id,
            'name' => $this->name,
            'leader_id' => $this->leader_id,
            'leader' => UserMinResource::make($this->whenLoaded('leader')),
            'members' => UserMinResource::collection($this->whenLoaded('members')),
        ];
    }
}
