<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for Notification models.
 *
 * Formats notification data with human-readable timestamps
 * and sender information for the frontend notification feed.
 */
class NotificationResource extends JsonResource
{
    /**
     * Transform the notification into an array.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array
     */
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
