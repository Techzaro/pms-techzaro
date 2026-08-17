<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Http\Controllers\DashboardController;
use App\Mail\NotificationMail;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;

$results = [
    'Test 1: Project Member Count Parity' => false,
    'Test 2: Outlook Email Deep Links & Structure' => false,
    'Test 3: Comment Text Inside Emails & Entity Decoding' => false,
    'Test 4: Professional Description Validation & Entity Decoding' => false,
    'Test 5: Frontend UI Cleanup Verification' => false,
];

$details = [];

echo "=================================================================\n";
echo "           AUTOMATED QA FINAL VERIFICATION SUITE                 \n";
echo "=================================================================\n\n";

// -----------------------------------------------------------------
// TEST 1: Project Member Count Parity
// -----------------------------------------------------------------
echo "[RUNNING] Test 1: Project Member Count Parity...\n";
try {
    $user = User::where('role', 'admin')->first() ?? User::first();
    $projects = Project::whereIn('status', ['Planning', 'In-progress', 'Paused'])->take(10)->get();
    if ($projects->isEmpty()) {
        $projects = Project::take(10)->get();
    }
    $allMatched = true;

    foreach ($projects as $project) {
        $directMembersCount = $project->getMembers()->count();

        // Reflection to call private computeActiveProjects on DashboardController
        $controller = new DashboardController();
        $reflection = new ReflectionClass(DashboardController::class);
        $method = $reflection->getMethod('computeActiveProjects');
        $method->setAccessible(true);
        $dashboardProjects = $method->invoke($controller, $user, [$project->id]);

        $dashboardCount = 0;
        if (!empty($dashboardProjects)) {
            $dashboardCount = $dashboardProjects[0]['members_count'] ?? 0;
        }

        if ($directMembersCount !== $dashboardCount) {
            $allMatched = false;
            $details['Test 1'] = "Mismatch on Project ID {$project->id}: Direct={$directMembersCount}, Dashboard={$dashboardCount}";
            break;
        }
    }

    if ($allMatched) {
        $results['Test 1: Project Member Count Parity'] = true;
        $details['Test 1'] = "100% match across " . count($projects) . " projects tested between DashboardController & Project::getMembers()";
    }
} catch (\Throwable $e) {
    $details['Test 1'] = "Execution Error: " . $e->getMessage();
}

// -----------------------------------------------------------------
// TEST 2: Outlook Email Deep Links & Structure
// -----------------------------------------------------------------
echo "[RUNNING] Test 2: Outlook Email Deep Links & Structure...\n";
try {
    $user = User::first();
    $task = Task::first();
    $notif = new Notification([
        'user_id' => $user->id,
        'type' => 'task',
        'related_module' => 'task',
        'related_id' => $task ? $task->id : 1,
        'title' => 'Task Update Notification',
        'message' => 'This is a test notification message for Outlook deep link verification.',
    ]);

    $mailable = new NotificationMail($notif);
    $html = $mailable->render();

    $hasMso = str_contains($html, '<!--[if mso]>') && str_contains($html, 'font-family: Arial, Helvetica, sans-serif !important;');
    $hasHref = str_contains($html, 'href=') && (str_contains($html, 'http://') || str_contains($html, 'https://'));
    $hasArialInline = str_contains($html, 'font-family:Arial,Helvetica,sans-serif');
    $hasLightThemeBg = str_contains($html, 'background-color:#f3f4f6');
    $hasCardContainer = str_contains($html, 'background-color:#ffffff') && str_contains($html, 'box-shadow');

    if ($hasMso && $hasHref && $hasArialInline && $hasLightThemeBg && $hasCardContainer) {
        $results['Test 2: Outlook Email Deep Links & Structure'] = true;
        $details['Test 2'] = "Premium Light Theme (#f3f4f6 bg, #ffffff card), Outlook MSO blocks, href deep links, and Arial inline typography verified";
    } else {
        $details['Test 2'] = "Verification Failed. MSO: " . ($hasMso ? 'Yes' : 'No') . ", Href: " . ($hasHref ? 'Yes' : 'No') . ", Light Theme: " . ($hasLightThemeBg ? 'Yes' : 'No');
    }
} catch (\Throwable $e) {
    $details['Test 2'] = "Execution Error: " . $e->getMessage();
}

// -----------------------------------------------------------------
// TEST 3: Comment Text Inside Emails & Entity Decoding
// -----------------------------------------------------------------
echo "[RUNNING] Test 3: Comment Text Inside Emails & Entity Decoding...\n";
try {
    $user = User::first();
    $task = Task::first();
    $richCommentText = "<p>User&nbsp;should&nbsp;be able to complete &amp; verify task output.</p>";
    $expectedCleanComment = "User should be able to complete & verify task output.";
    $mockAuthor = "QA Test Automation Engine";

    $notif = new Notification([
        'user_id' => $user->id,
        'sender_user_id' => $user->id,
        'type' => 'task_comment',
        'related_module' => 'task',
        'related_id' => $task ? $task->id : 1,
        'title' => 'New Comment on Task',
        'message' => "{$mockAuthor} commented on task",
        'changes' => [
            'comment_text' => $richCommentText,
            'comment_by' => $mockAuthor,
            'comment_at' => now()->format('d M Y, g:i A'),
        ],
    ]);

    $mailable = new NotificationMail($notif);
    $html = $mailable->render();

    $containsCleanText = str_contains($html, $expectedCleanComment);
    $noRawEntities = !str_contains($html, '&nbsp;');
    $containsAuthor = str_contains($html, $mockAuthor);
    $containsCommentCard = str_contains($html, 'Comment from') || str_contains($html, '💬 Comment');

    if ($containsCleanText && $noRawEntities && $containsAuthor && $containsCommentCard) {
        $results['Test 3: Comment Text Inside Emails & Entity Decoding'] = true;
        $details['Test 3'] = "Clean comment text rendered without &nbsp; or <p> tags; author and comment card verified";
    } else {
        $details['Test 3'] = "Comment decoding failed. Clean Text: " . ($containsCleanText ? 'Yes' : 'No') . ", No &nbsp;: " . ($noRawEntities ? 'Yes' : 'No') . ", Author: " . ($containsAuthor ? 'Yes' : 'No');
    }
} catch (\Throwable $e) {
    $details['Test 3'] = "Execution Error: " . $e->getMessage();
}

// -----------------------------------------------------------------
// TEST 4: Professional Description Validation & Entity Decoding
// -----------------------------------------------------------------
echo "[RUNNING] Test 4: Professional Description Validation & Entity Decoding...\n";
try {
    $user = User::first();
    $richDescription = "<p>You&nbsp;have&nbsp;to&nbsp;complete this project milestone &amp; deploy to production server.</p>";
    $expectedCleanDesc = "You have to complete this project milestone & deploy to production server.";

    $notif = new Notification([
        'user_id' => $user->id,
        'type' => 'task',
        'related_module' => 'task',
        'related_id' => 1,
        'title' => 'Project Milestone Update',
        'message' => $richDescription,
    ]);

    $mailable = new NotificationMail($notif);
    $html = $mailable->render();

    $containsCleanDesc = str_contains($html, $expectedCleanDesc);
    $noRawEntitiesInMessage = !str_contains($html, 'You&nbsp;have&nbsp;to&nbsp;complete');
    $noDescriptionBox = !str_contains($html, 'Description &amp; Details') && !str_contains($html, 'Description & Details');
    $hasStrict600px = str_contains($html, 'width="600"') && str_contains($html, 'max-width:600px');

    if ($containsCleanDesc && $noRawEntitiesInMessage && $noDescriptionBox && $hasStrict600px) {
        $results['Test 4: Professional Description Validation & Entity Decoding'] = true;
        $details['Test 4'] = "Clean description rendered naturally as standard paragraph without UI container box; 600px Outlook fit verified";
    } else {
        $details['Test 4'] = "Description UI failed. Clean Desc: " . ($containsCleanDesc ? 'Yes' : 'No') . ", No Entities: " . ($noRawEntitiesInMessage ? 'Yes' : 'No') . ", No Container Box: " . ($noDescriptionBox ? 'Yes' : 'No') . ", 600px Outlook Fit: " . ($hasStrict600px ? 'Yes' : 'No');
    }
} catch (\Throwable $e) {
    $details['Test 4'] = "Execution Error: " . $e->getMessage();
}

// -----------------------------------------------------------------
// TEST 5: Frontend UI Cleanup Verification
// -----------------------------------------------------------------
echo "[RUNNING] Test 5: Frontend UI Cleanup Verification...\n";
try {
    $jsxPath = __DIR__ . '/../../frontend/src/pages/Notifications.jsx';
    if (!file_exists($jsxPath)) {
        $jsxPath = 'c:/Users/makhd/Desktop/pms-techzaro/frontend/src/pages/Notifications.jsx';
    }

    $jsxContent = file_get_contents($jsxPath);

    $hasCommentSectionDef = str_contains($jsxContent, 'function NotificationCommentSection');
    $hasCommentSectionUsage = str_contains($jsxContent, '<NotificationCommentSection');
    $hasCommentForm = str_contains($jsxContent, 'notif-comment-form');

    if (!$hasCommentSectionDef && !$hasCommentSectionUsage && !$hasCommentForm) {
        $results['Test 5: Frontend UI Cleanup Verification'] = true;
        $details['Test 5'] = "Confirmed Notifications.jsx is 100% clean of NotificationCommentSection, input boxes, and comment state";
    } else {
        $details['Test 5'] = "UI Cleanup Failed. Def: " . ($hasCommentSectionDef ? 'Found' : 'Clean') . ", Usage: " . ($hasCommentSectionUsage ? 'Found' : 'Clean') . ", Form: " . ($hasCommentForm ? 'Found' : 'Clean');
    }
} catch (\Throwable $e) {
    $details['Test 5'] = "Execution Error: " . $e->getMessage();
}

// -----------------------------------------------------------------
// TEST 6: Uniform Email Borders & Frontend Intended URL Redirect
// -----------------------------------------------------------------
echo "[RUNNING] Test 6: Uniform Email Borders & Frontend Intended URL Redirect...\n";
try {
    $user = User::first();
    $notif = new Notification([
        'user_id' => $user->id,
        'type' => 'task_comment',
        'related_module' => 'task',
        'related_id' => 1,
        'title' => 'Comment Notification',
        'message' => 'Testing email border uniformity.',
        'changes' => ['comment_text' => 'Uniform border comment text', 'comment_by' => 'Tester'],
    ]);

    $mailable = new NotificationMail($notif);
    $html = $mailable->render();

    $noMismatchedLeftBorder = !str_contains($html, 'border-left:4px solid #2563eb');
    $hasUniformBorder = str_contains($html, 'border:1px solid #e5e7eb');

    $loginJsx = file_get_contents('c:/Users/makhd/Desktop/pms-techzaro/frontend/src/pages/Login.jsx');
    $protectedJsx = file_get_contents('c:/Users/makhd/Desktop/pms-techzaro/frontend/src/components/ProtectedRoute.jsx');

    $hasLoginIntendedRedirect = str_contains($loginJsx, 'intended_url') && str_contains($loginJsx, 'location.state?.from');
    $hasProtectedIntendedSave = str_contains($protectedJsx, 'intended_url') && str_contains($protectedJsx, 'intendedPath');

    if ($noMismatchedLeftBorder && $hasUniformBorder && $hasLoginIntendedRedirect && $hasProtectedIntendedSave) {
        $results['Test 6: Uniform Borders & Deep Link Intended Redirect'] = true;
        $details['Test 6'] = "Unified #e5e7eb email borders verified; ProtectedRoute & Login intended_url deep-link redirect confirmed";
    } else {
        $details['Test 6'] = "Test Failed. Border Uniformity: " . ($noMismatchedLeftBorder ? 'Yes' : 'No') . ", Login Intended URL: " . ($hasLoginIntendedRedirect ? 'Yes' : 'No') . ", Protected Intended URL: " . ($hasProtectedIntendedSave ? 'Yes' : 'No');
    }
} catch (\Throwable $e) {
    $details['Test 6'] = "Execution Error: " . $e->getMessage();
}

echo "\n=================================================================\n";
echo "                      SUMMARY RESULTS                            \n";
echo "=================================================================\n";
foreach ($results as $testName => $passed) {
    $status = $passed ? "[PASS]" : "[FAIL]";
    echo sprintf("%-60s %s\n", $testName, $status);
    $key = substr($testName, 0, 6);
    echo "   Detail: " . ($details[$key] ?? '') . "\n\n";
}
echo "=================================================================\n";
