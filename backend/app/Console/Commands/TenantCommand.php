<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use App\Services\Saas\OrganizationService;
use App\Services\Saas\DatabaseProvisionService;
use App\Services\Saas\ModuleService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Artisan command for SaaS tenant management.
 *
 * Usage:
 *   php artisan tenant:create --name="Acme" --slug="acme"
 *   php artisan tenant:list
 *   php artisan tenant:info {slug}
 *   php artisan tenant:suspend {slug}
 *   php artisan tenant:activate {slug}
 *   php artisan tenant:delete {slug}
 *   php artisan tenant:migrate {slug}
 *   php artisan tenant:setup-master
 *   php artisan tenant:stats
 */
class TenantCommand extends Command
{
    protected $signature = 'tenant:manage {action?} {slugOrId?}
                            {--name= : Organization name}
                            {--slug= : URL-friendly slug}
                            {--database= : Database name}
                            {--domain= : Primary domain/subdomain}
                            {--type= : Organization type (owner, standard)}
                            {--status= : Status (active, inactive, suspended, trial)}';

    protected $description = 'Manage existing SaaS tenants (list, info, suspend, activate, delete, migrate)';

    public function handle(
        OrganizationService $orgs,
        DatabaseProvisionService $db,
        ModuleService $modules,
    ): int {
        $action = $this->argument('action') ?? 'list';

        return match ($action) {
            'create'       => $this->createTenant($orgs),
            'list'         => $this->listTenants($orgs),
            'info'         => $this->showTenantInfo($orgs),
            'suspend'      => $this->suspendTenant($orgs),
            'activate'     => $this->activateTenant($orgs),
            'delete'       => $this->deleteTenant($orgs),
            'migrate'      => $this->migrateTenant($db),
            'setup-master' => $this->setupMaster(),
            'stats'        => $this->showStats($orgs, $modules),
            default        => $this->unknownAction($action),
        };
    }

    protected function createTenant(OrganizationService $orgs): int
    {
        $name = $this->option('name') ?? $this->ask('Organization name');
        $slug = $this->option('slug') ?? $this->ask('Slug (URL-friendly)', Str::slug($name));
        $database = $this->option('database') ?? $this->ask('Database name', config('tenancy.database_prefix') . $slug);
        $domain = $this->option('domain') ?? $this->ask('Primary domain', $slug . '.' . config('tenancy.domain'));
        $type = $this->option('type') ?? $this->ask('Type (owner/standard)', 'standard');
        $status = $this->option('status') ?? 'active';

        if (Organization::where('slug', $slug)->exists()) {
            $this->error("Organization with slug '{$slug}' already exists.");
            return 1;
        }

        $this->info("Creating organization: {$name}...");

        try {
            $organization = $orgs->create([
                'name'          => $name,
                'slug'          => $slug,
                'database_name' => $database,
                'domain'        => $domain,
                'type'          => $type,
                'status'        => $status,
            ]);

            $this->newLine();
            $this->info("Organization created successfully!");
            $this->info("  ID:       {$organization->id}");
            $this->info("  Type:     {$organization->type}");
            $this->info("  Name:     {$organization->name}");
            $this->info("  Slug:     {$organization->slug}");
            $this->info("  Database: {$organization->database_name}");
            $this->info("  Domain:   {$domain}");

            return 0;
        } catch (\Exception $e) {
            $this->error("Failed to create organization: {$e->getMessage()}");
            return 1;
        }
    }

    protected function listTenants(OrganizationService $orgs): int
    {
        $organizations = $orgs->getAll();

        if ($organizations->isEmpty()) {
            $this->warn('No organizations found.');
            return 0;
        }

        $this->newLine();
        $this->info('Organizations:');
        $this->newLine();

        $headers = ['ID', 'Name', 'Type', 'Slug', 'Status', 'Plan', 'Domain'];
        $rows = [];

        foreach ($organizations as $org) {
            $rows[] = [
                $org->id,
                $org->name,
                $org->type ?? 'standard',
                $org->slug,
                $org->status,
                $org->subscription?->plan?->name ?? 'N/A',
                $org->primaryDomain?->domain ?? 'N/A',
            ];
        }

        $this->table($headers, $rows);
        return 0;
    }

    protected function showTenantInfo(OrganizationService $orgs): int
    {
        $slugOrId = $this->argument('slugOrId');
        if (!$slugOrId) {
            $this->error('Please provide a slug or ID.');
            return 1;
        }

        $org = is_numeric($slugOrId)
            ? $orgs->findById((int) $slugOrId)
            : $orgs->findBySlug($slugOrId);

        if (!$org) {
            $this->error("Organization not found: {$slugOrId}");
            return 1;
        }

        $this->newLine();
        $this->info("Organization Details:");
        $this->newLine();
        $this->table(['Field', 'Value'], [
            ['ID',            $org->id],
            ['Name',          $org->name],
            ['Type',          $org->type ?? 'standard'],
            ['Slug',          $org->slug],
            ['Status',        $org->status],
            ['Database',      $org->database_name],
            ['DB Host',       $org->database_host . ':' . $org->database_port],
            ['DB User',       $org->database_username],
            ['Timezone',      $org->timezone],
            ['Created',       $org->created_at?->format('Y-m-d H:i:s') ?? 'N/A'],
            ['Trial Ends',    $org->trial_ends_at?->format('Y-m-d H:i:s') ?? 'N/A'],
            ['Suspended At',  $org->suspended_at?->format('Y-m-d H:i:s') ?? 'N/A'],
        ]);

        $this->newLine();
        $this->info('Subscription:');
        if ($org->subscription) {
            $this->table(['Field', 'Value'], [
                ['Plan',      $org->subscription->plan?->name ?? 'N/A'],
                ['Period',    $org->subscription->billing_period],
                ['Status',    $org->subscription->status],
                ['Amount',    $org->subscription->amount . ' ' . $org->subscription->currency],
                ['Started',   $org->subscription->starts_at?->format('Y-m-d') ?? 'N/A'],
                ['Ends',      $org->subscription->ends_at?->format('Y-m-d') ?? 'N/A'],
            ]);
        } else {
            $this->warn('  No active subscription.');
        }

        $this->newLine();
        $this->info('Domains:');
        foreach ($org->domains as $domain) {
            $verified = $domain->is_verified ? '[verified]' : '[unverified]';
            $primary  = $domain->is_primary ? ' (primary)' : '';
            $this->line("  {$domain->domain} {$verified}{$primary}");
        }

        return 0;
    }

    protected function suspendTenant(OrganizationService $orgs): int
    {
        $slug = $this->argument('slugOrId');
        if (!$slug) { $this->error('Please provide a slug.'); return 1; }

        $org = Organization::where('slug', $slug)->first();
        if (!$org) { $this->error("Organization not found: {$slug}"); return 1; }

        $orgs->suspend($org);
        $this->info("Organization '{$slug}' has been suspended.");
        return 0;
    }

    protected function activateTenant(OrganizationService $orgs): int
    {
        $slug = $this->argument('slugOrId');
        if (!$slug) { $this->error('Please provide a slug.'); return 1; }

        $org = Organization::where('slug', $slug)->first();
        if (!$org) { $this->error("Organization not found: {$slug}"); return 1; }

        $orgs->reactivate($org);
        $this->info("Organization '{$slug}' has been activated.");
        return 0;
    }

    protected function deleteTenant(OrganizationService $orgs): int
    {
        $slug = $this->argument('slugOrId');
        if (!$slug) { $this->error('Please provide a slug.'); return 1; }

        $org = Organization::where('slug', $slug)->first();
        if (!$org) { $this->error("Organization not found: {$slug}"); return 1; }

        if (!$this->confirm("Are you sure you want to soft-delete '{$slug}'? The database will NOT be dropped.")) {
            return 0;
        }

        $orgs->delete($org);
        $this->info("Organization '{$slug}' has been soft-deleted.");
        return 0;
    }

    protected function migrateTenant(DatabaseProvisionService $db): int
    {
        $slug = $this->argument('slugOrId');
        if (!$slug) { $this->error('Please provide a slug.'); return 1; }

        $org = Organization::where('slug', $slug)->first();
        if (!$org) { $this->error("Organization not found: {$slug}"); return 1; }

        $this->info("Running migrations on {$org->database_name}...");

        try {
            $db->runMigrations($org->database_name);
            $this->info('Migrations completed successfully.');
            return 0;
        } catch (\Exception $e) {
            $this->error("Migration failed: {$e->getMessage()}");
            return 1;
        }
    }

    protected function setupMaster(): int
    {
        $this->info('Running master database seeder...');

        try {
            \Artisan::call('db:seed', [
                '--class' => 'Database\\Seeders\\Master\\MasterDatabaseSeeder',
                '--force' => true,
            ]);
            $this->info(\Artisan::output());
            return 0;
        } catch (\Exception $e) {
            $this->error("Seeder failed: {$e->getMessage()}");
            return 1;
        }
    }

    protected function showStats(OrganizationService $orgs, ModuleService $modules): int
    {
        $orgStats = $orgs->getStats();

        $this->newLine();
        $this->info('Platform Statistics:');
        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Total Organizations',     $orgStats['total_organizations']],
            ['Active Organizations',    $orgStats['active_organizations']],
            ['Owner Organizations',     $orgStats['owner_organizations']],
            ['Trial Organizations',     $orgStats['trial_organizations']],
            ['Suspended Organizations', $orgStats['suspended_organizations']],
            ['Total Modules',           $modules->getAll()->count()],
        ]);

        return 0;
    }

    protected function unknownAction(string $action): int
    {
        $this->error("Unknown action: {$action}");
        $this->newLine();
        $this->info('Available actions:');
        $this->line('  create         Create a new tenant');
        $this->line('  list           List all tenants');
        $this->line('  info           Show tenant details');
        $this->line('  suspend        Suspend a tenant');
        $this->line('  activate       Activate a suspended tenant');
        $this->line('  delete         Soft-delete a tenant');
        $this->line('  migrate        Run migrations on tenant database');
        $this->line('  setup-master   Run master database seeder');
        $this->line('  stats          Show platform statistics');
        return 1;
    }
}
