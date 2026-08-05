<?php

namespace Tests\Integration\Tenant;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\Infrastructure\TenantCacheManager;
use App\Services\Saas\Infrastructure\TenantStorageManager;
use App\Services\Saas\Infrastructure\TenantSessionManager;
use App\Services\Saas\Infrastructure\TenantContextLogger;
use App\Services\Saas\Infrastructure\HealthCheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TenantIsolationTest.
 *
 * Integration tests to verify complete tenant isolation:
 * - Database switching
 * - Cache isolation
 * - Storage isolation
 * - Session isolation
 * - Queue isolation
 * - Email isolation
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Ensure master DB connection is available
        config()->set('database.connections.mysql_master', [
            'driver'    => 'mysql',
            'host'      => env('DB_HOST', '127.0.0.1'),
            'port'      => env('DB_PORT', '3306'),
            'database'  => env('MASTER_DB_DATABASE', 'saas_master'),
            'username'  => env('DB_USERNAME', 'root'),
            'password'  => env('DB_PASSWORD', ''),
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);
    }

    /**
     * Test that two organizations get different database connections.
     */
    public function test_database_connection_isolation(): void
    {
        $org1 = Organization::factory()->create([
            'database_name' => 'pms_tenant_test1',
            'status' => 'active',
        ]);

        $org2 = Organization::factory()->create([
            'database_name' => 'pms_tenant_test2',
            'status' => 'active',
        ]);

        $dbService = app(DatabaseProvisionService::class);

        // Register connections for both orgs
        $dbService->registerConnection($org1);
        $dbService->registerConnection($org2);

        $conn1Name = $dbService->getConnectionName($org1->id);
        $conn2Name = $dbService->getConnectionName($org2->id);

        // Verify different connection names
        $this->assertNotEquals($conn1Name, $conn2Name);

        // Verify connection configs point to different databases
        $config1 = config("database.connections.{$conn1Name}");
        $config2 = config("database.connections.{$conn2Name}");

        $this->assertEquals('pms_tenant_test1', $config1['database']);
        $this->assertEquals('pms_tenant_test2', $config2['database']);
    }

    /**
     * Test cache key isolation between tenants.
     */
    public function test_cache_isolation(): void
    {
        $org1 = Organization::factory()->create(['slug' => 'tenant-a', 'status' => 'active']);
        $org2 = Organization::factory()->create(['slug' => 'tenant-b', 'status' => 'active']);

        $cacheManager = app(TenantCacheManager::class);

        // Set cache for tenant A
        $cacheManager->setTenant($org1);
        $cacheManager->put('dashboard', ['data' => 'org1_data'], 60);

        // Verify tenant A can read its data
        $this->assertEquals(['data' => 'org1_data'], $cacheManager->get('dashboard'));

        // Switch to tenant B — should NOT see tenant A's data
        $cacheManager->setTenant($org2);
        $this->assertNull($cacheManager->get('dashboard'));

        // Set data for tenant B
        $cacheManager->put('dashboard', ['data' => 'org2_data'], 60);
        $this->assertEquals(['data' => 'org2_data'], $cacheManager->get('dashboard'));

        // Verify tenant A's data is still separate
        $cacheManager->setTenant($org1);
        $this->assertEquals(['data' => 'org1_data'], $cacheManager->get('dashboard'));

        // Cleanup
        $cacheManager->clearTenant();
    }

    /**
     * test_cache_key_prefixing: Verify cache keys include tenant prefix.
     */
    public function test_cache_key_prefixing(): void
    {
        $org = Organization::factory()->create(['slug' => 'test-org', 'status' => 'active']);

        $cacheManager = app(TenantCacheManager::class);
        $cacheManager->setTenant($org);

        $prefixedKey = $cacheManager->prefix('my_key');
        $this->assertEquals('test-org:my_key', $prefixedKey);

        $cacheManager->clearTenant();
    }

    /**
     * test_storage_path_isolation: Verify storage paths are tenant-specific.
     */
    public function test_storage_path_isolation(): void
    {
        $org1 = Organization::factory()->create(['slug' => 'acme', 'status' => 'active']);
        $org2 = Organization::factory()->create(['slug' => 'globex', 'status' => 'active']);

        $storageManager = app(TenantStorageManager::class);

        $storageManager->setTenant($org1);
        $path1 = $storageManager->path('documents/file.pdf');

        $storageManager->setTenant($org2);
        $path2 = $storageManager->path('documents/file.pdf');

        $this->assertEquals('tenants/acme/documents/file.pdf', $path1);
        $this->assertEquals('tenants/globex/documents/file.pdf', $path2);
        $this->assertNotEquals($path1, $path2);
    }

    /**
     * test_session_prefix_isolation: Verify session keys are tenant-prefixed.
     */
    public function test_session_prefix_isolation(): void
    {
        $org1 = Organization::factory()->create(['id' => 100, 'slug' => 'org-a', 'status' => 'active']);
        $org2 = Organization::factory()->create(['id' => 200, 'slug' => 'org-b', 'status' => 'active']);

        $sessionManager = app(TenantSessionManager::class);

        $sessionManager->setTenant($org1);
        $key1 = $sessionManager->key('user_id');

        $sessionManager->setTenant($org2);
        $key2 = $sessionManager->key('user_id');

        $this->assertNotEquals($key1, $key2);
        $this->assertStringContainsString('100', $key1);
        $this->assertStringContainsString('200', $key2);
    }

    /**
     * test_tenant_context_logger: Verify logger includes tenant context.
     */
    public function test_tenant_context_logger(): void
    {
        $org = Organization::factory()->create([
            'slug' => 'test-tenant',
            'database_name' => 'pms_test',
            'status' => 'active',
        ]);

        $logger = app(TenantContextLogger::class);
        $logger->setTenant($org);
        $logger->setRequestId('req-123');

        $context = $logger->getContext();

        $this->assertEquals('test-tenant', $context['tenant']['slug']);
        $this->assertEquals('pms_test', $context['tenant']['database_name']);
        $this->assertEquals('req-123', $context['request_id']);
    }

    /**
     * test_tenant_scheduler_iteration: Verify scheduler iterates tenants.
     */
    public function test_tenant_scheduler_iteration(): void
    {
        $org1 = Organization::factory()->create(['slug' => 's1', 'status' => 'active']);
        $org2 = Organization::factory()->create(['slug' => 's2', 'status' => 'active']);
        $org3 = Organization::factory()->create(['slug' => 's3', 'status' => 'suspended']);

        $scheduler = app(\App\Services\Saas\Infrastructure\TenantScheduler::class);
        $iterated = [];

        $result = $scheduler->forEveryTenant(function (Organization $org) use (&$iterated) {
            $iterated[] = $org->slug;
        }, 'active');

        $this->assertEquals(2, $result['executed']);
        $this->assertContains('s1', $iterated);
        $this->assertContains('s2', $iterated);
        $this->assertNotContains('s3', $iterated);
    }

    /**
     * test_health_check_returns_status: Verify health check returns a result.
     */
    public function test_health_check_returns_status(): void
    {
        $healthCheck = app(HealthCheckService::class);
        $result = $healthCheck->check();

        $this->assertArrayHasKey('overall', $result);
        $this->assertArrayHasKey('master_database', $result);
        $this->assertArrayHasKey('cache', $result);
        $this->assertArrayHasKey('storage', $result);
        $this->assertArrayHasKey('mail', $result);
        $this->assertContains($result['overall'], ['healthy', 'degraded']);
    }

    /**
     * test_no_data_leak_between_tenants: Verify tenant A cannot see tenant B data.
     */
    public function test_no_data_leak_between_tenants(): void
    {
        $cacheManager = app(TenantCacheManager::class);

        $org1 = Organization::factory()->create(['slug' => 'leak-test-a', 'status' => 'active']);
        $org2 = Organization::factory()->create(['slug' => 'leak-test-b', 'status' => 'active']);

        // Tenant A writes sensitive data
        $cacheManager->setTenant($org1);
        $cacheManager->put('api_key', 'secret-key-org1', 60);

        // Tenant B should NOT see tenant A's data
        $cacheManager->setTenant($org2);
        $this->assertNull($cacheManager->get('api_key'));

        // Tenant A should see its own data
        $cacheManager->setTenant($org1);
        $this->assertEquals('secret-key-org1', $cacheManager->get('api_key'));

        $cacheManager->clearTenant();
    }
}
