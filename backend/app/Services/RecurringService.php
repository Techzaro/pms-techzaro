<?php

namespace App\Services;

use App\Models\Deliverable;
use App\Models\DeliverableTemplate;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * recurrence_settings JSON schema:
 * {
 *   "repeat": "daily|weekly|monthly|custom",
 *   "skip_weekends": false
 * }
 */
class RecurringService
{
    // ─── Variable Parsing ───────────────────────────────────────────────

    /**
     * Parse variables in a template string.
     * Supported: {{number}}, {{day}}, {{date}}, {{week}}, {{month}}, {{year}}
     *
     * @param string $text    Template text with variables
     * @param int    $number  Global deliverable number
     * @param int    $day     Day/period number
     * @param string $date    Date string (Y-m-d)
     */
    public function parseVariables(string $text, int $number, int $day, string $date): string
    {
        $timestamp = strtotime($date);
        $replacements = [
            '{{number}}' => $number,
            '{{day}}'    => $day,
            '{{date}}'   => date('j M Y', $timestamp),
            '{{week}}'   => date('W', $timestamp),
            '{{month}}'  => date('F', $timestamp),
            '{{year}}'   => date('Y', $timestamp),
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $text);
    }

    // ─── Date Helpers ───────────────────────────────────────────────────

    /**
     * Get next working day, skipping weekends if enabled.
     */
    public function getNextWorkingDay(Carbon $date, bool $skipWeekends): Carbon
    {
        if (!$skipWeekends) return $date;

        while ($date->isWeekend()) {
            $date->addDay();
        }
        return $date;
    }

    /**
     * Calculate the date for a specific period number.
     */
    public function getPeriodDate(string $startDate, string $repeat, int $periodNumber, bool $skipWeekends): Carbon
    {
        $date = Carbon::parse($startDate)->startOfDay();

        if ($repeat === 'daily') {
            $date->addDays($periodNumber - 1);
            $date = $this->getNextWorkingDay($date, $skipWeekends);
        } elseif ($repeat === 'weekly') {
            $date->addWeeks($periodNumber - 1);
        } elseif ($repeat === 'monthly') {
            $date->addMonths($periodNumber - 1);
        } else {
            $date->addDays($periodNumber - 1);
            $date = $this->getNextWorkingDay($date, $skipWeekends);
        }

        return $date;
    }

    // ─── Total Calculation ──────────────────────────────────────────────

    /**
     * Calculate total number of periods from task start date to end date (due date).
     */
    public function calculateTotalPeriods(array $settings, string $taskStartDate, string $taskEndDate): int
    {
        $repeat = $settings['repeat'] ?? 'daily';
        $start = Carbon::parse($taskStartDate)->startOfDay();
        $end = Carbon::parse($taskEndDate)->startOfDay();

        if ($end->lte($start)) return 1;

        $diffDays = max(1, (int) $start->diffInDays($end) + 1);

        return match ($repeat) {
            'weekly'  => (int) ceil($diffDays / 7),
            'monthly' => (int) ceil($diffDays / 30),
            default   => $diffDays,
        };
    }

    /**
     * Calculate total deliverables = totalPeriods * sum(template quantities).
     */
    public function calculateTotalDeliverables(array $templates, array $settings, string $taskStartDate, string $taskEndDate): int
    {
        $totalPeriods = $this->calculateTotalPeriods($settings, $taskStartDate, $taskEndDate);
        $totalPerPeriod = array_sum(array_map(fn($t) => (int) ($t['quantity'] ?? 1), $templates));
        return $totalPeriods * $totalPerPeriod;
    }

    // ─── Labels ─────────────────────────────────────────────────────────

    public function getPeriodLabel(string $repeat): string
    {
        return match ($repeat) {
            'daily'   => 'Day',
            'weekly'  => 'Week',
            'monthly' => 'Month',
            'custom'  => 'Period',
            default   => 'Period',
        };
    }

    public function getRepeatLabel(string $repeat): string
    {
        return match ($repeat) {
            'daily'   => 'Daily',
            'weekly'  => 'Weekly',
            'monthly' => 'Monthly',
            'custom'  => 'Custom',
            default   => ucfirst($repeat),
        };
    }

    // ─── Preview ────────────────────────────────────────────────────────

    /**
     * Generate preview of deliverables for the frontend.
     * Shows first 5 periods with properly numbered deliverables.
     */
    public function generatePreview(array $templates, array $settings, string $taskStartDate, string $taskEndDate): array
    {
        $repeat = $settings['repeat'] ?? 'daily';
        $skipWeekends = (bool) ($settings['skip_weekends'] ?? false);
        $totalPeriods = $this->calculateTotalPeriods($settings, $taskStartDate, $taskEndDate);
        $periodsToShow = min($totalPeriods, 5);
        $periodLabel = $this->getPeriodLabel($repeat);

        $previewPeriods = [];
        $globalNumber = 1;

        for ($p = 1; $p <= $periodsToShow; $p++) {
            $date = $this->getPeriodDate($taskStartDate, $repeat, $p, $skipWeekends);
            $dateStr = $date->format('Y-m-d');
            $periodItems = [];

            foreach ($templates as $template) {
                $quantity = (int) ($template['quantity'] ?? 1);
                $combined = (bool) ($template['combined'] ?? false);

                if ($combined) {
                    $title = $this->parseVariables(
                        $template['title'] ?? '',
                        $globalNumber,
                        $p,
                        $dateStr
                    );
                    $description = !empty($template['description'])
                        ? $this->parseVariables($template['description'], $globalNumber, $p, $dateStr)
                        : null;

                    $periodItems[] = [
                        'number' => $globalNumber,
                        'title' => $title,
                        'description' => $description,
                        'count' => $quantity,
                    ];
                    $globalNumber++;
                } else {
                    for ($i = 1; $i <= $quantity; $i++) {
                        $title = $this->parseVariables(
                            $template['title'] ?? '',
                            $globalNumber,
                            $p,
                            $dateStr
                        );
                        $description = !empty($template['description'])
                            ? $this->parseVariables($template['description'], $globalNumber, $p, $dateStr)
                            : null;

                        $periodItems[] = [
                            'number' => $globalNumber,
                            'title' => $title,
                            'description' => $description,
                            'count' => 1,
                        ];
                        $globalNumber++;
                    }
                }
            }

            $previewPeriods[] = [
                'period' => $p,
                'date' => $dateStr,
                'label' => $periodLabel . ' ' . $p,
                'items' => $periodItems,
                'count' => count($periodItems),
            ];
        }

        $totalDeliverables = $globalNumber - 1 + ($totalPeriods - $periodsToShow) * array_sum(array_map(fn($t) => (int) ($t['quantity'] ?? 1), $templates));

        return [
            'preview_periods' => $previewPeriods,
            'total_periods' => $totalPeriods,
            'total_deliverables' => $totalPeriods * array_sum(array_map(fn($t) => (int) ($t['quantity'] ?? 1), $templates)),
            'remaining_periods' => $totalPeriods - $periodsToShow,
            'has_more' => $totalPeriods > $periodsToShow,
            'period_label' => strtolower($periodLabel),
            'repeat_label' => $this->getRepeatLabel($repeat),
            'skip_weekends' => $skipWeekends,
        ];
    }

    // ─── Generation ─────────────────────────────────────────────────────

    /**
     * Generate deliverables for a specific occurrence of a recurring task.
     * Each deliverable gets a globally unique number via {{number}}.
     *
     * @param Task   $task            The recurring task
     * @param int    $occurrenceNumber Current occurrence (1-based)
     * @param string $date            The date for this occurrence (Y-m-d)
     * @return Collection Created deliverables
     */
    public function generateOccurrenceDeliverables(Task $task, int $occurrenceNumber, string $date): Collection
    {
        $templates = $task->deliverableTemplates()->orderBy('sort_order')->get();
        $created = collect();

        // Calculate global number base for this occurrence
        // Sum of all template quantities from previous occurrences
        $previousOccurrencesTotal = 0;
        for ($i = 0; $i < $occurrenceNumber - 1; $i++) {
            foreach ($templates as $t) {
                $previousOccurrencesTotal += $t->combined ? 1 : max(1, (int) $t->quantity);
            }
        }

        $globalNumber = $previousOccurrencesTotal + 1;

        foreach ($templates as $template) {
            $quantity = max(1, (int) $template->quantity);
            $combined = (bool) $template->combined;

            if ($combined) {
                $title = $this->parseVariables($template->title, $globalNumber, $occurrenceNumber, $date);
                $description = $template->description
                    ? $this->parseVariables($template->description, $globalNumber, $occurrenceNumber, $date)
                    : null;

                $displayTitle = $quantity > 1 ? "{$quantity} × {$title}" : $title;

                $deliverable = Deliverable::create([
                    'project_id' => $task->project_id,
                    'task_id' => $task->id,
                    'title' => $displayTitle,
                    'description' => $description,
                    'status' => 'pending',
                    'priority' => $task->priority,
                    'due_date' => Carbon::parse($date)->endOfDay(),
                    'assigned_to' => $task->assigned_to,
                    'created_by' => $task->assigned_by,
                ]);

                $created->push($deliverable);
                $globalNumber++;
            } else {
                for ($i = 1; $i <= $quantity; $i++) {
                    $title = $this->parseVariables($template->title, $globalNumber, $occurrenceNumber, $date);
                    $description = $template->description
                        ? $this->parseVariables($template->description, $globalNumber, $occurrenceNumber, $date)
                        : null;

                    $deliverable = Deliverable::create([
                        'project_id' => $task->project_id,
                        'task_id' => $task->id,
                        'title' => $title,
                        'description' => $description,
                        'status' => 'pending',
                        'priority' => $task->priority,
                        'due_date' => Carbon::parse($date)->endOfDay(),
                        'assigned_to' => $task->assigned_to,
                        'created_by' => $task->assigned_by,
                    ]);

                    $created->push($deliverable);
                    $globalNumber++;
                }
            }
        }

        return $created;
    }

    // ─── Notifications ──────────────────────────────────────────────────

    /**
     * Build notification arrays for created deliverables.
     */
    public function buildNotifications(Collection $deliverables, Task $task, string $periodLabel): array
    {
        $notifications = [];
        foreach ($deliverables as $dlv) {
            if ($task->assigned_to && (int) $task->assigned_to !== (int) $task->assigned_by) {
                $notifications[] = [
                    'user_id' => $task->assigned_to,
                    'sender_user_id' => $task->assigned_by,
                    'type' => 'deliverable_assigned',
                    'related_module' => 'deliverable',
                    'related_id' => $dlv->id,
                    'title' => 'New Recurring Deliverable',
                    'message' => "New deliverable \"{$dlv->title}\" has been generated for {$periodLabel}.",
                    'link' => '/deliveries?selectedDeliverable=' . $dlv->id,
                ];
            }
        }
        return $notifications;
    }
}
