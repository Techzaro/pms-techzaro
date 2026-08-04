<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\Task;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Artisan command to send reminder notifications for tasks approaching start/due dates.
 * Usage: php artisan tasks:send-reminders
 */
class SendTaskReminders extends Command
{
    protected $signature = 'tasks:send-reminders';

    protected $description = 'Send reminder notifications for tasks with upcoming reminder dates';

    public function handle(NotificationService $notificationService): int
    {
        $now = now();
        $intervals = [
            ['label' => '24 hours', 'minutes' => 1440],
            ['label' => '1 hour', 'minutes' => 60],
            ['label' => '15 minutes', 'minutes' => 15],
        ];

        $sent = 0;
        $duplicates = 0;

        foreach ($intervals as $interval) {
            $targetStart = $now->copy()->addMinutes($interval['minutes']);
            $targetEnd = $targetStart->copy()->addMinutes(5);

            $tasks = Task::whereNotIn('status', ['completed', 'approved', 'abandoned'])
                ->where(function ($q) use ($targetStart, $targetEnd) {
                    $q->whereBetween('end_date', [$targetStart, $targetEnd])
                      ->orWhereBetween('start_date', [$targetStart, $targetEnd]);
                })
                ->with('assignees:id,name,email')
                ->get();

            foreach ($tasks as $task) {
                $recipientIds = array_unique(array_filter(
                    array_merge(
                        $task->assignees->pluck('id')->toArray(),
                        [$task->assigned_to, $task->assigned_by]
                    )
                ));

                foreach ($recipientIds as $recipientId) {
                    if (empty($recipientId)) {
                        continue;
                    }

                    $exists = Notification::where('user_id', $recipientId)
                        ->where('type', 'task_reminder')
                        ->where('related_module', 'task')
                        ->where('related_id', $task->id)
                        ->where('created_at', '>=', now()->subHours(12))
                        ->exists();

                    if ($exists) {
                        $duplicates++;
                        continue;
                    }

                    Notification::create([
                        'user_id' => $recipientId,
                        'sender_user_id' => $task->assigned_by ?? $recipientId,
                        'type' => 'task_reminder',
                        'related_module' => 'task',
                        'related_id' => $task->id,
                        'title' => 'Task Reminder',
                        'message' => "Reminder: Task '{$task->title}' is scheduled for {$interval['label']}.",
                        'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                    ]);

                    $sent++;
                }
            }
        }

        $this->info("Task reminders: Sent {$sent} reminder(s). Skipped {$duplicates} duplicate(s).");

        return Command::SUCCESS;
    }
}
