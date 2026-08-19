<?php

namespace App\Services\Saas\Provisioning;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationDomain;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * ProvisioningOrchestrator.
 *
 * Main coordinator for the tenant provisioning workflow.
 * Orchestrates all provisioning steps in the correct order,
 * handles rollback on failure, and provides detailed logging.
 *
 * Flow:
 * 1. Create Organization Record (master DB)
 * 2. Create Tenant Database
 * 3. Run Tenant Migrations
 * 4. Run Tenant Seeders
 * 5. Create Administrator User (tenant DB)
 * 6. Register Domain (master DB)
 * 7. Assign Plan (master DB)
 */
class ProvisioningOrchestrator
{
    public function __construct(
        protected DatabaseCreator $databaseCreator,
        protected TenantMigrationRunner $migrationRunner,
        protected TenantSeederRunner $seederRunner,
        protected AdministratorCreator $adminCreator,
        protected DomainRegistrar $domainRegistrar,
        protected PlanAssigner $planAssigner,
    ) {}

    /**
     * Provision a new tenant with all required resources.
     *
     * @param array $data Provisioning data.
     *
     * @return array{organization: Organization, status: ProvisioningStatus}
     * @throws \RuntimeException If provisioning fails.
     */
    public function provision(array $data): array
    {
        $status = new ProvisioningStatus();
        $dbName = $data['database_name'] ?? config('tenancy.database_prefix', 'pms_tenant_') . $data['slug'];
        $organization = null;
        $domainRecord = null;

        Log::info("Starting tenant provisioning", [
            'name'         => $data['name'],
            'slug'         => $data['slug'],
            'database'     => $dbName,
            'domain'       => $data['domain'] ?? 'N/A',
            'admin_email'  => $data['admin_email'] ?? 'N/A',
        ]);

        try {
            // Step 1: Create Organization Record (master DB)
            $status->startStep(ProvisioningStatus::STEP_CREATE_ORG_RECORD);
            $organization = $this->createOrganizationRecord($data);
            $status->completeStep(ProvisioningStatus::STEP_CREATE_ORG_RECORD);

            // Step 2: Create Tenant Database
            $status->startStep(ProvisioningStatus::STEP_CREATE_DATABASE);
            $this->databaseCreator->create($dbName);
            $status->completeStep(ProvisioningStatus::STEP_CREATE_DATABASE);

            // Step 3: Run Tenant Migrations
            $status->startStep(ProvisioningStatus::STEP_RUN_MIGRATIONS);
            $this->migrationRunner->run($dbName);
            $status->completeStep(ProvisioningStatus::STEP_RUN_MIGRATIONS);

            // Step 3b: Fix missing columns (migration safety net)
            try {
                \App\Console\Commands\FixTenantColumns::fixDatabaseProgrammatic($dbName);
                Log::info("Tenant column fixes applied", ['database' => $dbName]);
            } catch (\Throwable $e) {
                Log::warning("Column fix step failed (non-fatal)", ['error' => $e->getMessage()]);
            }

            // Step 4: Run Tenant Seeders
            $status->startStep(ProvisioningStatus::STEP_RUN_SEEDERS);
            $this->seederRunner->run(
                $dbName,
                $data['admin_name'] ?? 'Administrator',
                $data['admin_email'] ?? 'admin@example.com',
                $data['admin_password'] ?? 'password',
            );
            $status->completeStep(ProvisioningStatus::STEP_RUN_SEEDERS);

            // Step 5: Create Administrator User (in tenant DB)
            $status->startStep(ProvisioningStatus::STEP_CREATE_ADMIN);
            $this->adminCreator->create(
                $dbName,
                $data['admin_name'] ?? 'Administrator',
                $data['admin_email'] ?? 'admin@example.com',
                $data['admin_password'] ?? 'password',
            );
            $status->completeStep(ProvisioningStatus::STEP_CREATE_ADMIN);

            // Step 6: Register Domain (master DB)
            if (!empty($data['domain'])) {
                $status->startStep(ProvisioningStatus::STEP_REGISTER_DOMAIN);
                $domainRecord = $this->domainRegistrar->register(
                    $organization,
                    $data['domain'],
                    true,
                    true,
                );
                $status->completeStep(ProvisioningStatus::STEP_REGISTER_DOMAIN);
            } else {
                $status->skipStep(ProvisioningStatus::STEP_REGISTER_DOMAIN);
            }

            // Step 7: Assign Plan (master DB)
            $status->startStep(ProvisioningStatus::STEP_ASSIGN_PLAN);
            $this->planAssigner->assign(
                $organization,
                $data['plan'] ?? null,
                $data['billing_period'] ?? 'monthly',
            );
            $status->completeStep(ProvisioningStatus::STEP_ASSIGN_PLAN);

            // Mark as completed
            $status->markCompleted();

            Log::info("Tenant provisioning completed successfully", [
                'organization_id' => $organization->id,
                'slug'            => $organization->slug,
                'database'        => $dbName,
            ]);

            return [
                'organization' => $organization,
                'status'       => $status,
            ];
        } catch (\Throwable $e) {
            Log::error("Tenant provisioning failed", [
                'slug'    => $data['slug'] ?? 'unknown',
                'step'    => $status->getProgressSummary()['steps'],
                'error'   => $e->getMessage(),
            ]);

            // Attempt rollback
            $this->rollback($status, $dbName, $organization, $domainRecord);

            throw new \RuntimeException(
                "Provisioning failed: {$e->getMessage()}",
                previous: $e,
            );
        }
    }

    /**
     * Create the organization record in the master database.
     */
    protected function createOrganizationRecord(array $data): Organization
    {
        $masterConnection = config('tenancy.master_connection', 'mysql_master');

        return DB::connection($masterConnection)->transaction(function () use ($data) {
            $dbName = $data['database_name'] ?? config('tenancy.database_prefix', 'pms_tenant_') . $data['slug'];

            return Organization::create([
                'name'              => $data['name'],
                'slug'              => $data['slug'],
                'admin_name'        => $data['admin_name'] ?? null,
                'admin_email'       => $data['admin_email'] ?? null,
                'database_name'     => $dbName,
                'database_host'     => $data['database_host'] ?? config('tenancy.default_database.host'),
                'database_port'     => $data['database_port'] ?? config('tenancy.default_database.port'),
                'database_username' => $data['database_username'] ?? config('tenancy.default_database.username'),
                'database_password' => $data['database_password'] ?? config('tenancy.default_database.password'),
                'type'              => $data['type'] ?? 'standard',
                'status'            => $data['status'] ?? 'active',
                'timezone'          => $data['timezone'] ?? 'Asia/Karachi',
                'settings'          => $data['settings'] ?? null,
                'trial_ends_at'     => $data['trial_ends_at'] ?? null,
            ]);
        });
    }

    /**
     * Rollback completed provisioning steps in reverse order.
     */
    protected function rollback(
        ProvisioningStatus $status,
        string $dbName,
        ?Organization $organization,
        ?OrganizationDomain $domainRecord,
    ): void {
        Log::warning("Starting provisioning rollback", ['database' => $dbName]);

        // Rollback in reverse order of completion
        $steps = $status->getSteps();

        // Rollback plan assignment (subscriptions are soft — can leave them)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_ASSIGN_PLAN)) {
            $status->rollbackStep(ProvisioningStatus::STEP_ASSIGN_PLAN);
        }

        // Rollback domain registration
        if ($status->isStepCompleted(ProvisioningStatus::STEP_REGISTER_DOMAIN) && $domainRecord) {
            try {
                $this->domainRegistrar->remove($domainRecord->id);
                $status->rollbackStep(ProvisioningStatus::STEP_REGISTER_DOMAIN);
            } catch (\Throwable $e) {
                Log::error("Failed to rollback domain registration", ['error' => $e->getMessage()]);
            }
        }

        // Rollback admin creation (user created via raw query — hard to remove without model)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_CREATE_ADMIN)) {
            $status->rollbackStep(ProvisioningStatus::STEP_CREATE_ADMIN);
        }

        // Rollback seeders (data is in tenant DB — will be dropped with database)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_RUN_SEEDERS)) {
            $status->rollbackStep(ProvisioningStatus::STEP_RUN_SEEDERS);
        }

        // Rollback migrations (tables are in tenant DB — will be dropped with database)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_RUN_MIGRATIONS)) {
            $status->rollbackStep(ProvisioningStatus::STEP_RUN_MIGRATIONS);
        }

        // Rollback database creation (DROP the database)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_CREATE_DATABASE)) {
            try {
                $this->databaseCreator->drop($dbName);
                $status->rollbackStep(ProvisioningStatus::STEP_CREATE_DATABASE);
            } catch (\Throwable $e) {
                Log::error("Failed to rollback database creation", ['error' => $e->getMessage()]);
            }
        }

        // Rollback organization record (soft-delete, don't hard delete)
        if ($status->isStepCompleted(ProvisioningStatus::STEP_CREATE_ORG_RECORD) && $organization) {
            try {
                $organization->delete();
                $status->rollbackStep(ProvisioningStatus::STEP_CREATE_ORG_RECORD);
            } catch (\Throwable $e) {
                Log::error("Failed to rollback organization record", ['error' => $e->getMessage()]);
            }
        }

        Log::warning("Provisioning rollback completed");
    }
}
