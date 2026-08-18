<?php

namespace App\Http\Middleware;

use App\Services\Saas\TenantResolver;
use App\Services\Saas\TenantDatabaseManager;
use App\Services\Saas\SubscriptionService;
use App\Services\Saas\Lifecycle\OrganizationStateMachine;
use App\Services\Saas\Infrastructure\TenantCacheManager;
use App\Services\Saas\Infrastructure\TenantSessionManager;
use App\Services\Saas\Infrastructure\TenantStorageManager;
use App\Services\Saas\Infrastructure\TenantMailManager;
use App\Services\Saas\Infrastructure\TenantFilesystemManager;
use App\Services\Saas\Infrastructure\TenantContextLogger;
use App\Models\Master\Organization;
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

        // An authenticated bearer token is authoritative. This prevents a stale
        // browser X-Tenant-ID (for example "techxaro") from switching a Farhan
        // user's request into the wrong organization database.
        $tokenOrganization = $this->resolveFromBearerToken($request);

        if ($tokenOrganization) {
            $organization = $tokenOrganization;
        // If no tenant identifier is present, try resolving from the bearer token.
        // This handles localhost development where no subdomain/header is available.
        } elseif (!$this->resolver->hasTenantIdentifier($request)) {
            $organization = $this->resolveFromBearerToken($request);
            if (!$organization) {
                return $next($request);
            }
            // Fall through to status check and DB switch below
        } else {
            // Resolve the organization from the request (header or subdomain)
            $organization = $this->resolver->resolve($request);

            // If header/subdomain resolution failed, try bearer token as fallback
            if (!$organization) {
                $organization = $this->resolveFromBearerToken($request);
            }

            // If still no org and no bearer token, pass through gracefully
            if (!$organization) {
                return $next($request);
            }
        }

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

        // Auto-renew expired subscriptions (non-blocking, best-effort)
        try {
            $subscriptionService = app(SubscriptionService::class);
            $subscriptionService->renewExpiredSubscription($organization);
        } catch (\Throwable $e) {
            \Log::warning("Failed to auto-renew subscription for org: {$organization->slug}", [
                'error' => $e->getMessage(),
            ]);
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

        $response = $next($request);
        $response->headers->set('X-Tenant-Slug', $organization->slug);

        return $response;
    }

    /**
     * Resolve the tenant from a PMS bearer token stored in saas_master.
     *
     * When running on localhost (no subdomain/header), the tenant is resolved
     * by looking up the token hash in saas_master.personal_access_tokens
     * and reading the tenant slug encoded in the token name.
     */
    private function resolveFromBearerToken(Request $request): ?Organization
    {
        $token = $request->bearerToken();
        if (!$token) {
            return null;
        }

        try {
            $tokenHash = hash('sha256', $token);
            $record = DB::connection('mysql_master')
                ->table('personal_access_tokens')
                ->where('token', $tokenHash)
                ->where('name', 'LIKE', 'pms_token|%')
                ->first();

            if (!$record) {
                return null;
            }

            // Extract tenant slug from token name: "pms_token|{slug}"
            $slug = substr($record->name, strlen('pms_token|'));

            if (!empty($slug)) {
                $org = Organization::where('slug', $slug)->first();
                if ($org) {
                    return $org;
                }
            }

            // Backward-compatible fallback for mappings created without a slug:
            // locate the tenant that actually contains this Sanctum token. User
            // IDs cannot identify a tenant because IDs (especially admin ID 1)
            // are routinely repeated across tenant databases.
            $tokenValue = str_contains($token, '|')
                ? substr($token, strpos($token, '|') + 1)
                : $token;
            $sanctumTokenHash = hash('sha256', $tokenValue);
            $activeOrgs = Organization::whereIn('status', ['active', 'trial'])->get();

            foreach ($activeOrgs as $org) {
                try {
                    $pdo = new \PDO(
                        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $org->database_host, (int) $org->database_port, $org->database_name),
                        $org->database_username,
                        $org->database_password ?? '',
                        [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_TIMEOUT => 2]
                    );
                    $stmt = $pdo->prepare('SELECT id FROM personal_access_tokens WHERE token = ? LIMIT 1');
                    $stmt->execute([$sanctumTokenHash]);
                    if ($stmt->fetch()) {
                        return $org;
                    }
                } catch (\Throwable $e) {
                    continue;
                }
            }

            return null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
