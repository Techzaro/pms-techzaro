<?php

namespace App\Services\Saas\Provisioning;

/**
 * ProvisioningStatus.
 *
 * Tracks the progress of a tenant provisioning operation.
 * Stores each step's status, timing, and any failure reasons.
 */
class ProvisioningStatus
{
    public const STEP_CREATE_DATABASE     = 'create_database';
    public const STEP_RUN_MIGRATIONS      = 'run_migrations';
    public const STEP_RUN_SEEDERS         = 'run_seeders';
    public const STEP_CREATE_ADMIN        = 'create_administrator';
    public const STEP_REGISTER_DOMAIN     = 'register_domain';
    public const STEP_ASSIGN_PLAN         = 'assign_plan';
    public const STEP_CREATE_ORG_RECORD   = 'create_organization_record';

    public const STATUS_PENDING    = 'pending';
    public const STATUS_RUNNING    = 'running';
    public const STATUS_COMPLETED  = 'completed';
    public const STATUS_FAILED     = 'failed';
    public const STATUS_ROLLBACK   = 'rollback';
    public const STATUS_SKIPPED    = 'skipped';

    protected array $steps = [];
    protected string $currentStep = '';
    protected ?string $failureReason = null;
    protected bool $completed = false;

    public function __construct()
    {
        $this->steps = [
            self::STEP_CREATE_DATABASE   => self::statusEntry(),
            self::STEP_RUN_MIGRATIONS    => self::statusEntry(),
            self::STEP_RUN_SEEDERS       => self::statusEntry(),
            self::STEP_CREATE_ADMIN      => self::statusEntry(),
            self::STEP_REGISTER_DOMAIN   => self::statusEntry(),
            self::STEP_ASSIGN_PLAN       => self::statusEntry(),
            self::STEP_CREATE_ORG_RECORD => self::statusEntry(),
        ];
    }

    protected function statusEntry(): array
    {
        return [
            'status'    => self::STATUS_PENDING,
            'started_at' => null,
            'completed_at' => null,
            'duration_ms' => null,
            'error'     => null,
        ];
    }

    public function startStep(string $step): void
    {
        $this->currentStep = $step;
        $this->steps[$step]['status'] = self::STATUS_RUNNING;
        $this->steps[$step]['started_at'] = microtime(true);
    }

    public function completeStep(string $step): void
    {
        $this->steps[$step]['status'] = self::STATUS_COMPLETED;
        $this->steps[$step]['completed_at'] = microtime(true);
        $this->steps[$step]['duration_ms'] = $this->calcDuration($step);
    }

    public function failStep(string $step, string $reason): void
    {
        $this->steps[$step]['status'] = self::STATUS_FAILED;
        $this->steps[$step]['completed_at'] = microtime(true);
        $this->steps[$step]['duration_ms'] = $this->calcDuration($step);
        $this->steps[$step]['error'] = $reason;
        $this->failureReason = $reason;
    }

    public function skipStep(string $step): void
    {
        $this->steps[$step]['status'] = self::STATUS_SKIPPED;
    }

    public function rollbackStep(string $step): void
    {
        $this->steps[$step]['status'] = self::STATUS_ROLLBACK;
    }

    public function markCompleted(): void
    {
        $this->completed = true;
    }

    public function isCompleted(): bool
    {
        return $this->completed;
    }

    public function hasFailed(): bool
    {
        return $this->failureReason !== null;
    }

    public function getFailureReason(): ?string
    {
        return $this->failureReason;
    }

    public function getStep(string $step): array
    {
        return $this->steps[$step] ?? self::statusEntry();
    }

    public function getSteps(): array
    {
        return $this->steps;
    }

    public function getStepStatus(string $step): string
    {
        return $this->steps[$step]['status'] ?? self::STATUS_PENDING;
    }

    public function isStepCompleted(string $step): bool
    {
        return $this->getStepStatus($step) === self::STATUS_COMPLETED;
    }

    public function getProgressSummary(): array
    {
        $completed = 0;
        $failed = 0;
        $total = count($this->steps);

        foreach ($this->steps as $step) {
            if ($step['status'] === self::STATUS_COMPLETED) $completed++;
            if ($step['status'] === self::STATUS_FAILED) $failed++;
        }

        return [
            'total_steps'   => $total,
            'completed'     => $completed,
            'failed'        => $failed,
            'is_complete'   => $this->completed,
            'failure_reason' => $this->failureReason,
            'steps'         => $this->steps,
        ];
    }

    protected function calcDuration(string $step): ?float
    {
        $started = $this->steps[$step]['started_at'];
        $ended = $this->steps[$step]['completed_at'];

        if ($started && $ended) {
            return round(($ended - $started) * 1000, 2);
        }

        return null;
    }
}
