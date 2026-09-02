<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

class FixTenantEventTables extends Command
{
    protected $signature = 'tenants:fix-event-tables
        {--database= : Specific tenant database name (e.g. pms_tenant_arhum)}';

    protected $description = 'Safely add start_time, end_time, project_id, meeting_link, status, and related event schema to all tenant databases';

    public function handle(): int
    {
        $specificDb = $this->option('database');

        $masterConfig = config('database.connections.' . config('tenancy.master_connection', 'mysql_master'))
            ?: config('database.connections.mysql');

        // Query all databases on MySQL matching pms_tenant_%
        $pdo = DB::connection(config('tenancy.master_connection', 'mysql_master'))->getPdo();
        $stmt = $pdo->query("SHOW DATABASES LIKE 'pms_tenant_%'");
        $databases = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        if ($specificDb) {
            $databases = [$specificDb];
        }

        if (empty($databases)) {
            $this->warn('No tenant databases matching pms_tenant_% found.');
            return Command::SUCCESS;
        }

        $this->info("Found " . count($databases) . " tenant database(s) to process:");
        foreach ($databases as $dbName) {
            $this->line(" - <comment>{$dbName}</comment>");
        }
        $this->newLine();

        $totalChanges = 0;

        foreach ($databases as $dbName) {
            $this->info("Processing database: <comment>{$dbName}</comment>");

            config()->set('database.connections.tenant_event_fix', [
                'driver'    => 'mysql',
                'host'      => $masterConfig['host'],
                'port'      => $masterConfig['port'],
                'database'  => $dbName,
                'username'  => $masterConfig['username'],
                'password'  => $masterConfig['password'] ?? '',
                'charset'   => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix'    => '',
                'prefix_indexes' => true,
                'strict'    => true,
                'engine'    => null,
            ]);

            DB::purge('tenant_event_fix');
            DB::reconnect('tenant_event_fix');

            $dbChanges = 0;

            if (Schema::connection('tenant_event_fix')->hasTable('events')) {
                Schema::connection('tenant_event_fix')->table('events', function (Blueprint $table) use ($dbName, &$dbChanges) {
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'start_time')) {
                        $table->time('start_time')->nullable()->after('start_date');
                        $this->line("  <info>+ Added events.start_time (TIME NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'end_time')) {
                        $table->time('end_time')->nullable()->after('end_date');
                        $this->line("  <info>+ Added events.end_time (TIME NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'project_id')) {
                        $table->unsignedBigInteger('project_id')->nullable()->after('description');
                        $this->line("  <info>+ Added events.project_id (BIGINT UNSIGNED NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'meeting_link')) {
                        $table->string('meeting_link', 2048)->nullable()->after('description');
                        $this->line("  <info>+ Added events.meeting_link (VARCHAR(2048) NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'status')) {
                        $table->string('status', 32)->default('scheduled')->after('visibility_level');
                        $this->line("  <info>+ Added events.status (VARCHAR(32) DEFAULT 'scheduled')</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'organizer_id')) {
                        $table->unsignedBigInteger('organizer_id')->nullable()->after('user_id');
                        $this->line("  <info>+ Added events.organizer_id (BIGINT UNSIGNED NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'category_id')) {
                        $table->unsignedBigInteger('category_id')->nullable()->after('type');
                        $this->line("  <info>+ Added events.category_id (BIGINT UNSIGNED NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'location')) {
                        $table->string('location', 255)->nullable()->after('description');
                        $this->line("  <info>+ Added events.location (VARCHAR(255) NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'is_global')) {
                        $table->boolean('is_global')->default(false)->after('all_day');
                        $this->line("  <info>+ Added events.is_global (BOOLEAN DEFAULT FALSE)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'visibility_level')) {
                        $table->string('visibility_level', 32)->default('organization')->after('is_global');
                        $this->line("  <info>+ Added events.visibility_level (VARCHAR(32) DEFAULT 'organization')</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'event_timezone')) {
                        $table->string('event_timezone', 64)->nullable()->after('all_day');
                        $this->line("  <info>+ Added events.event_timezone (VARCHAR(64) NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'event_date')) {
                        $table->date('event_date')->nullable()->after('event_timezone');
                        $this->line("  <info>+ Added events.event_date (DATE NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'event_start_time')) {
                        $table->time('event_start_time')->nullable()->after('event_date');
                        $this->line("  <info>+ Added events.event_start_time (TIME NULL)</info>");
                        $dbChanges++;
                    }
                    if (!Schema::connection('tenant_event_fix')->hasColumn('events', 'event_end_time')) {
                        $table->time('event_end_time')->nullable()->after('event_start_time');
                        $this->line("  <info>+ Added events.event_end_time (TIME NULL)</info>");
                        $dbChanges++;
                    }
                });
            } else {
                $this->warn("  Table 'events' does not exist in {$dbName}. Creating it...");
                Schema::connection('tenant_event_fix')->create('events', function (Blueprint $table) {
                    $table->id();
                    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                    $table->unsignedBigInteger('organizer_id')->nullable();
                    $table->string('title');
                    $table->text('description')->nullable();
                    $table->string('type', 32)->default('meeting');
                    $table->unsignedBigInteger('category_id')->nullable();
                    $table->string('color', 16)->nullable();
                    $table->dateTime('start_date');
                    $table->time('start_time')->nullable();
                    $table->dateTime('end_date')->nullable();
                    $table->time('end_time')->nullable();
                    $table->boolean('all_day')->default(false);
                    $table->boolean('is_global')->default(false);
                    $table->string('visibility_level', 32)->default('organization');
                    $table->string('location', 255)->nullable();
                    $table->string('meeting_link', 2048)->nullable();
                    $table->unsignedBigInteger('project_id')->nullable();
                    $table->string('status', 32)->default('scheduled');
                    $table->string('event_timezone', 64)->nullable();
                    $table->date('event_date')->nullable();
                    $table->time('event_start_time')->nullable();
                    $table->time('event_end_time')->nullable();
                    $table->timestamps();
                });
                $this->line("  <info>+ Created table 'events'</info>");
                $dbChanges++;
            }

            // Ensure event_reminders table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_reminders')) {
                Schema::connection('tenant_event_fix')->create('event_reminders', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('event_id');
                    $table->unsignedBigInteger('user_id')->nullable();
                    $table->integer('value')->default(15);
                    $table->string('unit', 16)->default('minutes');
                    $table->boolean('is_sent')->default(false);
                    $table->timestamp('sent_at')->nullable();
                    $table->timestamps();

                    $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
                    $table->index(['event_id', 'is_sent']);
                });
                $this->line("  <info>+ Created table 'event_reminders'</info>");
                $dbChanges++;
            }

            // Ensure event_attachments table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_attachments')) {
                Schema::connection('tenant_event_fix')->create('event_attachments', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('event_id');
                    $table->unsignedBigInteger('user_id')->nullable();
                    $table->string('file_name', 255);
                    $table->string('file_path', 1024);
                    $table->unsignedBigInteger('file_size')->default(0);
                    $table->string('mime_type', 128)->nullable();
                    $table->timestamps();

                    $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
                    $table->index('event_id');
                });
                $this->line("  <info>+ Created table 'event_attachments'</info>");
                $dbChanges++;
            }

            // Ensure event_participants table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_participants')) {
                Schema::connection('tenant_event_fix')->create('event_participants', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('event_id');
                    $table->unsignedBigInteger('user_id');
                    $table->string('status', 32)->default('invited');
                    $table->text('response_notes')->nullable();
                    $table->boolean('attended')->default(false);
                    $table->timestamps();

                    $table->unique(['event_id', 'user_id']);
                    $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                });
                $this->line("  <info>+ Created table 'event_participants'</info>");
                $dbChanges++;
            }

            // Ensure event_visibilities table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_visibilities')) {
                Schema::connection('tenant_event_fix')->create('event_visibilities', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('event_id');
                    $table->unsignedBigInteger('user_id')->nullable();
                    $table->unsignedBigInteger('team_id')->nullable();
                    $table->string('department', 100)->nullable();
                    $table->string('role', 50)->nullable();
                    $table->boolean('is_visible')->default(true);
                    $table->timestamps();

                    $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                });
                $this->line("  <info>+ Created table 'event_visibilities'</info>");
                $dbChanges++;
            }

            // Ensure event_categories table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_categories')) {
                Schema::connection('tenant_event_fix')->create('event_categories', function (Blueprint $table) {
                    $table->id();
                    $table->string('name', 255);
                    $table->string('slug', 255)->nullable();
                    $table->text('description')->nullable();
                    $table->string('icon', 255)->nullable();
                    $table->string('color', 32)->nullable();
                    $table->integer('sort_order')->default(0);
                    $table->boolean('is_active')->default(true);
                    $table->unsignedBigInteger('created_by')->nullable();
                    $table->timestamps();

                    $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
                });
                $this->line("  <info>+ Created table 'event_categories'</info>");
                $dbChanges++;
            }

            // Ensure event_users table exists
            if (!Schema::connection('tenant_event_fix')->hasTable('event_users')) {
                Schema::connection('tenant_event_fix')->create('event_users', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('event_id');
                    $table->unsignedBigInteger('user_id');
                    $table->timestamps();

                    $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                    $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                    $table->unique(['event_id', 'user_id']);
                });
                $this->line("  <info>+ Created table 'event_users'</info>");
                $dbChanges++;
            }

            if ($dbChanges === 0) {
                $this->line("  <info>✓ Already fully compliant</info>");
            }

            $totalChanges += $dbChanges;
            DB::purge('tenant_event_fix');
            $this->newLine();
        }

        $this->info("Completed. Total schema additions applied across tenants: {$totalChanges}");
        return Command::SUCCESS;
    }
}
