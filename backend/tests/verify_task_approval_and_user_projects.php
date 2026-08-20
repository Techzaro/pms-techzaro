<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Task;
use App\Models\Project;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

echo "=================================================================\n";
echo "   VERIFY TASK APPROVAL AUTHORIZATION & USER CREATION WITH PROJECTS   \n";
echo "=================================================================\n\n";

$allPassed = true;

// Ensure test users exist
$adminUser = User::where('role', 'admin')->first();
if (!$adminUser) {
    $adminUser = User::create([
        'name' => 'Test Admin',
        'email' => 'admin_test_' . Str::random(5) . '@example.com',
        'professional_email' => 'admin_test_' . Str::random(5) . '@example.com',
        'password' => Hash::make('password123'),
        'role' => 'admin',
        'active' => true,
    ]);
}

$userA = User::where('role', 'member')->first();
if (!$userA) {
    $userA = User::create([
        'name' => 'User A (Assigner)',
        'email' => 'usera_' . Str::random(5) . '@example.com',
        'professional_email' => 'usera_' . Str::random(5) . '@example.com',
        'password' => Hash::make('password123'),
        'role' => 'member',
        'active' => true,
    ]);
}

$userB = User::where('role', 'member')->where('id', '!=', $userA->id)->first();
if (!$userB) {
    $userB = User::create([
        'name' => 'User B (Assignee)',
        'email' => 'userb_' . Str::random(5) . '@example.com',
        'professional_email' => 'userb_' . Str::random(5) . '@example.com',
        'password' => Hash::make('password123'),
        'role' => 'member',
        'active' => true,
    ]);
}

$taskController = app(TaskController::class);
$userController = app(UserController::class);

// -----------------------------------------------------------------
// TEST 1: Task Assignee cannot approve their own submitted task
// -----------------------------------------------------------------
echo "[RUNNING] Test 1: Task Assignee cannot approve their own submitted task...\n";
$task = Task::create([
    'title' => 'Test Task for Approval Authorization',
    'assigned_by' => $userA->id,
    'assigned_to' => $userB->id,
    'status' => 'submitted',
    'priority' => 'Medium',
]);
$task->assignees()->sync([$userB->id]);

// Authenticate as User B (Assignee)
Auth::login($userB);
$requestB = Request::create("/api/tasks/{$task->id}/approve", 'POST');
$requestB->setUserResolver(fn() => $userB);

$responseB = $taskController->approve($requestB, $task);
$statusB = $responseB->getStatusCode();
$dataB = json_decode($responseB->getContent(), true);

if ($statusB === 403 && str_contains($dataB['message'] ?? '', 'assignee cannot approve')) {
    echo "  [PASS] User B (Assignee) was rejected with 403: " . ($dataB['message'] ?? '') . "\n";
} else {
    echo "  [FAIL] Expected 403 for assignee, got $statusB: " . json_encode($dataB) . "\n";
    $allPassed = false;
}

// -----------------------------------------------------------------
// TEST 2: Task Assignee cannot decline, reopen, or abandon task
// -----------------------------------------------------------------
echo "[RUNNING] Test 2: Task Assignee cannot decline, reopen, or abandon task...\n";
$rejectRes = $taskController->reject($requestB, $task);
$reopenRes = $taskController->reopen($requestB, $task);
$abandonRes = $taskController->abandon($requestB, $task);

if ($rejectRes->getStatusCode() === 403 && $reopenRes->getStatusCode() === 403 && $abandonRes->getStatusCode() === 403) {
    echo "  [PASS] Reject (403), Reopen (403), and Abandon (403) all blocked for assignee.\n";
} else {
    echo "  [FAIL] Expected 403 for all assignee actions, got: Reject={$rejectRes->getStatusCode()}, Reopen={$reopenRes->getStatusCode()}, Abandon={$abandonRes->getStatusCode()}\n";
    $allPassed = false;
}

// -----------------------------------------------------------------
// TEST 3: Assigner (User A) and Super Admin CAN approve submitted task
// -----------------------------------------------------------------
echo "[RUNNING] Test 3: Assigner (User A) CAN approve submitted task...\n";
Auth::login($userA);
$requestA = Request::create("/api/tasks/{$task->id}/approve", 'POST');
$requestA->setUserResolver(fn() => $userA);

$responseA = $taskController->approve($requestA, $task);
$statusA = $responseA->getStatusCode();
$dataA = json_decode($responseA->getContent(), true);

if ($statusA === 200 && ($dataA['task']['status'] ?? '') === 'approved') {
    echo "  [PASS] Assigner (User A) successfully approved task.\n";
} else {
    echo "  [FAIL] Assigner could not approve task: status $statusA " . json_encode($dataA) . "\n";
    $allPassed = false;
}

// -----------------------------------------------------------------
// TEST 4: User Creation with Projects immediately attaches user to projects
// -----------------------------------------------------------------
echo "[RUNNING] Test 4: User Creation with Projects attached...\n";

// Create 2 test projects
$proj1 = Project::create([
    'title' => 'Test Project Alpha',
    'created_by' => $adminUser->id,
    'assigned_users' => [],
]);
$proj2 = Project::create([
    'title' => 'Test Project Beta',
    'created_by' => $adminUser->id,
    'assigned_users' => [],
]);

Auth::login($adminUser);
$userCreateEmail = 'newuser_' . Str::random(6) . '@example.com';
$userProfEmail = 'newuser_prof_' . Str::random(6) . '@example.com';

$requestCreate = Request::create('/api/users', 'POST', [
    'name' => 'John Project Member',
    'email' => $userCreateEmail,
    'personal_email' => $userCreateEmail,
    'professional_email' => $userProfEmail,
    'role' => 'member',
    'department' => 'Engineering',
    'designation' => 'Software Engineer',
    'employee_code' => 'EMP-' . rand(1000, 9999),
    'project_ids' => [$proj1->id, $proj2->id],
]);
$requestCreate->setUserResolver(fn() => $adminUser);

$responseCreate = $userController->store($requestCreate);
$statusCreate = $responseCreate->getStatusCode();
$dataCreate = json_decode($responseCreate->getContent(), true);

$createdUser = User::where('email', $userCreateEmail)->first();

if (in_array($statusCreate, [200, 201]) && $createdUser) {
    $proj1Fresh = $proj1->fresh();
    $proj2Fresh = $proj2->fresh();

    $assigned1 = array_map('intval', (array) ($proj1Fresh->assigned_users ?? []));
    $assigned2 = array_map('intval', (array) ($proj2Fresh->assigned_users ?? []));

    if (in_array((int) $createdUser->id, $assigned1) && in_array((int) $createdUser->id, $assigned2)) {
        echo "  [PASS] User {$createdUser->id} was immediately attached to Project {$proj1->id} and Project {$proj2->id}!\n";
    } else {
        echo "  [FAIL] User was not attached to projects. Proj1: " . json_encode($assigned1) . ", Proj2: " . json_encode($assigned2) . "\n";
        $allPassed = false;
    }
} else {
    echo "  [FAIL] User creation failed with status $statusCreate: " . json_encode($dataCreate) . "\n";
    $allPassed = false;
}

// -----------------------------------------------------------------
// TEST 5: Guest Creation with Projects immediately attaches guest to projects
// -----------------------------------------------------------------
echo "[RUNNING] Test 5: Guest Creation with Projects attached...\n";
$guestEmail = 'newguest_' . Str::random(6) . '@example.com';
$requestGuest = Request::create('/api/guests', 'POST', [
    'name' => 'Jane Guest Client',
    'personal_email' => $guestEmail,
    'company_name' => 'Acme Corp',
    'project_ids' => [$proj1->id],
]);
$requestGuest->setUserResolver(fn() => $adminUser);

$responseGuest = $userController->storeGuest($requestGuest);
$statusGuest = $responseGuest->getStatusCode();
$createdGuest = User::where('personal_email', $guestEmail)->first();

if (in_array($statusGuest, [200, 201]) && $createdGuest) {
    $proj1Fresh = $proj1->fresh();
    $assigned1 = array_map('intval', (array) ($proj1Fresh->assigned_users ?? []));
    $guestIds1 = array_map('intval', (array) ($proj1Fresh->guest_ids ?? []));

    if (in_array((int) $createdGuest->id, $assigned1) && in_array((int) $createdGuest->id, $guestIds1)) {
        echo "  [PASS] Guest {$createdGuest->id} was immediately attached to Project {$proj1->id} assigned_users and guest_ids!\n";
    } else {
        echo "  [FAIL] Guest was not properly attached. assigned_users: " . json_encode($assigned1) . ", guest_ids: " . json_encode($guestIds1) . "\n";
        $allPassed = false;
    }
} else {
    echo "  [FAIL] Guest creation failed with status $statusGuest: " . $responseGuest->getContent() . "\n";
    $allPassed = false;
}

// Cleanup test items
$task->assignees()->detach();
$task->delete();
$proj1->delete();
$proj2->delete();

echo "\n=================================================================\n";
if ($allPassed) {
    echo "  🎉 ALL 5 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n";
} else {
    echo "  ❌ SOME TESTS FAILED.\n";
}
echo "=================================================================\n";

exit($allPassed ? 0 : 1);
