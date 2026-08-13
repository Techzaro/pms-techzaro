<?php

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

echo "=== Fixing Missing Tables ===\n\n";

// 1. Fix organization_storage_usage
echo "1. Fixing organization_storage_usage table in saas_master...\n";
try {
    $hasSingular = DB::connection('mysql_master')->getSchemaBuilder()->hasTable('organization_storage_usage');
    $hasPlural = DB::connection('mysql_master')->getSchemaBuilder()->hasTable('organization_storage_usages');
    
    if (!$hasSingular && $hasPlural) {
        DB::connection('mysql_master')->getPdo()->exec('RENAME TABLE `organization_storage_usages` TO `organization_storage_usage`');
        echo "   [OK] Renamed organization_storage_usages -> organization_storage_usage\n";
    } elseif ($hasSingular) {
        echo "   [SKIP] organization_storage_usage already exists\n";
    } else {
        Schema::connection('mysql_master')->create('organization_storage_usage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('category', 50)->default('attachments');
            $table->string('file_path', 500);
            $table->string('file_name', 255);
            $table->string('mime_type', 100)->nullable();
            $table->unsignedBigInteger('file_size_bytes')->default(0);
            $table->string('uploaded_by_name', 255)->nullable();
            $table->unsignedBigInteger('uploaded_by_id')->nullable();
            $table->timestamps();
            $table->index('organization_id');
            $table->index('category');
        });
        echo "   [OK] Created organization_storage_usage table\n";
    }
} catch (\Throwable $e) {
    echo "   [ERROR] " . $e->getMessage() . "\n";
}

// 2. Find tenant databases
echo "\n2. Processing tenant databases...\n";
$orgs = DB::connection('mysql_master')
    ->table('organizations')
    ->where('status', 'active')
    ->orWhere('status', 'trial')
    ->select('id', 'name', 'database_name')
    ->get();

$masterConfig = config('database.connections.mysql_master');
$fixedCount = 0;
$skippedCount = 0;
$errorCount = 0;

foreach ($orgs as $org) {
    $dbName = $org->database_name;
    
    // Check if database exists
    try {
        $pdo = DB::connection('mysql_master')->getPdo();
        $stmt = $pdo->prepare("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?");
        $stmt->execute([$dbName]);
        if (!$stmt->fetch()) {
            $skippedCount++;
            continue;
        }
    } catch (\Throwable $e) {
        $skippedCount++;
        continue;
    }

    // Configure temp connection
    config()->set('database.connections.fix_tenant', [
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
    DB::purge('fix_tenant');

    $orgFixed = 0;

    // Create templates if missing
    try {
        if (!Schema::connection('fix_tenant')->hasTable('templates')) {
            Schema::connection('fix_tenant')->create('templates', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->text('description')->nullable();
                $table->string('category')->default('General');
                $table->enum('visibility_level', ['private', 'project_team', 'department_team', 'organization'])->default('private');
                $table->unsignedBigInteger('project_id')->nullable();
                $table->string('department')->nullable();
                $table->string('organization')->nullable();
                $table->json('data')->nullable();
                $table->string('file_path')->nullable();
                $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
                $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamps();
                $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            });
            $orgFixed++;
        }
    } catch (\Throwable $e) {
        // If foreign key constraint fails, create without FKs
        try {
            if (!Schema::connection('fix_tenant')->hasTable('templates')) {
                Schema::connection('fix_tenant')->create('templates', function (Blueprint $table) {
                    $table->id();
                    $table->string('title');
                    $table->text('description')->nullable();
                    $table->string('category')->default('General');
                    $table->enum('visibility_level', ['private', 'project_team', 'department_team', 'organization'])->default('private');
                    $table->unsignedBigInteger('project_id')->nullable();
                    $table->string('department')->nullable();
                    $table->string('organization')->nullable();
                    $table->json('data')->nullable();
                    $table->string('file_path')->nullable();
                    $table->unsignedBigInteger('created_by')->nullable();
                    $table->unsignedBigInteger('updated_by')->nullable();
                    $table->timestamps();
                });
                $orgFixed++;
            }
        } catch (\Throwable $e2) {
            $errorCount++;
        }
    }

    // Create knowledge_bases if missing
    try {
        if (!Schema::connection('fix_tenant')->hasTable('knowledge_bases')) {
            Schema::connection('fix_tenant')->create('knowledge_bases', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->longText('content')->nullable();
                $table->string('category')->default('General');
                $table->enum('visibility_level', ['private', 'project_team', 'department_team', 'organization'])->default('organization');
                $table->unsignedBigInteger('project_id')->nullable();
                $table->string('department')->nullable();
                $table->string('organization')->nullable();
                $table->string('file_path')->nullable();
                $table->string('file_name')->nullable();
                $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
                $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
                $table->timestamps();
                $table->foreign('project_id')->references('id')->on('projects')->onDelete('cascade');
            });
            $orgFixed++;
        }
    } catch (\Throwable $e) {
        try {
            if (!Schema::connection('fix_tenant')->hasTable('knowledge_bases')) {
                Schema::connection('fix_tenant')->create('knowledge_bases', function (Blueprint $table) {
                    $table->id();
                    $table->string('title');
                    $table->longText('content')->nullable();
                    $table->string('category')->default('General');
                    $table->enum('visibility_level', ['private', 'project_team', 'department_team', 'organization'])->default('organization');
                    $table->unsignedBigInteger('project_id')->nullable();
                    $table->string('department')->nullable();
                    $table->string('organization')->nullable();
                    $table->string('file_path')->nullable();
                    $table->string('file_name')->nullable();
                    $table->unsignedBigInteger('created_by')->nullable();
                    $table->unsignedBigInteger('updated_by')->nullable();
                    $table->timestamps();
                });
                $orgFixed++;
            }
        } catch (\Throwable $e2) {
            $errorCount++;
        }
    }

    // Fix missing user columns
    try {
        if (Schema::connection('fix_tenant')->hasTable('users')) {
            $columns = Schema::connection('fix_tenant')->getColumnListing('users');
            $missingCols = [];
            if (!in_array('status', $columns)) $missingCols[] = 'status';
            if (!in_array('deletion_requested', $columns)) $missingCols[] = 'deletion_requested';
            if (!in_array('deletion_requested_by', $columns)) $missingCols[] = 'deletion_requested_by';
            if (!in_array('company_name', $columns)) $missingCols[] = 'company_name';
            if (!in_array('avatar', $columns)) $missingCols[] = 'avatar';
            if (!in_array('email_preferences', $columns)) $missingCols[] = 'email_preferences';
            
            if (!empty($missingCols)) {
                Schema::connection('fix_tenant')->table('users', function (Blueprint $table) use ($missingCols) {
                    foreach ($missingCols as $col) {
                        switch ($col) {
                            case 'status': $table->string('status', 20)->default('active')->after('role'); break;
                            case 'deletion_requested': $table->boolean('deletion_requested')->default(false)->after('status'); break;
                            case 'deletion_requested_by': $table->unsignedBigInteger('deletion_requested_by')->nullable()->after('deletion_requested'); break;
                            case 'company_name': $table->string('company_name')->nullable()->after('email'); break;
                            case 'avatar': $table->string('avatar')->nullable()->after('name'); break;
                            case 'email_preferences': $table->json('email_preferences')->nullable(); break;
                        }
                    }
                });
                $orgFixed++;
            }
        }
    } catch (\Throwable $e) {
        // non-critical
    }

    if ($orgFixed > 0) {
        $fixedCount++;
        echo "   [OK] {$org->name}: fixed {$orgFixed} issue(s)\n";
    }
}

echo "\n=== Summary ===\n";
echo "   Fixed: {$fixedCount} tenant databases\n";
echo "   Skipped: {$skippedCount} (database not found)\n";
echo "   Errors: {$errorCount}\n";
echo "\n=== Done ===\n";
