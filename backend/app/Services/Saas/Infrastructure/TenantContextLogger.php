<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * TenantContextLogger.
 *
 * Enriches all log entries with tenant context:
 * - Tenant slug and ID
 * - Database name
 * - User ID
 * - Request ID
 * - Route
 * - Execution time
 */
class TenantContextLogger
{
    protected ?Organization $organization = null;
    protected ?string $requestId = null;
    protected float $requestStart = 0;

    /**
     * Set the tenant context for logging.
     */
    public function setTenant(Organization $organization): void
    {
        $this->organization = $organization;
    }

    /**
     * Set the request ID for correlation.
     */
    public function setRequestId(string $requestId): void
    {
        $this->requestId = $requestId;
    }

    /**
     * Start timing the request.
     */
    public function startTimer(): void
    {
        $this->requestStart = microtime(true);
    }

    /**
     * Get the elapsed time in milliseconds.
     */
    public function getElapsedMs(): float
    {
        return round((microtime(true) - $this->requestStart) * 1000, 2);
    }

    /**
     * Get the full tenant context for logging.
     */
    public function getContext(): array
    {
        $context = [
            'request_id' => $this->requestId ?? Str::uuid()->toString(),
        ];

        if ($this->organization) {
            $context['tenant'] = [
                'id'            => $this->organization->id,
                'slug'          => $this->organization->slug,
                'database_name' => $this->organization->database_name,
            ];
        }

        // Add request context if available
        if (app()->bound('request')) {
            $request = app('request');
            $context['route'] = $request->route()?->getName() ?? $request->path();
            $context['method'] = $request->method();
            $context['ip'] = $request->ip();
        }

        // Add user context
        if (auth()->check()) {
            $context['user_id'] = auth()->id();
        }

        $context['execution_ms'] = $this->getElapsedMs();

        return $context;
    }

    /**
     * Log a message with tenant context.
     */
    public function log(string $level, string $message, array $extra = []): void
    {
        $context = array_merge($this->getContext(), $extra);
        Log::$level("{$this->getTenantPrefix()}{$message}", $context);
    }

    /**
     * Log an info message with tenant context.
     */
    public function info(string $message, array $extra = []): void
    {
        $this->log('info', $message, $extra);
    }

    /**
     * Log a warning message with tenant context.
     */
    public function warning(string $message, array $extra = []): void
    {
        $this->log('warning', $message, $extra);
    }

    /**
     * Log an error message with tenant context.
     */
    public function error(string $message, array $extra = []): void
    {
        $this->log('error', $message, $extra);
    }

    /**
     * Log a debug message with tenant context.
     */
    public function debug(string $message, array $extra = []): void
    {
        $this->log('debug', $message, $extra);
    }

    /**
     * Get a prefix for log messages.
     */
    protected function getTenantPrefix(): string
    {
        if ($this->organization) {
            return "[{$this->organization->slug}] ";
        }
        return '';
    }

    /**
     * Clear the logging context.
     */
    public function clear(): void
    {
        $this->organization = null;
        $this->requestId = null;
        $this->requestStart = 0;
    }
}
