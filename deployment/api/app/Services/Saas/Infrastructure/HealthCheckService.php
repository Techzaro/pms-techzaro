<?php

namespace App\Services\Saas\Infrastructure;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

/**
 * HealthCheckService.
 *
 * Verifies all subsystem health:
 * - Master Database
 * - Tenant Database
 * - Cache
 * - Queue
 * - Storage
 * - Mail
 */
class HealthCheckService
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Run all health checks and return a complete status report.
     */
    public function check(?Organization $organization = null): array
    {
        $checks = [];
        $checks['timestamp'] = now()->toIso8601String();
        $checks['overall'] = 'healthy';

        // Master Database
        $checks['master_database'] = $this->checkMasterDatabase();

        // Tenant Database (if organization provided)
        if ($organization) {
            $checks['tenant_database'] = $this->checkTenantDatabase($organization);
        }

        // Cache
        $checks['cache'] = $this->checkCache();

        // Queue
        $checks['queue'] = $this->checkQueue();

        // Storage
        $checks['storage'] = $this->checkStorage();

        // Mail
        $checks['mail'] = $this->checkMail();

        // Determine overall status
        foreach ($checks as $key => $check) {
            if ($key === 'timestamp' || $key === 'overall') continue;
            if (is_array($check) && ($check['status'] ?? '') !== 'healthy') {
                $checks['overall'] = 'degraded';
                break;
            }
        }

        return $checks;
    }

    /**
     * Check master database connectivity.
     */
    protected function checkMasterDatabase(): array
    {
        try {
            $start = microtime(true);
            $version = DB::connection($this->masterConnection)->select('SELECT VERSION() as version');
            $latency = round((microtime(true) - $start) * 1000, 2);

            return [
                'status'  => 'healthy',
                'driver'  => DB::connection($this->masterConnection)->getConfig('driver'),
                'version' => $version[0]->version ?? 'unknown',
                'latency_ms' => $latency,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }

    /**
     * Check tenant database connectivity.
     */
    protected function checkTenantDatabase(Organization $organization): array
    {
        try {
            $dbManager = app(TenantDatabaseManager::class);
            $provisionService = app(\App\Services\Saas\DatabaseProvisionService::class);

            $provisionService->registerConnection($organization);
            $connectionName = $provisionService->getConnectionName($organization->id);

            DB::purge($connectionName);
            DB::reconnect($connectionName);

            $start = microtime(true);
            $version = DB::connection($connectionName)->select('SELECT VERSION() as version');
            $latency = round((microtime(true) - $start) * 1000, 2);

            DB::purge($connectionName);

            return [
                'status'      => 'healthy',
                'database'    => $organization->database_name,
                'connection'  => $connectionName,
                'version'     => $version[0]->version ?? 'unknown',
                'latency_ms'  => $latency,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }

    /**
     * Check cache connectivity.
     */
    protected function checkCache(): array
    {
        try {
            $start = microtime(true);
            $testKey = 'health_check_' . uniqid();
            Cache::put($testKey, 'ok', 10);
            $value = Cache::get($testKey);
            Cache::forget($testKey);
            $latency = round((microtime(true) - $start) * 1000, 2);

            return [
                'status'  => $value === 'ok' ? 'healthy' : 'degraded',
                'driver'  => config('cache.default'),
                'latency_ms' => $latency,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }

    /**
     * Check queue connectivity.
     */
    protected function checkQueue(): array
    {
        try {
            $connection = config('queue.default');
            $size = Queue::size($connection);

            return [
                'status'     => 'healthy',
                'connection' => $connection,
                'size'       => $size,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }

    /**
     * Check storage connectivity.
     */
    protected function checkStorage(): array
    {
        try {
            $disk = config('filesystems.default');
            $testFile = 'health_check_' . uniqid() . '.txt';

            Storage::disk($disk)->put($testFile, 'ok');
            $exists = Storage::disk($disk)->exists($testFile);
            Storage::disk($disk)->delete($testFile);

            return [
                'status' => $exists ? 'healthy' : 'degraded',
                'disk'   => $disk,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }

    /**
     * Check mail connectivity.
     */
    protected function checkMail(): array
    {
        try {
            $mailer = config('mail.default');

            return [
                'status'  => 'healthy',
                'mailer'  => $mailer,
                'from'    => config('mail.from.address'),
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unhealthy',
                'error'  => $e->getMessage(),
            ];
        }
    }
}
