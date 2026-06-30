<?php

namespace App\Mail;

use App\Models\Notification;
use App\Models\Task;
use App\Models\Project;
use App\Models\Deliverable;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class NotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public Notification $notification;
    public string $frontendUrl;
    public $entity;
    public array $deliverableContext = [];

    public function __construct(Notification $notification)
    {
        $this->notification = $notification;
        $this->frontendUrl = rtrim(config('app.frontend_url'), '/');
        $this->entity = $this->loadEntity($notification);

        if ($notification->type === 'deliverable_added') {
            $this->deliverableContext = $this->buildDeliverableContext($notification);
        }
    }

    private function loadEntity(Notification $notification)
    {
        if (!$notification->related_module || !$notification->related_id) {
            return null;
        }

        return match ($notification->related_module) {
            'task' => Task::with(['project:id,title', 'assignees:id,name', 'assignee:id,name'])
                ->where('id', $notification->related_id)
                ->first(['id', 'title', 'description', 'status', 'priority', 'start_date', 'end_date', 'project_id', 'assigned_by']),
            'project' => Project::where('id', $notification->related_id)
                ->first(['id', 'title', 'description', 'status', 'priority', 'start_date', 'end_date']),
            'deliverable' => Deliverable::with(['project:id,title', 'task:id,title'])
                ->where('id', $notification->related_id)
                ->first(['id', 'title', 'description', 'status', 'priority', 'due_date', 'project_id', 'task_id', 'assigned_to']),
            default => null,
        };
    }

    private function buildDeliverableContext(Notification $notification): array
    {
        $changes = $notification->changes ?? [];
        $sender = $notification->sender;

        return [
            'userName' => $notification->user->name ?? '',
            'projectName' => $changes['project_name'] ?? ($this->entity->project->title ?? ''),
            'taskName' => $changes['task_name'] ?? ($this->entity->task->title ?? ''),
            'deliverableName' => $changes['deliverable_name'] ?? ($this->entity->title ?? ''),
            'deliverableDescription' => $changes['deliverable_description'] ?? ($this->entity->description ?? ''),
            'addedByName' => $sender->name ?? 'System',
            'addedAt' => $notification->created_at ? $notification->created_at->format('d M Y, g:i A') : now()->format('d M Y, g:i A'),
            'contextType' => $changes['context_type'] ?? 'task',
            'loginUrl' => $this->frontendUrl,
        ];
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->notification->title ?: 'PMS Notification',
        );
    }

    public function content(): Content
    {
        $view = $this->notification->type === 'deliverable_added'
            ? 'emails.deliverable-added'
            : 'emails.notification';

        return new Content(
            view: $view,
        );
    }
}
