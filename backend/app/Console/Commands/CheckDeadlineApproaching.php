<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\Task;
use Illuminate\Console\Command;

/**
 * Artisan command to check for tasks approaching deadline and send high-priority notifications.
 * Usage: php artisan tasks:check-deadlines
 */
class CheckDeadlineApproaching extends Command
{
    protected $signature = 'tasks:check-deadlines';

    protected $description = 'Check for tasks approaching their final deadline and dispatch high-priority notifications';

    public function handle(): int
    {
        $now = now();
        $thresholds = [
            ['label' => '24 hours', 'minutes' => 1440],
            ['label' => '1 hour', 'minutes' => 60],
        ];

        $sent = 0;
        $duplicates = 0;

        foreach ($thresholds as $threshold) {
            $targetStart = $now->copy()->addMinutes($threshold['minutes']);
            $targetEnd = $targetStart->copy()->addMinutes(5);

            $tasks = Task::whereNotIn('status', ['completed', 'approved', 'abandoned'])
                ->whereBetween('end_date', [$targetStart, $targetEnd])
                ->with('assignees:id,name,email')
                ->get();

            foreach ($tasks as $task) {
                $stakeholderIds = array_unique(array_filter(
                    array_merge(
                        $task->assignees->pluck('id')->toArray(),
                        [$task->assigned_to, $task->assigned_by]
                    )
                ));

                foreach ($stakeholderIds as $targetUserId) {
                    $exists = Notification::where('user_id', $targetUserId)
                        ->where('type', 'deadline_approaching')
                        ->where('related_module', 'task')
                        ->where('related_id', $task->id)
                        ->where('created_at', '>=', now()->subHours(12))
                        ->exists();

                    if ($exists) {
                        $duplicates++;
                        continue;
                    }

                    // Resolve recipient timezone and format localized deadline (SRS Sec 21)
                    $userTz = \App\Services\NotificationService::resolveUserTimezone($targetUserId);
                    $localDeadline = $task->end_date ? \Carbon\Carbon::parse($task->end_date)->setTimezone($userTz)->format('d M Y, g:i A') : '';
                    $timeSuffix = $localDeadline ? " (Deadline: {$localDeadline} {$userTz})" : '';

                    Notification::create([
                        'user_id' => $targetUserId,
                        'sender_user_id' => $task->assigned_by ?? $targetUserId,
                        'type' => 'deadline_approaching',
                        'related_module' => 'task',
                        'related_id' => $task->id,
                        'title' => 'Deadline Approaching',
                        'message' => "Deadline Approaching: Task '{$task->title}' is due in {$threshold['label']}{$timeSuffix}.",
                        'link' => '/tasks/task-details/'.$task->id.'?from=tasks',
                    ]);

                    $sent++;
                }
            }
        }

        $this->info("Deadline notifications: Sent {$sent} notification(s). Skipped {$duplicates} duplicate(s).");

        return Command::SUCCESS;
    }
}
