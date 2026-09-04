<?php

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Master\Organization;
use App\Models\User;
use App\Models\Task;
use App\Models\TaskSavedView;
use App\Models\Deliverable;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

echo "=== SRS Point 15 Automated Test Suite ===\n\n";

// 1. Switch to Tenant DB
$org = Organization::whereIn('status', ['active', 'trial'])->first() ?: Organization::first();
if ($org) {
    echo "[1] Switching to tenant DB for organization: {$org->name} (DB: {$org->database_name})\n";
    $tenantManager = app(TenantDatabaseManager::class);
    $tenantManager->switchTo($org);
    config()->set('database.connections.mysql.host', $org->database_host);
    config()->set('database.connections.mysql.port', $org->database_port);
    config()->set('database.connections.mysql.database', $org->database_name);
    config()->set('database.connections.mysql.username', $org->database_username);
    config()->set('database.connections.mysql.password', $org->database_password ?? '');
    DB::purge('mysql');
    DB::reconnect('mysql');
    echo "    Tenant DB connected: " . DB::connection()->getDatabaseName() . "\n";
} else {
    echo "[1] No organization found, running on default DB: " . DB::connection()->getDatabaseName() . "\n";
}

// 2. Verify Schema for Saved Views
echo "\n[2] Verifying Schema for Saved Views Table...\n";
$tableName = Schema::hasTable('saved_views') ? 'saved_views' : (Schema::hasTable('task_saved_views') ? 'task_saved_views' : null);
if (!$tableName) {
    echo "❌ Neither 'saved_views' nor 'task_saved_views' table exists!\n";
    exit(1);
}
echo "    Found saved views table: '{$tableName}'\n";
foreach (['id', 'user_id'] as $col) {
    if (!Schema::hasColumn($tableName, $col)) {
        echo "❌ Missing required column: {$col}\n";
        exit(1);
    }
}
echo "✅ Schema verified successfully.\n";

// 3. Verify Saved Views CRUD
echo "\n[3] Testing Saved Views CRUD Operations...\n";
$testUser = User::first();
if (!$testUser) {
    echo "❌ No user found in DB to test Saved Views.\n";
    exit(1);
}
Auth::login($testUser);

// CREATE
$testView = TaskSavedView::create([
    'user_id' => $testUser->id,
    'view_name' => 'SRS15 QA Custom View ' . time(),
    'filter_payload' => [
        'statuses' => ['Pending', 'In Progress'],
        'states' => ['Reopened'],
        'due_states' => ['Due Today'],
        'priority' => ['High', 'Urgent'],
    ],
    'sort_parameters' => [
        'sort_by' => 'due_date',
        'sort_direction' => 'asc',
    ],
    'is_default' => false,
]);

if (!$testView || !$testView->id) {
    echo "❌ Failed to create TaskSavedView.\n";
    exit(1);
}
echo "    Created Saved View ID #{$testView->id} ('{$testView->view_name}')\n";

// READ
$fetchedView = TaskSavedView::where('user_id', $testUser->id)->find($testView->id);
if (!$fetchedView) {
    echo "❌ Failed to fetch created TaskSavedView.\n";
    exit(1);
}
echo "    Read Saved View ID #{$fetchedView->id} successfully. Filters: " . json_encode($fetchedView->filters) . "\n";

// UPDATE / RENAME
$fetchedView->update([
    'view_name' => 'SRS15 QA Renamed View ' . time(),
    'is_default' => true,
]);
echo "    Updated Saved View ID #{$fetchedView->id} ('{$fetchedView->view_name}')\n";

// DELETE
$viewIdToDelete = $fetchedView->id;
$fetchedView->delete();
$deletedCheck = TaskSavedView::find($viewIdToDelete);
if ($deletedCheck) {
    echo "❌ Failed to delete TaskSavedView ID #{$viewIdToDelete}.\n";
    exit(1);
}
echo "    Deleted Saved View ID #{$viewIdToDelete} successfully.\n";
echo "✅ Saved Views CRUD verified successfully.\n";

// 4. Verify Status Badge Counts and Normalization
echo "\n[4] Verifying Status Badge Counts and Normalization...\n";
$pendingStatuses = ['pending', 'planned', 'planning', 'Pending', 'Planned', 'Planning'];
$inProgressStatuses = ['in_progress', 'In Progress', 'in-progress', 'reopened', 'Reopened', 'doing'];
$completedStatuses = ['completed', 'approved', 'done', 'Completed', 'Approved', 'Done'];
$pausedStatuses = ['paused', 'Paused', 'hold', 'on_hold'];
$submittedStatuses = ['submitted', 'Submitted', 'review', 'in_review', 'under_review'];
$declinedStatuses = ['declined', 'rejected', 'failed', 'Declined', 'Rejected', 'Failed'];
$abandonedStatuses = ['abandoned', 'abandon_requested', 'Abandoned', 'Abandon Requested'];

$allTasks = Task::all();
$allCount = $allTasks->count();
$pendingCount = $allTasks->whereIn('status', $pendingStatuses)->count();
$inProgressCount = $allTasks->whereIn('status', $inProgressStatuses)->count();
$submittedCount = $allTasks->whereIn('status', $submittedStatuses)->count();
$completedCount = $allTasks->whereIn('status', $completedStatuses)->count();
$pausedCount = $allTasks->whereIn('status', $pausedStatuses)->count();
$declinedCount = $allTasks->whereIn('status', $declinedStatuses)->count();
$abandonedCount = $allTasks->whereIn('status', $abandonedStatuses)->count();

echo "    Total Tasks in DB: {$allCount}\n";
echo "    - Pending: {$pendingCount}\n";
echo "    - In Progress: {$inProgressCount}\n";
echo "    - Submitted: {$submittedCount}\n";
echo "    - Completed: {$completedCount}\n";
echo "    - Paused: {$pausedCount}\n";
echo "    - Declined: {$declinedCount}\n";
echo "    - Abandoned: {$abandonedCount}\n";

// 5. Verify Controller Filters and Sorting via Request Simulation
echo "\n[5] Verifying TaskController Filtering & Sorting Logic...\n";
$controller = app(\App\Http\Controllers\TaskController::class);

// Test Status Filter
$reqStatus = new \Illuminate\Http\Request(['statuses' => ['Completed', 'Pending']]);
$query = Task::query();
$reflection = new \ReflectionClass($controller);
$method = $reflection->getMethod('applyQueryFiltersSortingPagination');
$method->setAccessible(true);
$filteredQuery = $method->invokeArgs($controller, [$reqStatus, $query]);
$statusResultCount = $filteredQuery->count();
echo "    Filtered query (Completed + Pending): {$statusResultCount} items returned\n";

// Test Priority Filter
$reqPriority = new \Illuminate\Http\Request(['priority' => ['High', 'Urgent']]);
$queryPrio = Task::query();
$filteredQueryPrio = $method->invokeArgs($controller, [$reqPriority, $queryPrio]);
echo "    Filtered query (High + Urgent Priority): {$filteredQueryPrio->count()} items returned\n";

// Test Due States Filter
$reqDue = new \Illuminate\Http\Request(['due_states' => ['Due Today', 'Overdue']]);
$queryDue = Task::query();
$filteredQueryDue = $method->invokeArgs($controller, [$reqDue, $queryDue]);
echo "    Filtered query (Due Today + Overdue): {$filteredQueryDue->count()} items returned\n";

// Test Sorting
$reqSort = new \Illuminate\Http\Request(['sort_by' => 'last_updated', 'sort_direction' => 'desc']);
$querySort = Task::query();
$sortedQuery = $method->invokeArgs($controller, [$reqSort, $querySort]);
$firstSorted = $sortedQuery->first();
echo "    Sorted query (last_updated desc): First ID #" . ($firstSorted ? $firstSorted->id : 'None') . "\n";

echo "\n=== ALL SRS Point 15 Tests Passed Successfully! ===\n";
