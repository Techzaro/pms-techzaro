<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CreateTenantSharingTables extends Command
{
    protected $signature = 'tenants:create-sharing-tables';
    protected $description = 'Create sharing-related tables in all tenant databases';

    public function handle()
    {
        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
        $organizations = Organization::whereIn('status', ['active', 'trial'])->get();

        if ($organizations->isEmpty()) {
            $this->warn('No active/trial organizations found.');
            return Command::SUCCESS;
        }

        foreach ($organizations as $org) {
            $this->line("Processing: <comment>{$org->database_name}</comment>");

            $connName = 'tenant_fix_' . $org->id;
            config()->set("database.connections.{$connName}", [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $org->database_name,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => false,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge($connName);
            $conn = DB::connection($connName);
            $schema = $conn->getSchemaBuilder();

            $tables = [
                'shared_resources' => function ($t) {
                    $t->id();
                    $t->unsignedBigInteger('connection_id')->comment('References organization_connections.id in master DB');
                    $t->unsignedBigInteger('shared_by_organization_id')->comment('Org that owns the resource');
                    $t->unsignedBigInteger('shared_with_organization_id')->comment('Org receiving access');
                    $t->string('resource_type', 50)->comment('project, task, document, event, knowledge_base');
                    $t->unsignedBigInteger('resource_id');
                    $t->string('resource_name', 255)->nullable();
                    $t->string('permission', 30)->default('view')->comment('view, comment, collaborate');
                    $t->boolean('can_download')->default(false);
                    $t->string('status', 20)->default('active')->comment('active, expired, revoked');
                    $t->unsignedBigInteger('shared_by_user_id')->nullable()->comment('User who shared');
                    $t->unsignedBigInteger('approved_by_user_id')->nullable()->comment('User who approved');
                    $t->text('notes')->nullable();
                    $t->timestamp('shared_at')->nullable();
                    $t->timestamp('expires_at')->nullable();
                    $t->timestamp('revoked_at')->nullable();
                    $t->json('metadata')->nullable();
                    $t->timestamps();
                    $t->softDeletes();
                    $t->index('resource_type');
                    $t->index('connection_id');
                    $t->index('status');
                    $t->index('shared_with_organization_id');
                    $t->unique(['connection_id', 'resource_type', 'resource_id'], 'unique_shared_resource');
                },
                'shared_resource_users' => function ($t) {
                    $t->id();
                    $t->unsignedBigInteger('shared_resource_id');
                    $t->unsignedBigInteger('user_id');
                    $t->string('permission_override', 30)->nullable();
                    $t->boolean('can_download')->nullable();
                    $t->string('status', 20)->default('active');
                    $t->timestamp('granted_at')->nullable();
                    $t->timestamp('expires_at')->nullable();
                    $t->unsignedBigInteger('granted_by_user_id')->nullable();
                    $t->timestamps();
                    $t->index('shared_resource_id');
                    $t->index('user_id');
                },
                'shared_resource_activity_logs' => function ($t) {
                    $t->id();
                    $t->unsignedBigInteger('shared_resource_id');
                    $t->unsignedBigInteger('user_id');
                    $t->string('action', 50);
                    $t->string('resource_type', 50);
                    $t->unsignedBigInteger('resource_id');
                    $t->string('old_permission', 30)->nullable();
                    $t->string('new_permission', 30)->nullable();
                    $t->json('details')->nullable();
                    $t->string('ip_address', 45)->nullable();
                    $t->string('user_agent')->nullable();
                    $t->timestamp('acted_at')->nullable();
                    $t->timestamps();
                    $t->index('shared_resource_id');
                    $t->index('user_id');
                },
                'sharing_notifications' => function ($t) {
                    $t->id();
                    $t->unsignedBigInteger('organization_id');
                    $t->unsignedBigInteger('user_id')->nullable()->comment('Target user, null = broadcast to all admins');
                    $t->unsignedBigInteger('from_organization_id')->nullable();
                    $t->string('type', 50);
                    $t->string('title', 255);
                    $t->text('message')->nullable();
                    $t->json('data')->nullable();
                    $t->boolean('is_read')->default(false);
                    $t->timestamp('read_at')->nullable();
                    $t->timestamps();
                },
            ];

            foreach ($tables as $tableName => $callback) {
                try {
                    if (!$schema->hasTable($tableName)) {
                        $schema->create($tableName, $callback);
                        $this->line("    <info>✓ {$tableName}</info>");
                    } else {
                        $this->line("    skip {$tableName}");
                    }
                } catch (\Throwable $e) {
                    $this->error("    ✗ {$tableName}: {$e->getMessage()}");
                }
            }

            // alter task_comments
            try {
                if ($schema->hasTable('task_comments') && !$schema->hasColumn('task_comments', 'comment_type')) {
                    $schema->table('task_comments', function ($t) {
                        $t->enum('comment_type', ['internal', 'external'])->default('internal')->after('task_id');
                        $t->json('visible_to_organizations')->nullable()->after('comment_type');
                    });
                    $this->line("    <info>✓ task_comments altered</info>");
                } else {
                    $this->line("    skip task_comments");
                }
            } catch (\Throwable $e) {
                $this->error("    ✗ task_comments: {$e->getMessage()}");
            }

            DB::purge($connName);
        }

        return Command::SUCCESS;
    }
}
