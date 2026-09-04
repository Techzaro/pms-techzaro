<?php

/**
 * test_audit_logs_srs17.php
 * Automated End-to-End Verification Suite for Global Activity / Audit Logs (SRS Point 17).
 */

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Master\Organization;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use App\Models\AuditLog;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TaskCommentController;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

echo "========================================================================================\n";
echo "   SRS POINT 17: GLOBAL AUDIT TRAIL END-TO-END AUTOMATED VERIFICATION SUITE              \n";
echo "========================================================================================\n\n";

// -------------------------------------------------------------
// Step 0: Switch to Active Tenant Database
// -------------------------------------------------------------
$org = Organization::whereIn('status', ['active', 'trial'])->first() ?: Organization::first();
if ($org) {
    echo "[SETUP] Connecting to Tenant Organization: '{$org->name}' (Slug: {$org->slug}, DB: {$org->database_name})...\n";
    try {
        app(TenantDatabaseManager::class)->switchTo($org);
        config()->set('database.connections.mysql.host', $org->database_host);
        config()->set('database.connections.mysql.port', $org->database_port);
        config()->set('database.connections.mysql.database', $org->database_name);
        config()->set('database.connections.mysql.username', $org->database_username);
        config()->set('database.connections.mysql.password', $org->database_password ?? '');
        DB::purge('mysql');
        DB::reconnect('mysql');
        echo "[SETUP] Database connection established successfully.\n\n";
    } catch (\Throwable $e) {
        echo "[FAIL] Failed to switch to tenant database: " . $e->getMessage() . "\n";
        exit(1);
    }
} else {
    echo "[WARN] No master organization found, proceeding with default mysql connection.\n\n";
}

// -------------------------------------------------------------
// Step 0b: Find or Create Test Users
// -------------------------------------------------------------
$adminUser = User::where('role', 'admin')->first() ?: User::first();
if (!$adminUser) {
    echo "[FAIL] No user found in the system to run test.\n";
    exit(1);
}

Auth::login($adminUser);

$followerUser = User::where('id', '!=', $adminUser->id)->first();
if (!$followerUser) {
    $followerUser = User::create([
        'name' => 'QA Follower User',
        'email' => 'qa_follower_' . time() . '@example.com',
        'password' => bcrypt('Password123!'),
        'role' => 'employee',
    ]);
}

echo "[SETUP] Test Actor: {$adminUser->name} (ID: {$adminUser->id}, Role: {$adminUser->role})\n";
echo "[SETUP] Follower User: {$followerUser->name} (ID: {$followerUser->id})\n\n";

// -------------------------------------------------------------
// Step 1: Create Dummy Project & Task
// -------------------------------------------------------------
echo "[STEP 1] Generating Dummy Project and Task...\n";

$project = Project::firstOrCreate(
    ['title' => 'Audit Trail QA Project'],
    [
        'description' => 'Project for automated testing of SRS Point 17 audit trail',
        'status' => 'in_progress',
        'created_by' => $adminUser->id,
        'business_id' => 'PRJ-QA-' . time(),
        'start_date' => now()->toDateString(),
        'end_date' => now()->addMonth()->toDateString(),
    ]
);

$taskController = app(TaskController::class);
$commentController = app(TaskCommentController::class);

// Create Task via Controller to trigger "Task Created" audit log
$taskTitle = 'Point 17 Verification Task ' . time();
$createTaskReq = Request::create('/api/tasks/standalone', 'POST', [
    'title' => $taskTitle,
    'description' => 'Task created to verify exact audit log events',
    'project_id' => $project->id,
    'assigned_to' => [$adminUser->id],
    'priority' => 'medium',
    'task_type' => 'standard',
    'start_date' => now()->toDateString(),
    'end_date' => now()->addDays(7)->toDateString(),
]);
$createTaskReq->setUserResolver(fn() => $adminUser);

$createRes = $taskController->storeStandalone($createTaskReq);
$createData = json_decode($createRes->getContent(), true);

if ($createRes->getStatusCode() !== 201 && $createRes->getStatusCode() !== 200) {
    echo "[FAIL] Task creation failed: " . $createRes->getContent() . "\n";
    exit(1);
}

$taskId = $createData['task']['id'] ?? ($createData['tasks'][0]['id'] ?? null);
$task = $taskId ? Task::find($taskId) : null;

if (!$task) {
    echo "[FAIL] Task not found in database. Response was: " . $createRes->getContent() . "\n";
    exit(1);
}

echo "   -> Created Task: [ID: {$task->id}] '{$task->title}' in Project '{$project->title}'\n";
echo "   [PASS] Task created successfully.\n\n";

// -------------------------------------------------------------
// Step 2: Trigger Action: Add a Comment
// -------------------------------------------------------------
echo "[STEP 2] Triggering Action: Add a Comment...\n";
$commentReq = Request::create("/api/tasks/{$task->id}/comments", 'POST', [
    'body' => 'Automated QA Comment for SRS Point 17 Verification',
]);
$commentReq->setUserResolver(fn() => $adminUser);

$commentRes = $commentController->store($commentReq, $task);
if ($commentRes->getStatusCode() !== 200 && $commentRes->getStatusCode() !== 201) {
    echo "[FAIL] Comment addition failed: " . $commentRes->getContent() . "\n";
    exit(1);
}
echo "   [PASS] Comment added to task.\n\n";

// -------------------------------------------------------------
// Step 3: Trigger Action: Add an Attachment (File Link)
// -------------------------------------------------------------
echo "[STEP 3] Triggering Action: Add an Attachment (File Link)...\n";
$linkReq = Request::create("/api/tasks/{$task->id}/links", 'POST', [
    'url' => 'https://example.com/qa-proof-document.pdf',
    'name' => 'QA Proof Document',
]);
$linkReq->setUserResolver(fn() => $adminUser);

$linkRes = $taskController->addLink($linkReq, $task);
if ($linkRes->getStatusCode() !== 200 && $linkRes->getStatusCode() !== 201) {
    echo "[FAIL] Link addition failed: " . $linkRes->getContent() . "\n";
    exit(1);
}
echo "   [PASS] Attachment link added to task.\n\n";

// -------------------------------------------------------------
// Step 4: Acknowledge / Start Task & Pause the Task
// -------------------------------------------------------------
echo "[STEP 4] Triggering Actions: Start Task & Pause Task...\n";
$ackReq = Request::create("/api/tasks/{$task->id}/acknowledge", 'POST');
$ackReq->setUserResolver(fn() => $adminUser);
$ackRes = $taskController->acknowledge($ackReq, $task);
$task->refresh();

$pauseReq = Request::create("/api/tasks/{$task->id}/pause", 'POST', [
    'reason' => 'waiting_approval',
    'reason_detail' => 'Pausing for audit log verification test',
]);
$pauseReq->setUserResolver(fn() => $adminUser);

$pauseRes = $taskController->pause($pauseReq, $task);
if ($pauseRes->getStatusCode() !== 200) {
    echo "[FAIL] Task pause failed: " . $pauseRes->getContent() . "\n";
    exit(1);
}
echo "   [PASS] Task started and paused successfully.\n\n";

// -------------------------------------------------------------
// Step 5: Trigger Action: Add a Follower
// -------------------------------------------------------------
echo "[STEP 5] Triggering Action: Add a Follower...\n";
$followerReq = Request::create("/api/tasks/{$task->id}", 'PUT', [
    'followers' => [$followerUser->id],
]);
$followerReq->setUserResolver(fn() => $adminUser);

$followerRes = $taskController->update($followerReq, $task);
if ($followerRes->getStatusCode() !== 200) {
    echo "[FAIL] Add follower update failed: " . $followerRes->getContent() . "\n";
    exit(1);
}
echo "   [PASS] Follower ({$followerUser->name}) added to task.\n\n";

// -------------------------------------------------------------
// Step 6: Trigger Action: Mark the Task as Completed
// -------------------------------------------------------------
echo "[STEP 6] Triggering Action: Mark Task as Completed...\n";
$completeReq = Request::create("/api/tasks/{$task->id}/mark-as-completed", 'POST', [
    'reason' => 'Completed ahead of schedule',
    'delivery_notes' => 'QA Verification completed successfully with all checks.',
]);
$completeReq->setUserResolver(fn() => $adminUser);

$completeRes = $taskController->markAsCompleted($completeReq, $task);
if ($completeRes->getStatusCode() !== 200) {
    echo "[FAIL] Mark as completed failed: " . $completeRes->getContent() . "\n";
    exit(1);
}
echo "   [PASS] Task marked as completed.\n\n";

// -------------------------------------------------------------
// Step 7: Database Verification & Assertion of Global Audit Logs
// -------------------------------------------------------------
echo "[STEP 7] Querying and Verifying Global Audit Logs (`audit_logs` table)...\n\n";

$logs = AuditLog::where(function ($q) use ($task) {
        $q->where('entity_id', $task->id)
          ->orWhere('description', 'like', "%{$task->title}%");
    })
    ->latest('id')
    ->take(10)
    ->get();

$expectedActions = [
    'Task Created',
    'Comment Added',
    'Attachment Added',
    'Task Started',
    'Task Paused',
    'Follower Added',
    'Task Completed',
];

$actionsFound = [];
$allModulesMatch = true;
$allUserNamesPresent = true;

echo sprintf(
    "| %-6s | %-18s | %-22s | %-18s | %-15s | %-45s |\n",
    'ID', 'Module', 'Action', 'User Name', 'Entity Type', 'Description'
);
echo str_repeat('-', 135) . "\n";

foreach ($logs as $log) {
    $actionsFound[] = $log->action;
    $moduleOk = ($log->module === 'Task Management');
    if (!$moduleOk) {
        $allModulesMatch = false;
    }
    if (empty($log->user_name)) {
        $allUserNamesPresent = false;
    }

    echo sprintf(
        "| %-6d | %-18s | %-22s | %-18s | %-15s | %-45s |\n",
        $log->id,
        $log->module . ($moduleOk ? '' : ' [INVALID]'),
        $log->action,
        $log->user_name ?: '[NULL]',
        $log->entity_type,
        mb_strimwidth($log->description, 0, 45, '...')
    );
}

echo str_repeat('-', 135) . "\n\n";

echo "========================================================================================\n";
echo "                               VERIFICATION SUMMARY                                     \n";
echo "========================================================================================\n";

$allPassed = true;

foreach ($expectedActions as $expected) {
    if (in_array($expected, $actionsFound, true)) {
        echo "[PASS] Action '{$expected}' was logged in global audit logs with exact SRS naming.\n";
    } else {
        echo "[FAIL] Action '{$expected}' was NOT found in recent audit logs.\n";
        $allPassed = false;
    }
}

if ($allModulesMatch) {
    echo "[PASS] All audit log modules strictly set to 'Task Management' (no generic 'project_management').\n";
} else {
    echo "[FAIL] One or more logs did not have module 'Task Management'.\n";
    $allPassed = false;
}

if ($allUserNamesPresent) {
    echo "[PASS] User names properly populated in 'user_name' column for all logs.\n";
} else {
    echo "[FAIL] Some audit logs have missing 'user_name'.\n";
    $allPassed = false;
}

echo "\n";
if ($allPassed) {
    echo ">>> [SUCCESS] 100% OF SRS POINT 17 GLOBAL AUDIT LOG VERIFICATION PASSED SUCCESSFULLY! <<<\n";
    exit(0);
} else {
    echo ">>> [FAILURE] One or more audit log assertions failed. <<<\n";
    exit(1);
}
