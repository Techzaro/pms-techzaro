<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Config;

// Simulate getSharedProjectMembers for shared_6 from org 90 (Mughals)
$masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

// Connect to org 90
$org90 = DB::connection('mysql_master')->table('organizations')->where('id', 90)->first();
Config::set("database.connections.d90", [
    'driver' => 'mysql', 'host' => $masterConfig['host'], 'port' => $masterConfig['port'],
    'database' => $org90->database_name, 'username' => $masterConfig['username'],
    'password' => $masterConfig['password'] ?? '', 'charset' => 'utf8mb4', 'prefix' => '',
]);
DB::purge('d90');
$db90 = DB::connection('d90');

// Step 1: Find shared resource
$sr = $db90->table('shared_resources')->where('id', 6)->first();
echo "=== shared_resource id=6 in org 90 ===\n";
echo "by={$sr->shared_by_organization_id} with={$sr->shared_with_organization_id} res_id={$sr->resource_id}\n";

// Step 2: sharerOrg = org 91
$org91 = DB::connection('mysql_master')->table('organizations')->where('id', 91)->first();
echo "sharerOrg = {$org91->name} (db: {$org91->database_name})\n";

// Step 3: Fetch original members from sharer's DB (org 91)
Config::set("database.connections.d91", [
    'driver' => 'mysql', 'host' => $masterConfig['host'], 'port' => $masterConfig['port'],
    'database' => $org91->database_name, 'username' => $masterConfig['username'],
    'password' => $masterConfig['password'] ?? '', 'charset' => 'utf8mb4', 'prefix' => '',
]);
DB::purge('d91');
$db91 = DB::connection('d91');

$project = $db91->table('projects')->where('id', $sr->resource_id)->first();
echo "\n=== Project {$sr->resource_id} in org 91 ===\n";
echo "assigned_users={$project->assigned_users} created_by={$project->created_by}\n";

$memberIds = json_decode($project->assigned_users ?? '[]', true) ?? [];
if ($project->created_by) $memberIds[] = $project->created_by;
$memberIds = array_unique(array_filter($memberIds));
echo "memberIds: " . implode(',', $memberIds) . "\n";

$originalMembers = $db91->table('users')->whereIn('id', $memberIds)->select('id', 'name', 'email', 'role', 'department')->get();
echo "\n=== originalMembers (from sharer DB) ===\n";
foreach ($originalMembers as $m) echo "id={$m->id} name={$m->name} org_id={$org91->id} is_external=true\n";

// Step 4: findLocalMirrorId - shared_resource id=6 in org 90
echo "\n=== localMirrorId = 6 (same as shared_6 in org 90)\n";

// Step 5: shared_project_members
$sharedMembers = $db90->table('shared_project_members')->where('shared_resource_id', 6)->get();
echo "\n=== shared_project_members with shared_resource_id=6 ===\n";
foreach ($sharedMembers as $sm) {
    $user = $db90->table('users')->where('id', $sm->user_id)->select('id', 'name', 'email', 'role', 'department')->first();
    echo "id={$sm->user_id} name={$user->name} org_id={$sm->organization_id} is_external=false source=added\n";
}

echo "\n=== TOTAL: " . count($originalMembers) . " original + " . count($sharedMembers) . " shared = " . (count($originalMembers) + count($sharedMembers)) . " members ===\n";

DB::purge('d90');
DB::purge('d91');
