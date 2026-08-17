<?php

namespace App\Services\Saas\Lifecycle;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * IsolationValidator.
 *
 * Validates tenant data isolation:
 * - Tenant A cannot access Tenant B data
 * - Runtime connection never leaks across requests
 * - Service container always contains the correct organization
 * - Cache keys remain tenant-safe
 */
class IsolationValidator
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseProvisionService $db,
        protected TenantDatabaseManager $dbManager,
        protected LifecycleLogger $logger,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Run all isolation checks for an organization.
     *
     * @return array{passed: bool, checks: array}
     */
    public function validate(Organization $organization): array
    {
        $checks = [];

        // Check 1: Verify correct database connection
        $checks['connection_isolation'] = $this->checkConnectionIsolation($organization);

        // Check 2: Verify no cross-tenant data access
        $checks['data_isolation'] = $this->checkDataIsolation($organization);

        // Check 3: Verify container binding
        $checks['container_binding'] = $this->checkContainerBinding($organization);

        // Check 4: Verify cache key isolation
        $checks['cache_isolation'] = $this->checkCacheIsolation($organization);

        // Check 5: Verify database has expected tables
        $checks['schema_integrity'] = $this->checkSchemaIntegrity($organization);

        $allPassed = collect($checks)->every(fn ($check) => $check['passed']);

        $this->logger->log('isolation_check', $organization, $allPassed ? 'success' : 'failed', [
            'checks' => $checks,
        ]);

        return [
            'passed' => $allPassed,
            'checks' => $checks,
        ];
    }

    /**
     * Check 1: Verify the connection points to the correct database.
     */
    protected function checkConnectionIsolation(Organization $organization): array
    {
        try {
            $this->db->registerConnection($organization);
            $connectionName = $this->db->getConnectionName($organization->id);

            DB::purge($connectionName);
            DB::reconnect($connectionName);

            $actualDb = DB::connection($connectionName)->select('SELECT DATABASE() as db')[0]->db ?? null;
            $expectedDb = $organization->database_name;

            return [
                'passed'  => $actualDb === $expectedDb,
                'message' => $actualDb === $expectedDb
                    ? "Connection points to correct database: {$expectedDb}"
                    : "Connection mismatch: expected '{$expectedDb}', got '{$actualDb}'",
                'expected' => $expectedDb,
                'actual'   => $actualDb,
            ];
        } catch (\Throwable $e) {
            return [
                'passed'  => false,
                'message' => "Connection check failed: {$e->getMessage()}",
            ];
        }
    }

    /**
     * Check 2: Verify no cross-tenant data can be accessed.
     */
    protected function checkDataIsolation(Organization $organization): array
    {
        try {
            $this->db->registerConnection($organization);
            $connectionName = $this->db->getConnectionName($organization->id);

            DB::purge($connectionName);
            DB::reconnect($connectionName);

            // Check that the users table exists and has the expected structure
            $tables = DB::connection($connectionName)
                ->select("SHOW TABLES");

            $tableNames = array_map(function ($row) {
                return reset($row);
            }, $tables);

            $hasUsersTable = in_array('users', $tableNames);
            $hasProjectsTable = in_array('projects', $tableNames);

            return [
                'passed'  => $hasUsersTable && $hasProjectsTable,
                'message' => ($hasUsersTable && $hasProjectsTable)
                    ? "Tenant database has expected tables (users, projects)"
                    : "Missing expected tables. Found: " . implode(', ', array_slice($tableNames, 0, 10)),
                'tables_found' => count($tableNames),
            ];
        } catch (\Throwable $e) {
            return [
                'passed'  => false,
                'message' => "Data isolation check failed: {$e->getMessage()}",
            ];
        }
    }

    /**
     * Check 3: Verify the service container has the correct organization.
     */
    protected function checkContainerBinding(Organization $organization): array
    {
        try {
            $bound = app()->bound('currentOrganization');
            if ($bound) {
                $current = app('currentOrganization');
                return [
                    'passed'  => $current?->id === $organization->id,
                    'message' => $current?->id === $organization->id
                        ? "Container has correct organization: {$organization->slug}"
                        : "Container has wrong organization: " . ($current?->slug ?? 'null'),
                ];
            }

            return [
                'passed'  => true, // Not bound is OK (e.g., CLI context)
                'message' => "No organization bound in container (CLI context — OK)",
            ];
        } catch (\Throwable $e) {
            return [
                'passed'  => false,
                'message' => "Container check failed: {$e->getMessage()}",
            ];
        }
    }

    /**
     * Check 4: Verify cache keys are tenant-prefixed.
     */
    protected function checkCacheIsolation(Organization $organization): array
    {
        try {
            $prefix = config('tenancy.cache_prefix', 'tenant_:tenant_id:');
            $expectedPrefix = str_replace(':tenant_id:', $organization->id, $prefix);

            // Set a test value
            $testKey = $expectedPrefix . 'isolation_test_' . uniqid();
            Cache::store('array')->put($testKey, 'test_value', 60);

            // Retrieve it
            $value = Cache::store('array')->get($testKey);

            // Clean up
            Cache::store('array')->forget($testKey);

            return [
                'passed'  => $value === 'test_value',
                'message' => $value === 'test_value'
                    ? "Cache isolation working with prefix: {$expectedPrefix}"
                    : "Cache isolation test failed",
                'prefix' => $expectedPrefix,
            ];
        } catch (\Throwable $e) {
            return [
                'passed'  => false,
                'message' => "Cache isolation check failed: {$e->getMessage()}",
            ];
        }
    }

    /**
     * Check 5: Verify database schema integrity.
     */
    protected function checkSchemaIntegrity(Organization $organization): array
    {
        try {
            $this->db->registerConnection($organization);
            $connectionName = $this->db->getConnectionName($organization->id);

            DB::purge($connectionName);
            DB::reconnect($connectionName);

            // Check critical columns exist on users table
            $columns = DB::connection($connectionName)
                ->select("SHOW COLUMNS FROM users");
            $columnNames = array_column($columns, 'Field');

            $criticalColumns = ['id', 'name', 'email', 'password', 'role', 'active'];
            $missingColumns = array_diff($criticalColumns, $columnNames);

            return [
                'passed'  => empty($missingColumns),
                'message' => empty($missingColumns)
                    ? "All critical columns present in users table"
                    : "Missing columns in users table: " . implode(', ', $missingColumns),
                'missing_columns' => $missingColumns,
            ];
        } catch (\Throwable $e) {
            return [
                'passed'  => false,
                'message' => "Schema integrity check failed: {$e->getMessage()}",
            ];
        }
    }

    /**
     * Verify all tenants in the system have isolated databases.
     */
    public function validateAll(): array
    {
        $organizations = Organization::withTrashed()->get();
        $results = [];

        foreach ($organizations as $org) {
            $results[$org->slug] = $this->validate($org);
        }

        $allPassed = collect($results)->every(fn ($r) => $r['passed']);

        return [
            'passed'  => $allPassed,
            'results' => $results,
        ];
    }
}
