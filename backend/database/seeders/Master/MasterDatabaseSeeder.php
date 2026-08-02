<?php

namespace Database\Seeders\Master;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationPlan;
use App\Models\Master\OrganizationDomain;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\SaasModule;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * MasterDatabaseSeeder.
 *
 * Seeds the saas_master database with:
 * 1. Feature modules
 * 2. Subscription plans (Starter, Professional, Enterprise)
 * 3. Plan-module mappings
 * 4. TechXaro PMS as Tenant #1 (Owner type, Enterprise plan)
 *
 * RUNS ON: saas_master database only.
 * DOES NOT modify the existing pms_techxaro database.
 */
class MasterDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedModules();
        $this->seedPlans();
        $this->seedPlanModules();
        $this->seedTechXaroTenant();
    }

    protected function seedModules(): void
    {
        $this->command->info('Seeding SaaS modules...');

        $modules = [
            ['name' => 'Projects',          'slug' => 'projects',          'description' => 'Full project management with milestones, visibility, and workflow',       'category' => 'core',      'is_default' => true,  'sort_order' => 1],
            ['name' => 'Tasks',             'slug' => 'tasks',             'description' => 'Task management with assignments, delegation, timers, and approvals',     'category' => 'core',      'is_default' => true,  'sort_order' => 2],
            ['name' => 'Deliverables',      'slug' => 'deliverables',      'description' => 'Subtask/deliverable management with full workflow and self-approval',      'category' => 'core',      'is_default' => true,  'sort_order' => 3],
            ['name' => 'Teams',             'slug' => 'teams',             'description' => 'Team creation, member assignment, and team lead management',              'category' => 'core',      'is_default' => true,  'sort_order' => 4],
            ['name' => 'Calendar & Events', 'slug' => 'events',            'description' => 'Calendar events with unified view of tasks, projects, and deliverables',  'category' => 'core',      'is_default' => true,  'sort_order' => 5],
            ['name' => 'Notifications',     'slug' => 'notifications',     'description' => 'In-app notifications, email alerts, and FCM push notifications',         'category' => 'core',      'is_default' => true,  'sort_order' => 6],
            ['name' => 'Chat',              'slug' => 'chat',              'description' => 'Real-time messaging with file attachments and project-based conversations','category' => 'core',      'is_default' => true,  'sort_order' => 7],
            ['name' => 'Drafts',            'slug' => 'drafts',            'description' => 'Draft system with versioning, auto-save, and publish workflow',           'category' => 'core',      'is_default' => true,  'sort_order' => 8],
            ['name' => 'Activity Feed',     'slug' => 'activities',        'description' => 'Activity tracking with read/unread status and today/past views',          'category' => 'core',      'is_default' => true,  'sort_order' => 9],
            ['name' => 'User Profiles',     'slug' => 'profiles',          'description' => 'Full user profiles with documents, employment, and emergency details',    'category' => 'core',      'is_default' => true,  'sort_order' => 10],
            ['name' => 'Company Documents', 'slug' => 'company_documents', 'description' => 'Company-wide document management with logo and QR code',                  'category' => 'core',      'is_default' => true,  'sort_order' => 11],
            ['name' => 'Work Timers',       'slug' => 'work_timers',       'description' => 'Time tracking with start/pause/resume and session history',               'category' => 'core',      'is_default' => true,  'sort_order' => 12],
            ['name' => 'Reports',           'slug' => 'reports',           'description' => 'Performance reports, team analytics, and export capabilities',            'category' => 'premium',   'is_default' => false, 'sort_order' => 20],
            ['name' => 'Audit Logs',        'slug' => 'audit_logs',        'description' => 'Full audit trail with export, user agent tracking, and change history',   'category' => 'premium',   'is_default' => false, 'sort_order' => 21],
            ['name' => 'Guest Portal',      'slug' => 'guest_portal',      'description' => 'Client portal with limited access for external stakeholders',             'category' => 'premium',   'is_default' => false, 'sort_order' => 22],
            ['name' => 'Delegation',        'slug' => 'delegation',        'description' => 'Task and deliverable delegation with approval chains',                    'category' => 'premium',   'is_default' => false, 'sort_order' => 23],
            ['name' => 'Recurring Tasks',   'slug' => 'recurring_tasks',   'description' => 'Recurring task generation with customizable schedules',                   'category' => 'enterprise','is_default' => false, 'sort_order' => 30],
        ];

        foreach ($modules as $module) {
            SaasModule::updateOrCreate(['slug' => $module['slug']], $module);
        }
    }

    protected function seedPlans(): void
    {
        $this->command->info('Seeding subscription plans...');

        $plans = [
            [
                'name' => 'Starter', 'slug' => 'starter',
                'description' => 'Perfect for small teams getting started with project management',
                'price_monthly' => 29.00, 'price_yearly' => 290.00,
                'max_users' => 10, 'max_projects' => 10, 'max_storage_gb' => 5,
                'is_active' => true, 'is_default' => true, 'sort_order' => 1,
            ],
            [
                'name' => 'Professional', 'slug' => 'professional',
                'description' => 'For growing teams that need advanced features and reporting',
                'price_monthly' => 79.00, 'price_yearly' => 790.00,
                'max_users' => 50, 'max_projects' => 50, 'max_storage_gb' => 50,
                'is_active' => true, 'is_default' => false, 'sort_order' => 2,
            ],
            [
                'name' => 'Enterprise', 'slug' => 'enterprise',
                'description' => 'Unlimited access with priority support and custom features',
                'price_monthly' => 199.00, 'price_yearly' => 1990.00,
                'max_users' => 9999, 'max_projects' => 9999, 'max_storage_gb' => 500,
                'is_active' => true, 'is_default' => false, 'sort_order' => 3,
            ],
        ];

        foreach ($plans as $plan) {
            OrganizationPlan::updateOrCreate(['slug' => $plan['slug']], $plan);
        }
    }

    protected function seedPlanModules(): void
    {
        $this->command->info('Seeding plan-module mappings...');

        $allModules = SaasModule::pluck('id')->toArray();

        $starterModules = ['projects','tasks','deliverables','teams','events','notifications','chat','drafts','activities','profiles','company_documents','work_timers'];
        $professionalModules = array_merge($starterModules, ['reports','audit_logs','guest_portal','delegation']);
        $enterpriseModules = array_merge($professionalModules, ['recurring_tasks']);

        $map = [
            'starter'      => $starterModules,
            'professional' => $professionalModules,
            'enterprise'   => $enterpriseModules,
        ];

        foreach ($map as $planSlug => $moduleSlugs) {
            $plan = OrganizationPlan::where('slug', $planSlug)->first();
            if (!$plan) continue;

            $modules = SaasModule::whereIn('slug', $moduleSlugs)->pluck('id');
            foreach ($modules as $moduleId) {
                DB::connection(config('tenancy.master_connection'))->table('plan_modules')->updateOrInsert(
                    ['plan_id' => $plan->id, 'module_id' => $moduleId],
                    ['is_enabled' => true, 'created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    /**
     * Register TechXaro PMS as Tenant #1 with Owner type.
     *
     * Owner organizations bypass all plan limits and module restrictions.
     * The existing pms_techxaro database is NOT modified.
     */
    protected function seedTechXaroTenant(): void
    {
        $this->command->info('Registering TechXaro PMS as Tenant #1 (Owner)...');

        $existing = Organization::where('slug', 'techxaro')->first();
        if ($existing) {
            $this->command->warn('TechXaro tenant already registered. Updating to Owner type...');

            $existing->update([
                'type'   => 'owner',
                'status' => 'active',
            ]);

            // Update domain to use configured dev domain
            $devDomain = config('tenancy.domain', 'pms.test');
            $existing->domains()->updateOrCreate(
                ['is_primary' => true],
                ['domain' => 'techxaro.' . $devDomain, 'is_verified' => true, 'verified_at' => now()]
            );

            // Upgrade to Enterprise plan (Owner bypasses limits)
            $plan = OrganizationPlan::where('slug', 'enterprise')->first();
            if ($plan && (!$existing->subscription || $existing->subscription->plan_id !== $plan->id)) {
                $existing->subscription?->update(['status' => 'replaced']);
                OrganizationSubscription::create([
                    'organization_id' => $existing->id,
                    'plan_id'         => $plan->id,
                    'billing_period'  => 'yearly',
                    'status'          => 'active',
                    'amount'          => 0,
                    'currency'        => 'USD',
                    'starts_at'       => now(),
                    'trial_ends_at'   => null,
                ]);
            }

            return;
        }

        $devDomain = config('tenancy.domain', 'pms.test');

        $organization = Organization::create([
            'name'            => 'TechXaro',
            'slug'            => 'techxaro',
            'type'            => 'owner',
            'database_name'   => 'pms_techxaro',
            'database_host'   => config('tenancy.default_database.host'),
            'database_port'   => config('tenancy.default_database.port'),
            'database_username' => config('tenancy.default_database.username'),
            'database_password' => config('tenancy.default_database.password'),
            'status'          => 'active',
            'timezone'        => 'Asia/Karachi',
            'settings'        => [
                'company_name'   => 'TechXaro',
                'industry'       => 'Technology',
                'employee_count' => '10-50',
            ],
        ]);

        OrganizationDomain::create([
            'organization_id' => $organization->id,
            'domain'          => 'techxaro.' . $devDomain,
            'is_primary'      => true,
            'is_verified'     => true,
            'verified_at'     => now(),
        ]);

        // Owner type — still assign Enterprise plan for reference (limits are bypassed)
        $plan = OrganizationPlan::where('slug', 'enterprise')->first();
        if ($plan) {
            OrganizationSubscription::create([
                'organization_id' => $organization->id,
                'plan_id'         => $plan->id,
                'billing_period'  => 'yearly',
                'status'          => 'active',
                'amount'          => 0, // Owner pays nothing
                'currency'        => 'USD',
                'starts_at'       => now(),
                'trial_ends_at'   => null,
            ]);
        }

        $this->command->info("TechXaro registered successfully:");
        $this->command->info("  ID:       {$organization->id}");
        $this->command->info("  Type:     owner (bypasses all limits)");
        $this->command->info("  Slug:     {$organization->slug}");
        $this->command->info("  Database: {$organization->database_name}");
        $this->command->info("  Domain:   techxaro.{$devDomain}");
        $this->command->info("  Plan:     Enterprise (reference only)");
    }
}
