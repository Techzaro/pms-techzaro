<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        $schema = Schema::connection($this->connection);

        if (!$schema->hasTable('saas_modules')) {
            $schema->create('saas_modules', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->text('description')->nullable();
                $table->string('category', 100)->default('core');
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();

                $table->index('category');
                $table->index('is_active');
            });
        }

        if (!$schema->hasTable('plan_modules')) {
            $schema->create('plan_modules', function (Blueprint $table) {
                $table->id();
                $table->foreignId('plan_id')->constrained('organization_plans')->cascadeOnDelete();
                $table->foreignId('module_id')->constrained('saas_modules')->cascadeOnDelete();
                $table->boolean('is_enabled')->default(true);
                $table->timestamps();

                $table->unique(['plan_id', 'module_id']);
            });
        }

        $now = now();
        $modules = [
            ['name' => 'Projects', 'slug' => 'projects', 'description' => 'Project lifecycle management.', 'category' => 'core', 'is_default' => true, 'sort_order' => 1],
            ['name' => 'Tasks', 'slug' => 'tasks', 'description' => 'Task assignment, tracking, timers, and workflows.', 'category' => 'core', 'is_default' => true, 'sort_order' => 2],
            ['name' => 'Teams', 'slug' => 'teams', 'description' => 'Team and workforce management.', 'category' => 'core', 'is_default' => true, 'sort_order' => 3],
            ['name' => 'Reports', 'slug' => 'reports', 'description' => 'Reporting and analytics.', 'category' => 'standard', 'is_default' => false, 'sort_order' => 4],
            ['name' => 'Time Tracking', 'slug' => 'time-tracking', 'description' => 'Work timers and time tracking.', 'category' => 'standard', 'is_default' => false, 'sort_order' => 5],
            ['name' => 'HRM', 'slug' => 'hrm', 'description' => 'Recruitment, attendance, leave, and employee management.', 'category' => 'enterprise', 'is_default' => false, 'sort_order' => 6],
        ];

        $master = DB::connection($this->connection);
        foreach ($modules as $module) {
            $master->table('saas_modules')->updateOrInsert(
                ['slug' => $module['slug']],
                $module + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now]
            );
        }

        // Every existing plan receives the core modules. Optional modules remain
        // available for selection from the super-admin Plans editor.
        $defaultModuleIds = $master->table('saas_modules')->where('is_default', true)->pluck('id');
        $planIds = $master->table('organization_plans')->pluck('id');
        foreach ($planIds as $planId) {
            foreach ($defaultModuleIds as $moduleId) {
                $master->table('plan_modules')->updateOrInsert(
                    ['plan_id' => $planId, 'module_id' => $moduleId],
                    ['is_enabled' => true, 'created_at' => $now, 'updated_at' => $now]
                );
            }
        }
    }

    public function down(): void
    {
        $schema = Schema::connection($this->connection);
        $schema->dropIfExists('plan_modules');
        $schema->dropIfExists('saas_modules');
    }
};
