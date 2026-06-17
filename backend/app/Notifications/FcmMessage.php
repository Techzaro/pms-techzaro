<?php

namespace App\Notifications;

use App\Models\Notification;

class FcmMessage
{
    public string $title;
    public string $body;
    public string $url;
    public string $type;
    public ?int $id;

    public function __construct(Notification $notification)
    {
        $this->title = $notification->title ?: 'PMS Notification';
        $this->body = $notification->message ?: '';
        $this->url = $notification->link ?: '/';
        $this->type = $notification->related_module ?: 'general';
        $this->id = $notification->related_id;
    }

    public function toFcm(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
            'type' => $this->type,
            'id' => $this->id,
        ];
    }
}
