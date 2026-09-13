<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$dbs = [
    'pms_tenant_mughal-s-furnitures-2' => 'Mughal Furnitures (Receiver)',
    'pms_tenant_test-org' => 'Test Org (Sender)',
];

foreach ($dbs as $db => $label) {
    echo "\n=== $label ($db) ===\n";
    try {
        $rows = DB::connection('mysql')->select("SELECT id, shared_by_organization_id, shared_with_organization_id, resource_type, resource_id, resource_name, status, permission, expires_at FROM `$db`.shared_resources");
        if (empty($rows)) {
            echo "  No shared_resources found\n";
        }
        foreach ($rows as $r) {
            echo "  ID={$r->id} by_org={$r->shared_by_organization_id} with_org={$r->shared_with_organization_id} type={$r->resource_type} res_id={$r->resource_id} name={$r->resource_name} status={$r->status} perm={$r->permission} expires={$r->expires_at}\n";
        }
    } catch (\Throwable $e) {
        echo "  ERROR: " . $e->getMessage() . "\n";
    }
}

// Also check tasks in sender DB
echo "\n=== Tasks in Test Org DB ===\n";
try {
    $tasks = DB::connection('mysql')->select("SELECT id, title, status, project_id FROM `pms_tenant_test-org`.tasks LIMIT 20");
    if (empty($tasks)) {
        echo "  No tasks found\n";
    }
    foreach ($tasks as $t) {
        echo "  ID={$t->id} title={$t->title} status={$t->status} project_id={$t->project_id}\n";
    }
} catch (\Throwable $e) {
    echo "  ERROR: " . $e->getMessage() . "\n";
}

// Check the current user's org
echo "\n=== Current request check ===\n";
$org = App\Models\Master\Organization::on('mysql_master')->where('database_name', 'pms_tenant_mughal-s-furnitures-2')->first();
echo "Receiver org: ID={$org->id} name={$org->name}\n";
