<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for Team models.
 *
 * Formats team data with leader and members information.
 */
class TeamResource extends JsonResource
{
    /**
     * Transform the team into an array.
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
            'name' => $this->name,
            'leader_id' => $this->leader_id,
            'leader' => UserMinResource::make($this->whenLoaded('leader')),
            'members' => UserMinResource::collection($this->whenLoaded('members')),
        ];
    }
}
