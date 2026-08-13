<?php

namespace App\Mail;

use App\Models\Notification;
use App\Models\Task;
use App\Models\Project;
use App\Models\Deliverable;
use App\Models\Team;
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
    public string $senderEmail;
    public string $senderName;

    public function __construct(Notification $notification, string $senderEmail = '', string $senderName = 'PMS Techxaro')
    {
        $this->notification = $notification;
        $this->frontendUrl = rtrim(config('app.frontend_url'), '/');
        $this->entity = $this->loadEntity($notification);
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');

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
            'team' => Team::with(['leader:id,name', 'members:id,name'])
                ->where('id', $notification->related_id)
                ->first(['id', 'name', 'description', 'leader_id', 'created_by']),
            default => null,
        };
    }

    public function getRolePath(string $role): string
    {
        return match (strtolower($role)) {
            'admin' => 'admin',
            'manager' => 'manager',
            'team_lead', 'teamlead' => 'team-lead',
            'guest' => 'guest',
            default => 'member',
        };
    }

    public function resolveEntityUrl(): string
    {
        $role = $this->getRolePath($this->notification->user->role ?? 'member');
        if ($this->notification->link) {
            return $this->frontendUrl . '/' . ltrim($this->notification->link, '/');
        }

        if (!$this->entity) {
            return $this->frontendUrl;
        }

        return match ($this->notification->related_module) {
            'task' => "{$this->frontendUrl}/{$role}/tasks/task-details/{$this->entity->id}",
            'project' => "{$this->frontendUrl}/{$role}/projects/project-details/{$this->entity->id}",
            'deliverable' => "{$this->frontendUrl}/{$role}/deliverables/deliverable-details/{$this->entity->id}",
            default => $this->frontendUrl,
        };
    }

    public function resolveProjectUrl(): ?string
    {
        $role = $this->getRolePath($this->notification->user->role ?? 'member');
        $projectId = null;
        if ($this->notification->related_module === 'project') {
            $projectId = $this->entity->id ?? null;
        } elseif (isset($this->entity->project_id)) {
            $projectId = $this->entity->project_id;
        } elseif (isset($this->entity->project->id)) {
            $projectId = $this->entity->project->id;
        }

        return $projectId ? "{$this->frontendUrl}/{$role}/projects/project-details/{$projectId}" : null;
    }

    private function buildDeliverableContext(Notification $notification): array
    {
        $changes = $notification->changes ?? [];
        $sender = $notification->sender;
        $role = $this->getRolePath($notification->user->role ?? 'member');

        $projectId = $this->entity->project_id ?? ($this->entity->project->id ?? null);
        $taskId = $this->entity->task_id ?? ($this->entity->task->id ?? null);
        $deliverableId = $this->entity->id ?? null;

        return [
            'userName' => $notification->user->name ?? '',
            'projectName' => $changes['project_name'] ?? ($this->entity->project->title ?? ''),
            'projectUrl' => $projectId ? "{$this->frontendUrl}/{$role}/projects/project-details/{$projectId}" : null,
            'taskName' => $changes['task_name'] ?? ($this->entity->task->title ?? ''),
            'taskUrl' => $taskId ? "{$this->frontendUrl}/{$role}/tasks/task-details/{$taskId}" : null,
            'deliverableName' => $changes['deliverable_name'] ?? ($this->entity->title ?? ''),
            'deliverableUrl' => $deliverableId ? "{$this->frontendUrl}/{$role}/deliverables/deliverable-details/{$deliverableId}" : null,
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
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: $this->notification->title ?: 'PMS Notification',
        );
    }

    public function content(): Content
    {
        $view = $this->notification->type === 'deliverable_added'
            ? 'emails.deliverable-added'
            : 'emails.notification';

        $withData = array_merge($this->deliverableContext, [
            'entityUrl' => $this->resolveEntityUrl(),
            'projectUrl' => $this->resolveProjectUrl(),
        ]);

        return new Content(
            view: $view,
            with: $withData,
        );
    }
}
