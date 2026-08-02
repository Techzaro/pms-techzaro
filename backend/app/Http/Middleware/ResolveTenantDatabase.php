<?php

namespace App\Http\Middleware;

use App\Services\Saas\TenantResolver;
use App\Services\Saas\TenantDatabaseManager;
use App\Services\Saas\Lifecycle\OrganizationStateMachine;
use App\Services\Saas\Infrastructure\TenantCacheManager;
use App\Services\Saas\Infrastructure\TenantSessionManager;
use App\Services\Saas\Infrastructure\TenantStorageManager;
use App\Services\Saas\Infrastructure\TenantMailManager;
use App\Services\Saas\Infrastructure\TenantFilesystemManager;
use App\Services\Saas\Infrastructure\TenantContextLogger;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * ResolveTenantDatabase Middleware.
 *
 * Core multi-tenant middleware that:
 * 1. Skips resolution for central routes
 * 2. Resolves organization from the request
 * 3. Validates organization status
 * 4. Switches DB connection
 * 5. Sets up all isolation context (cache, session, storage, mail, filesystem, logging)
 * 6. Binds currentOrganization in the container
 */
class ResolveTenantDatabase
{
    public function __construct(
        protected TenantResolver $resolver,
        protected TenantDatabaseManager $dbManager,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        // Start request timing
        $logger = app(TenantContextLogger::class);
        $logger->startTimer();
        $logger->setRequestId($request->header('X-Request-ID', uniqid()));

        // Skip tenant resolution for central routes
        if ($this->resolver->isCentralRoute($request)) {
            return $next($request);
        }

        // If no tenant identifier is present, pass through gracefully.
        // This allows existing PMS routes to work on localhost without
        // a tenant subdomain or header.
        if (!$this->resolver->hasTenantIdentifier($request)) {
            return $next($request);
        }

        // Resolve the organization from the request
        $organization = $this->resolver->resolve($request);

        if (!$organization) {
            return response()->json([
                'success' => false,
                'message' => 'Tenant not found. Please provide a valid tenant identifier.',
            ], 404);
        }

        // Validate organization status — block all non-usable states
        $stateMachine = app(OrganizationStateMachine::class);

        if ($stateMachine->blocksRequests($organization->status)) {
            $message = match ($organization->status) {
                OrganizationStateMachine::STATE_SUSPENDED =>
                    'This organization has been suspended. Please contact support.',
                OrganizationStateMachine::STATE_ARCHIVED =>
                    'This organization has been archived. Please contact support to restore access.',
                OrganizationStateMachine::STATE_DRAFT =>
                    'This organization is not yet active. Please complete setup.',
                OrganizationStateMachine::STATE_DELETED =>
                    'This organization no longer exists.',
                default =>
                    'This organization is not available.',
            };

            $statusCode = in_array($organization->status, [
                OrganizationStateMachine::STATE_DELETED,
                OrganizationStateMachine::STATE_DRAFT,
            ], true) ? 404 : 403;

            return response()->json([
                'success' => false,
                'message' => $message,
                'status'  => $organization->status,
            ], $statusCode);
        }

        // Switch the database connection to this tenant's database
        try {
            $this->dbManager->switchTo($organization);

            // Also reconfigure the default 'mysql' connection to the tenant's DB
            // so Sanctum can find tokens stored during cross-tenant login
            config()->set('database.connections.mysql.host', $organization->database_host);
            config()->set('database.connections.mysql.port', $organization->database_port);
            config()->set('database.connections.mysql.database', $organization->database_name);
            config()->set('database.connections.mysql.username', $organization->database_username);
            config()->set('database.connections.mysql.password', $organization->database_password ?? '');
            DB::purge('mysql');
            DB::reconnect('mysql');
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to connect to tenant database. Please try again later.',
            ], 500);
        }

        // Set up all isolation context
        app(TenantCacheManager::class)->setTenant($organization);
        app(TenantSessionManager::class)->setTenant($organization);
        app(TenantStorageManager::class)->setTenant($organization);
        app(TenantMailManager::class)->setTenant($organization);
        app(TenantFilesystemManager::class)->setTenant($organization);
        $logger->setTenant($organization);

        // Bind currentOrganization in the container for injection anywhere
        app()->bind('currentOrganization', fn () => $organization);

        // Also set the organization on the request for easy access
        $request->attributes->set('currentOrganization', $organization);
        $request->attributes->set('tenantConnectionName', $this->dbManager->getCurrentConnectionName());

        return $next($request);
    }
}
