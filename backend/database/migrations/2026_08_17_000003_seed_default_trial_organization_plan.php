<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        $master = DB::connection($this->connection);
        $now = now();

        // Keep a single predictable default for the organization creation form.
        $master->table('organization_plans')->update(['is_default' => false]);

        $master->table('organization_plans')->updateOrInsert(
            ['slug' => 'trial'],
            [
                'name' => 'Trial',
                'description' => 'Free trial for evaluating the TechXaro organization workspace.',
                'price_monthly' => 0,
                'price_yearly' => 0,
                'max_users' => 5,
                'max_projects' => 3,
                'max_storage_gb' => 1,
                'trial_duration' => 14,
                'trial_duration_unit' => 'days',
                'is_active' => true,
                'is_default' => true,
                'sort_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        $planId = $master->table('organization_plans')->where('slug', 'trial')->value('id');
        $moduleIds = $master->table('saas_modules')
            ->whereIn('slug', ['projects', 'tasks', 'teams'])
            ->pluck('id');

        foreach ($moduleIds as $moduleId) {
            $master->table('plan_modules')->updateOrInsert(
                ['plan_id' => $planId, 'module_id' => $moduleId],
                ['is_enabled' => true, 'created_at' => $now, 'updated_at' => $now]
            );
        }
    }

    public function down(): void
    {
        // Preserve existing organizations and subscriptions if this migration is
        // rolled back; only remove the default designation from the seeded plan.
        DB::connection($this->connection)
            ->table('organization_plans')
            ->where('slug', 'trial')
            ->update(['is_default' => false]);
    }
};
