<?php

namespace App\Notifications;

use App\Models\Notification;

/**
 * Value object representing an FCM push notification message.
 *
 * Wraps a database Notification model and extracts the fields
 * needed for the FCM payload.
 */
class FcmMessage
{
    /** @var string Notification title */
    public string $title;

    /** @var string Notification body text */
    public string $body;

    /** @var string Deep-link URL for the notification */
    public string $url;

    /** @var string Notification type/module identifier */
    public string $type;

    /** @var int|null Related entity ID */
    public ?int $id;

    /**
     * Create an FcmMessage from a database Notification model.
     *
     * @param \App\Models\Notification $notification The source notification
     */
    public function __construct(Notification $notification)
    {
        $this->title = $notification->title ?: 'PMS Notification';
        $this->body = $notification->message ?: '';
        $this->url = $notification->link ?: '/';
        $this->type = $notification->related_module ?: 'general';
        $this->id = $notification->related_id;
    }

    /**
     * Convert the message to an FCM-compatible array.
     *
     * @param object $notifiable The notifiable user model
     *
     * @return array{title: string, body: string, url: string, type: string, id: int|null}
     */
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
