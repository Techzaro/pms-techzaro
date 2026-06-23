<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class NotificationResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'related_module' => $this->related_module,
            'related_id' => $this->related_id,
            'title' => $this->title,
            'message' => $this->message,
            'link' => $this->link,
            'is_read' => (bool) $this->is_read,
            'sender' => UserMinResource::make($this->whenLoaded('sender')),
            'created_at' => $this->created_at?->diffForHumans(),
            'created_at_raw' => $this->created_at?->format('Y-m-d\TH:i:s'),
        ];
    }
}
