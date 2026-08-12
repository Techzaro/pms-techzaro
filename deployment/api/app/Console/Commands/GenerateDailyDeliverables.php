<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Services\NotificationService;
use App\Services\RecurringService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class GenerateDailyDeliverables extends Command
{
    protected $signature = 'deliverables:generate-daily';
    protected $description = 'Generate deliverables for recurring tasks based on their repeat type';

    public function handle(
        NotificationService $notificationService,
        RecurringService $recurringService
    ): int {
        $today = Carbon::now()->startOfDay();
        $generatedCount = 0;
        $taskCount = 0;
        $allNotifications = [];

        // Find all active recurring tasks that need generation today
        $tasks = Task::where('task_type', 'recurring')
            ->where('recurrence_status', 'active')
            ->whereIn('status', ['pending', 'in_progress', 'reopened'])
            ->whereDate('start_date', '<=', $today)
            ->with('deliverableTemplates')
            ->get()
            ->filter(function ($task) use ($today, $recurringService) {
                $settings = $task->recurrence_settings;
                if (!$settings) return false;

                $repeat = $settings['repeat'] ?? 'daily';
                $skipWeekends = (bool) ($settings['skip_weekends'] ?? false);
                $generated = (int) $task->deliverables_generated;
                $totalPeriods = $recurringService->calculateTotalPeriods($settings, $task->start_date, $task->end_date);

                // Check if all periods already generated
                if ($generated >= $totalPeriods) return false;

                // Check if templates exist
                if ($task->deliverableTemplates->isEmpty()) return false;

                // Check if today is the right day to generate
                $nextPeriod = $generated + 1;
                $nextDate = $recurringService->getPeriodDate(
                    $task->start_date,
                    $repeat,
                    $nextPeriod,
                    $skipWeekends
                );

                // For daily with skip weekends, also skip weekends on the check
                if ($repeat === 'daily' && $skipWeekends) {
                    $nextDate = $recurringService->getNextWorkingDay($nextDate->copy(), true);
                }

                // The date must match today for generation
                if (!$nextDate->isSameDay($today)) return false;

                // Store computed values on task for use in generation
                $task->computed_occurrence = $nextPeriod;
                $task->computed_date = $nextDate->format('Y-m-d');
                $task->computed_total = $totalPeriods;
                return true;
            });

        if ($tasks->isEmpty()) {
            $this->info('No recurring tasks pending deliverable generation.');
            return Command::SUCCESS;
        }

        foreach ($tasks as $task) {
            $periodNumber = $task->computed_occurrence;
            $date = $task->computed_date;
            $totalPeriods = $task->computed_total;
            $periodLabel = $recurringService->getPeriodLabel(
                $task->recurrence_settings['repeat'] ?? 'daily'
            ) . ' ' . $periodNumber;

            $created = $recurringService->generateOccurrenceDeliverables($task, $periodNumber, $date);
            $generatedCount += $created->count();

            $notifications = $recurringService->buildNotifications($created, $task, $periodLabel);
            $allNotifications = array_merge($allNotifications, $notifications);

            $task->increment('deliverables_generated');

            // Mark as completed if all periods generated
            if ($periodNumber >= $totalPeriods) {
                $task->update(['recurrence_status' => 'completed']);
            }

            $taskCount++;
        }

        if (!empty($allNotifications)) {
            $notificationService->createBulk($allNotifications);
        }

        $this->info("Generated {$generatedCount} deliverable(s) for {$taskCount} task(s).");
        return Command::SUCCESS;
    }
}
