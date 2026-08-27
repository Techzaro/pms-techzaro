<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

/**
 * DatabaseProvisionService.
 *
 * Responsible ONLY for database-level operations:
 * - Creating tenant databases
 * - Running migrations on tenant databases
 * - Registering dynamic database connections
 * - Dropping databases
 *
 * Uses cPanel API when configured (shared hosting), falls back to raw SQL.
 */
class DatabaseProvisionService
{
    protected string $masterConnection;
    protected ?CPanelDatabaseService $cpanel;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
        $this->cpanel = app(CPanelDatabaseService::class);
    }

    /**
     * Create a new MySQL database.
     */
    public function createDatabase(string $databaseName): void
    {
        if ($this->cpanel->isConfigured()) {
            $this->cpanel->createDatabase($databaseName);
            $this->cpanel->grantAllPrivileges($databaseName, config('database.connections.mysql_master.username', ''));
            return;
        }

        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$escaped}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }

    /**
     * Drop a MySQL database (destructive).
     */
    public function dropDatabase(string $databaseName): void
    {
        if ($this->cpanel->isConfigured()) {
            $this->cpanel->dropDatabase($databaseName);
            return;
        }

        $pdo = DB::connection($this->masterConnection)->getPdo();
        $escaped = str_replace('`', '``', $databaseName);
        $pdo->exec("DROP DATABASE IF EXISTS `{$escaped}`");
    }

    /**
     * Run all tenant migrations on a specific database.
     */
    public function runMigrations(string $databaseName): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant', [
            'driver'    => 'mysql',
            'host'      => $masterConfig['host'],
            'port'      => $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $masterConfig['username'],
            'password'  => $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        Artisan::call('migrate', [
            '--database' => 'tenant',
            '--force'    => true,
        ]);
    }

    /**
     * Run the HRM migration set against one tenant database.
     *
     * The fast tenant schema snapshot predates HRM, so these migrations must be
     * applied after importing that snapshot. Laravel records each applied file
     * in the tenant's migrations table, making this safe to run repeatedly.
     */
    public function runHrmMigrations(string $databaseName): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");

        config()->set('database.connections.tenant', [
            'driver'    => 'mysql',
            'host'      => $masterConfig['host'],
            'port'      => $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $masterConfig['username'],
            'password'  => $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        DB::purge('tenant');

        $files = glob(database_path('migrations/*hrm*.php')) ?: [];

        sort($files);
        foreach (array_unique($files) as $file) {
            Artisan::call('migrate', [
                '--database' => 'tenant',
                '--path'     => 'database/migrations/' . basename($file),
                '--realpath' => false,
                '--force'    => true,
            ]);
        }

        $requiredTables = [
            'hrm_job_openings',
            'hrm_candidates',
            'hrm_offer_letters',
            'hrm_employee_documents',
            'hrm_attendances',
            'hrm_leave_requests',
            'hrm_timesheets',
            'hrm_shift_templates',
            'hrm_department_policies',
            'hrm_warnings',
            'hrm_performance_goals',
            'hrm_member_requests',
            'hrm_workflows',
            'hrm_workflow_steps',
            'hrm_esign_envelopes',
            'hrm_esign_documents',
            'hrm_esign_tokens',
            'hrm_esign_events',
        ];

        $missing = array_values(array_filter(
            $requiredTables,
            fn (string $table) => !Schema::connection('tenant')->hasTable($table)
        ));

        if ($missing !== []) {
            throw new \RuntimeException('Missing HRM tables after migration: ' . implode(', ', $missing));
        }
    }

    /** Normalize legacy tenant rows to the tenant's real master organization ID. */
    public function normalizeTenantOrganizationIds(string $databaseName, int $organizationId): void
    {
        $this->registerNamedTenantConnection($databaseName);

        $tables = [
            'users',
            'hrm_application_types',
            'hrm_application_fields',
            'hrm_member_requests',
            'hrm_member_request_fields',
            'hrm_request_histories',
            'hrm_workflows',
            'hrm_approval_workflows',
        ];

        foreach ($tables as $table) {
            if (Schema::connection('tenant')->hasTable($table)
                && Schema::connection('tenant')->hasColumn($table, 'organization_id')) {
                DB::connection('tenant')->table($table)->update(['organization_id' => $organizationId]);
            }
        }
    }

    /** Restore configured chains for pending requests that received the legacy Admin fallback. */
    public function repairPendingHrmApprovalChains(string $databaseName, int $organizationId): void
    {
        $this->registerNamedTenantConnection($databaseName);
        $db = DB::connection('tenant');

        if (!Schema::connection('tenant')->hasTable('hrm_member_requests')
            || !Schema::connection('tenant')->hasTable('hrm_request_approvals')
            || !Schema::connection('tenant')->hasTable('hrm_workflows')) {
            return;
        }

        $requests = $db->table('hrm_member_requests')
            ->where('organization_id', $organizationId)
            ->where('status', 'Pending')
            ->get();

        foreach ($requests as $request) {
            $approvals = $db->table('hrm_request_approvals')->where('request_id', $request->id)->get();
            $isUntouchedFallback = $approvals->count() === 1
                && $approvals->first()->status === 'Pending'
                && $approvals->first()->approver_id === 'Admin';

            if (!$isUntouchedFallback) {
                continue;
            }

            $employee = $db->table('users')->where('id', $request->employee_id)->first();
            if (!$employee) {
                continue;
            }

            $workflows = $db->table('hrm_workflows')
                ->where('organization_id', $organizationId)
                ->when($employee->department ?? null, fn ($query, $department) => $query->where('department', $department))
                ->latest('created_at')
                ->get()
                ->filter(function ($workflow) use ($request) {
                    $types = json_decode($workflow->application_types ?? '[]', true) ?: [];
                    return in_array($request->application_type, $types, true);
                });

            $workflow = $workflows->first(function ($workflow) use ($employee) {
                $submitters = json_decode($workflow->submitter_role ?? '[]', true) ?: [];
                return in_array((string) $employee->id, array_map('strval', $submitters), true);
            }) ?? $workflows->first(function ($workflow) use ($employee) {
                $submitters = json_decode($workflow->submitter_role ?? '[]', true) ?: [];
                return in_array((string) ($employee->role ?? ''), array_map('strval', $submitters), true);
            }) ?? $workflows->first(function ($workflow) {
                $submitters = json_decode($workflow->submitter_role ?? '[]', true) ?: [];
                return $submitters === [];
            }) ?? $workflows->first();

            if (!$workflow) {
                continue;
            }

            $steps = $db->table('hrm_workflow_steps')
                ->where('hrm_workflow_id', $workflow->id)
                ->orderBy('step_order')
                ->get();

            if ($steps->isEmpty()) {
                continue;
            }

            $db->transaction(function () use ($db, $request, $steps) {
                $db->table('hrm_request_approvals')->where('request_id', $request->id)->delete();
                foreach ($steps as $step) {
                    $db->table('hrm_request_approvals')->insert([
                        'request_id' => $request->id,
                        'step_order' => $step->step_order,
                        'approver_type' => $step->approver_type,
                        'approver_id' => $step->approver_id,
                        'status' => 'Pending',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });
        }
    }

    private function registerNamedTenantConnection(string $databaseName): void
    {
        $masterConfig = config("database.connections.{$this->masterConnection}");
        config()->set('database.connections.tenant', [
            'driver' => 'mysql',
            'host' => $masterConfig['host'],
            'port' => $masterConfig['port'],
            'database' => $databaseName,
            'username' => $masterConfig['username'],
            'password' => $masterConfig['password'] ?? '',
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'strict' => true,
        ]);
        DB::purge('tenant');
    }

    /**
     * Register a tenant's database connection dynamically at runtime.
     */
    public function registerConnection(Organization $organization): void
    {
        $name = $this->getConnectionName($organization->id);

        config()->set("database.connections.{$name}", [
            'driver'    => 'mysql',
            'host'      => $organization->database_host,
            'port'      => $organization->database_port,
            'database'  => $organization->database_name,
            'username'  => $organization->database_username,
            'password'  => $organization->database_password ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);
    }

    /**
     * Get the connection name for a tenant.
     */
    public function getConnectionName(int $organizationId): string
    {
        return 'tenant_' . $organizationId;
    }
}
