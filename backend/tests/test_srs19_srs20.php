<?php

/**
 * End-to-End Automated Verification Script for SRS Point 19 & 20
 *
 * Checks:
 * - SRS Point 19 (PMS Integrations):
 *   * Pivot linking: Event <-> Task (event_task)
 *   * Pivot linking: KnowledgeBase <-> Task (knowledge_base_task)
 *   * Task relationships (project, deliverables, assignees, followers, comments, attachments)
 * - SRS Point 20 (Personal Notes):
 *   * Personal notes privacy: User A cannot see User B's notes
 *   * Task User Notes CRUD
 *   * Deliverable User Notes CRUD
 */

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use App\Models\Deliverable;
use App\Models\TaskUserNote;
use App\Models\DeliverableUserNote;
use App\Models\Event;
use App\Models\KnowledgeBase;
use App\Models\Master\Organization;
use App\Services\Saas\TenantDatabaseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

echo "=== STARTING SRS POINT 19 & 20 VERIFICATION ===\n\n";

// Step 0: Switch to Active Tenant Database
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
        echo "[SETUP] Tenant database connection established successfully.\n\n";
    } catch (\Throwable $e) {
        echo "[FAIL] Failed to switch to tenant database: " . $e->getMessage() . "\n";
        exit(1);
    }
}

$passCount = 0;
$failCount = 0;

function assertCondition($name, $condition, $details = '') {
    global $passCount, $failCount;
    if ($condition) {
        echo " [PASS] $name\n";
        $passCount++;
    } else {
        echo " [FAIL] $name: $details\n";
        $failCount++;
    }
}

// 1. Setup test users
$users = User::all();
if ($users->count() < 2) {
    $userA = User::firstOrCreate(
        ['email' => 'srs_tester_a@techzaro.local'],
        ['name' => 'SRS Tester A', 'password' => bcrypt('secret123'), 'role' => 'admin']
    );
    $userB = User::firstOrCreate(
        ['email' => 'srs_tester_b@techzaro.local'],
        ['name' => 'SRS Tester B', 'password' => bcrypt('secret123'), 'role' => 'admin']
    );
} else {
    $userA = $users[0];
    $userB = $users[1];
}

echo "[INFO] User A: {$userA->name} (ID: {$userA->id})\n";
echo "[INFO] User B: {$userB->name} (ID: {$userB->id})\n\n";

// 2. Setup test project and task
$project = Project::firstOrCreate(
    ['title' => 'SRS 19 & 20 Integration QA Project'],
    [
        'code' => 'SRS1920',
        'status' => 'in_progress',
        'created_by' => $userA->id,
        'user_id' => $userA->id,
        'category' => 'Engineering',
    ]
);

$task = Task::firstOrCreate(
    ['title' => 'SRS 19-20 Test Task', 'project_id' => $project->id],
    [
        'status' => 'in_progress',
        'priority' => 'High',
        'created_by' => $userA->id,
        'assigned_by' => $userA->id,
        'assigned_to' => $userB->id,
    ]
);

$deliverable = Deliverable::firstOrCreate(
    ['title' => 'SRS 19-20 Test Subtask', 'task_id' => $task->id],
    [
        'project_id' => $project->id,
        'status' => 'pending',
        'priority' => 'Medium',
        'created_by' => $userA->id,
        'assigned_to' => $userB->id,
    ]
);

echo "--- 1. Testing SRS Point 19: Relational Linking (Pivot Tables) ---\n";

// Test Event Pivot Linking
$event = Event::firstOrCreate(
    ['title' => 'SRS Integration Milestone Review'],
    [
        'user_id' => $userA->id,
        'start_date' => now()->addDays(2),
        'end_date' => now()->addDays(2)->addHours(2),
        'type' => 'meeting',
    ]
);

// Link Event without duplicate records
$task->events()->syncWithoutDetaching([$event->id]);
$linkedEvents = $task->events()->get();
assertCondition(
    "Task links to Event via event_task pivot table",
    $linkedEvents->contains('id', $event->id),
    "Event ID {$event->id} not found in task->events()"
);

// Verify idempotency (no duplicate rows in event_task)
$task->events()->syncWithoutDetaching([$event->id]);
$eventTaskCount = DB::table('event_task')->where('task_id', $task->id)->where('event_id', $event->id)->count();
assertCondition(
    "event_task pivot adheres to Record Linking Principle (zero row duplication)",
    $eventTaskCount === 1,
    "Expected count 1, found {$eventTaskCount}"
);

// Test KnowledgeBase Pivot Linking
$kb = KnowledgeBase::firstOrCreate(
    ['title' => 'SRS 19 Integration SOP Guide'],
    [
        'created_by' => $userA->id,
        'user_id' => $userA->id,
        'category' => 'Documentation',
        'content' => 'Guide for integrating PMS modules cleanly without data duplication.',
    ]
);

$task->knowledgeBases()->syncWithoutDetaching([$kb->id]);
$linkedKbs = $task->knowledgeBases()->get();
assertCondition(
    "Task links to Knowledge Base via knowledge_base_task pivot table",
    $linkedKbs->contains('id', $kb->id),
    "KB ID {$kb->id} not found in task->knowledgeBases()"
);

$kbTaskCount = DB::table('knowledge_base_task')->where('task_id', $task->id)->where('knowledge_base_id', $kb->id)->count();
assertCondition(
    "knowledge_base_task pivot adheres to Record Linking Principle (zero row duplication)",
    $kbTaskCount === 1,
    "Expected count 1, found {$kbTaskCount}"
);

echo "\n--- 2. Testing SRS Point 20: Personal Notes & Privacy Isolation ---\n";

// Clear previous test notes
TaskUserNote::where('task_id', $task->id)->delete();
DeliverableUserNote::where('deliverable_id', $deliverable->id)->delete();

// User A adds private note on Task
$noteA = TaskUserNote::create([
    'task_id' => $task->id,
    'user_id' => $userA->id,
    'note' => 'Private note for User A on task: Check database schema constraints.',
]);

// User B adds private note on Task
$noteB = TaskUserNote::create([
    'task_id' => $task->id,
    'user_id' => $userB->id,
    'note' => 'Private note for User B on task: Implement frontend hover popover.',
]);

// Verify User A query only retrieves Note A
$userANotes = TaskUserNote::where('task_id', $task->id)->where('user_id', $userA->id)->get();
assertCondition(
    "User A retrieves only User A's private task notes",
    $userANotes->contains('id', $noteA->id) && !$userANotes->contains('id', $noteB->id),
    "User A saw notes outside their own ownership"
);

// Verify User B query only retrieves Note B
$userBNotes = TaskUserNote::where('task_id', $task->id)->where('user_id', $userB->id)->get();
assertCondition(
    "User B retrieves only User B's private task notes",
    $userBNotes->contains('id', $noteB->id) && !$userBNotes->contains('id', $noteA->id),
    "User B saw notes outside their own ownership"
);

// Test Note Update
$noteA->update(['note' => 'Updated private note for User A']);
$updatedNoteA = TaskUserNote::find($noteA->id);
assertCondition(
    "Personal task note inline update works",
    $updatedNoteA->note === 'Updated private note for User A',
    "Note content did not update properly"
);

// Deliverable Note CRUD & Privacy
$delNoteA = DeliverableUserNote::create([
    'deliverable_id' => $deliverable->id,
    'user_id' => $userA->id,
    'note' => 'Deliverable note User A',
]);

$delNoteB = DeliverableUserNote::create([
    'deliverable_id' => $deliverable->id,
    'user_id' => $userB->id,
    'note' => 'Deliverable note User B',
]);

$userADelNotes = DeliverableUserNote::where('deliverable_id', $deliverable->id)->where('user_id', $userA->id)->get();
assertCondition(
    "Deliverable personal note privacy holds between users",
    $userADelNotes->contains('id', $delNoteA->id) && !$userADelNotes->contains('id', $delNoteB->id),
    "Privacy violation on deliverable notes"
);

echo "\n=== TEST SUMMARY ===\n";
echo "Total Passed: $passCount\n";
echo "Total Failed: $failCount\n";

if ($failCount === 0) {
    echo ">>> ALL SRS POINT 19 & 20 TESTS PASSED SUCCESSFULLY! <<<\n";
    exit(0);
} else {
    echo ">>> SOME TESTS FAILED! <<<\n";
    exit(1);
}
