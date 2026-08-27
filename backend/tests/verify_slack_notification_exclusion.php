<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Auth;

echo "=================================================================\n";
echo "   VERIFY SLACK NOTIFICATION EXCLUSION FOR AUTHENTICATED USER   \n";
echo "=================================================================\n\n";

$allPassed = true;

// Ensure we have two test users with slack webhook URLs
$userA = User::first();
if (!$userA) {
    echo "[ERROR] No user found in database.\n";
    exit(1);
}

$userB = User::where('id', '!=', $userA->id)->first();
if (!$userB) {
    echo "[ERROR] Need at least 2 users in database to test.\n";
    exit(1);
}

// Set Slack Webhook URLs on users
$userA->slack_webhook_url = 'https://hooks.slack.com/services/USER_A_TEST_WEBHOOK';
$userA->save();

$userB->slack_webhook_url = 'https://hooks.slack.com/services/USER_B_TEST_WEBHOOK';
$userB->save();

$notificationService = app(NotificationService::class);

// -----------------------------------------------------------------
// TEST 1: Single Notification create() when User A is authenticated
// -----------------------------------------------------------------
echo "[RUNNING] Test 1: Single notification create() with User A as sender & User B as recipient...\n";
Http::fake([
    'https://hooks.slack.com/*' => Http::response(['ok' => true], 200),
]);

Auth::login($userA);

$notificationService->create([
    'user_id' => $userB->id,
    'sender_user_id' => $userA->id,
    'type' => 'task_assigned',
    'related_module' => 'task',
    'related_id' => 1,
    'title' => 'Task Assigned',
    'message' => 'User A assigned a task to User B.',
]);

$sentToA = false;
$sentToB = false;

foreach (Http::recorded() as [$request, $response]) {
    if ($request->url() === $userA->slack_webhook_url) {
        $sentToA = true;
    }
    if ($request->url() === $userB->slack_webhook_url) {
        $sentToB = true;
    }
}

if ($sentToB && !$sentToA) {
    echo "[PASSED] Test 1: Slack webhook sent to User B, NOT to authenticated User A.\n";
} else {
    $allPassed = false;
    echo "[FAILED] Test 1: Sent to A: " . ($sentToA ? 'YES' : 'NO') . ", Sent to B: " . ($sentToB ? 'YES' : 'NO') . "\n";
}

// -----------------------------------------------------------------
// TEST 2: Self-notification attempt via create()
// -----------------------------------------------------------------
echo "\n[RUNNING] Test 2: Attempting self-notification create() where user_id === auth()->id()...\n";
Http::fake([
    'https://hooks.slack.com/*' => Http::response(['ok' => true], 200),
]);

$notificationService->create([
    'user_id' => $userA->id,
    'sender_user_id' => $userA->id,
    'type' => 'task_assigned',
    'related_module' => 'task',
    'related_id' => 1,
    'title' => 'Self Task Assigned',
    'message' => 'User A assigned a task to self.',
]);

$recordedCount = count(Http::recorded());

if ($recordedCount === 0) {
    echo "[PASSED] Test 2: Zero Slack webhooks dispatched for self-notification.\n";
} else {
    $allPassed = false;
    echo "[FAILED] Test 2: $recordedCount Slack webhook(s) unexpectedly sent for self-notification.\n";
}

// -----------------------------------------------------------------
// TEST 3: Bulk notification createBulk()
// -----------------------------------------------------------------
echo "\n[RUNNING] Test 3: createBulk() with User A as sender and [User A, User B] as recipients...\n";
Http::fake([
    'https://hooks.slack.com/*' => Http::response(['ok' => true], 200),
]);

$notificationService->createBulk([
    [
        'user_id' => $userA->id,
        'sender_user_id' => $userA->id,
        'type' => 'task_updated',
        'related_module' => 'task',
        'related_id' => 1,
        'title' => 'Task Updated',
        'message' => 'User A updated task.',
    ],
    [
        'user_id' => $userB->id,
        'sender_user_id' => $userA->id,
        'type' => 'task_updated',
        'related_module' => 'task',
        'related_id' => 1,
        'title' => 'Task Updated',
        'message' => 'User A updated task.',
    ]
]);

$sentToA = false;
$sentToB = false;

foreach (Http::recorded() as [$request, $response]) {
    if ($request->url() === $userA->slack_webhook_url) {
        $sentToA = true;
    }
    if ($request->url() === $userB->slack_webhook_url) {
        $sentToB = true;
    }
}

if ($sentToB && !$sentToA) {
    echo "[PASSED] Test 3: Bulk dispatch sent Slack webhook only to User B, excluded User A.\n";
} else {
    $allPassed = false;
    echo "[FAILED] Test 3: Sent to A: " . ($sentToA ? 'YES' : 'NO') . ", Sent to B: " . ($sentToB ? 'YES' : 'NO') . "\n";
}

// -----------------------------------------------------------------
// TEST 4: notifyMultiple() helper method
// -----------------------------------------------------------------
echo "\n[RUNNING] Test 4: notifyMultiple() with [$userA->id, $userB->id] as target user IDs...\n";
Http::fake([
    'https://hooks.slack.com/*' => Http::response(['ok' => true], 200),
]);

$notificationService->notifyMultiple(
    [$userA->id, $userB->id],
    $userA->id,
    'task_comment',
    'task',
    1,
    'New Comment',
    'User A commented on task.'
);

$sentToA = false;
$sentToB = false;

foreach (Http::recorded() as [$request, $response]) {
    if ($request->url() === $userA->slack_webhook_url) {
        $sentToA = true;
    }
    if ($request->url() === $userB->slack_webhook_url) {
        $sentToB = true;
    }
}

if ($sentToB && !$sentToA) {
    echo "[PASSED] Test 4: notifyMultiple dispatched webhook only to User B, excluded User A.\n";
} else {
    $allPassed = false;
    echo "[FAILED] Test 4: Sent to A: " . ($sentToA ? 'YES' : 'NO') . ", Sent to B: " . ($sentToB ? 'YES' : 'NO') . "\n";
}

// -----------------------------------------------------------------
// TEST 5: Direct dispatchWebhooks() guard check
// -----------------------------------------------------------------
echo "\n[RUNNING] Test 5: Direct dispatchWebhooks() called on User A when User A is authenticated...\n";
Http::fake([
    'https://hooks.slack.com/*' => Http::response(['ok' => true], 200),
]);

$notificationService->dispatchWebhooks($userA, [
    'sender_user_id' => $userA->id,
    'type' => 'task_updated',
    'title' => 'Direct dispatch',
    'message' => 'Direct message'
]);

$recordedCount = count(Http::recorded());

if ($recordedCount === 0) {
    echo "[PASSED] Test 5: dispatchWebhooks guarded against dispatching to authenticated user.\n";
} else {
    $allPassed = false;
    echo "[FAILED] Test 5: dispatchWebhooks failed to guard against dispatching to authenticated user.\n";
}

echo "\n=================================================================\n";
if ($allPassed) {
    echo "       ALL SLACK NOTIFICATION EXCLUSION TESTS PASSED!           \n";
} else {
    echo "       SOME TESTS FAILED!                                       \n";
}
echo "=================================================================\n";

exit($allPassed ? 0 : 1);
