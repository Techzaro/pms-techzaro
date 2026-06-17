<?php

/**
 * API route definitions for the PMS backend.
 *
 * Public routes are available without authentication.
 * Protected routes require a valid Sanctum token.
 * Role-specific routes use RoleMiddleware to enforce access.
 */
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\DeliverableController;
use App\Http\Controllers\EventController;

/*
| PUBLIC ROUTES
*/

// Login (no auth required)
Route::post('/login', [AuthController::class, 'login']);


/*
| PROTECTED ROUTES (Need Token)
*/

Route::middleware('auth:sanctum')->group(function () {

    // Logout
    Route::post('/logout', [AuthController::class, 'logout']);

    // Get logged in user
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // My profile (current user)
    Route::get('/auth/my-profile', [AuthController::class, 'myProfile']);

    // Update own profile (any authenticated user)
    Route::post('/auth/update-profile', [AuthController::class, 'updateProfile']);

    // Download own documents (any authenticated user)
    Route::get('/auth/my-documents/{document}', [UserController::class, 'downloadMyDocument']);

    // Change password
    Route::put('/user/change-password', [AuthController::class, 'changePassword']);

    // First-time password change (no old password required)
    Route::put('/user/first-time-change-password', [AuthController::class, 'firstTimeChangePassword']);

    /*
    | DASHBOARD
    */
    Route::get('/dashboard', [DashboardController::class, 'index']);

    /*
    | USER MANAGEMENT (admin and manager)
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::get('/users/{user}', [UserController::class, 'show']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        Route::put('/users/{user}/resign', [UserController::class, 'resign']);
        Route::get('/users/{id}/profile', [UserController::class, 'profile']);
        Route::get('/users/{user}/documents/{document}', [UserController::class, 'downloadDocument']);
        Route::post('/test-email', [UserController::class, 'testEmail']);
    });

    // Get users for team management (all authenticated users)
    Route::get('/team-users', [UserController::class, 'getTeamUsers']);

    /*
    | TEAM MANAGEMENT (admin and manager)
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::get('/teams', [TeamController::class, 'index']);
        Route::post('/teams', [TeamController::class, 'store']);
        Route::get('/teams/{team}', [TeamController::class, 'show']);
        Route::put('/teams/{team}', [TeamController::class, 'update']);
        Route::put('/teams/{team}/leader', [TeamController::class, 'setLeader']);
        Route::post('/teams/{team}/members', [TeamController::class, 'addMember']);
        Route::delete('/teams/{team}/members/{user}', [TeamController::class, 'removeMember']);
        Route::delete('/teams/{team}', [TeamController::class, 'destroy']);
    });

    /*
    | PROJECT MANAGEMENT - READ (all authenticated users)
    */
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::post('/projects/{project}/changes/mark-read', [ProjectController::class, 'markChangesRead']);

    /*
    | PROJECT MANAGEMENT - WRITE (admin and manager only)
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::post('/projects', [ProjectController::class, 'store']);
        Route::put('/projects/{project}', [ProjectController::class, 'update']);
        Route::patch('/projects/{project}', [ProjectController::class, 'patch']);
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
        Route::post('/projects/{project}/files', [ProjectController::class, 'uploadFile']);
        Route::post('/projects/{project}/links', [ProjectController::class, 'addLink']);
        Route::delete('/projects/{project}/files/{file}', [ProjectController::class, 'deleteFile']);
    });

    // Project visibility (admin and manager only)
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::get('/projects/{project}/visibility', [ProjectController::class, 'getVisibility']);
        Route::post('/projects/{project}/visibility', [ProjectController::class, 'setVisibility']);
    });

    // Project completion (any assigned user can mark it complete)
    Route::post('/projects/{project}/complete', [ProjectController::class, 'completeProject']);

    /*
    | TASK MANAGEMENT
    */

    // Standalone task creation (no project required)
    Route::post('/tasks', [TaskController::class, 'storeStandalone']);

    // Tasks under a project (any authenticated user can create)
    Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);

    // Task CRUD (all authenticated users can read; write handled per-route)
    Route::get('/tasks/{task}', [TaskController::class, 'show']);
    Route::put('/tasks/{task}', [TaskController::class, 'update']);
    Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus']);
    Route::post('/tasks/{task}/complete', [TaskController::class, 'completeTask']);
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);

    // Task submission workflow
    Route::post('/tasks/{task}/submit', [TaskController::class, 'submit']);
    Route::get('/tasks/{task}/latest-submission', [TaskController::class, 'latestSubmission']);
    Route::get('/tasks/submission-file/{submission}', [TaskController::class, 'downloadSubmissionFile']);
    Route::post('/tasks/{task}/approve', [TaskController::class, 'approve']);
    Route::post('/tasks/{task}/reject', [TaskController::class, 'reject']);
    Route::post('/tasks/{task}/reopen', [TaskController::class, 'reopen']);

    // Project submission workflow
    Route::post('/projects/{project}/submit', [ProjectController::class, 'submit']);
    Route::get('/projects/{project}/latest-submission', [ProjectController::class, 'latestSubmission']);
    Route::get('/projects/submission-file/{submission}', [ProjectController::class, 'downloadSubmissionFile']);
    Route::post('/projects/{project}/approve', [ProjectController::class, 'approve']);
    Route::post('/projects/{project}/reject', [ProjectController::class, 'reject']);
    Route::post('/projects/{project}/reopen', [ProjectController::class, 'reopen']);

    // Subtask creation under a parent task
    Route::post('/tasks/{task}/subtasks', [TaskController::class, 'storeSubtask']);

    // Mark task changes as read
    Route::post('/tasks/{task}/changes/mark-read', [TaskController::class, 'markChangesRead']);

    // Task file attachments
    Route::post('/tasks/{task}/files', [TaskController::class, 'uploadFile']);
    Route::post('/tasks/{task}/links', [TaskController::class, 'addLink']);
    Route::delete('/tasks/{task}/files/{file}', [TaskController::class, 'deleteFile']);

    // Personal user notes on tasks (private per user)
    Route::get('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'show']);
    Route::post('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'store']);

    // My tasks / Assigned by me / Self tasks
    Route::get('/my-tasks', [TaskController::class, 'myTasks']);
    Route::get('/assigned-tasks', [TaskController::class, 'assignedByMe']);
    Route::get('/self-tasks', [TaskController::class, 'mySelfTasks']);

    /*
    | DELIVERABLES
    */
    Route::get('/deliverables', [DeliverableController::class, 'index']);
    Route::get('/deliverables/assigned-by-me', [DeliverableController::class, 'assignedByMe']);
    Route::get('/deliverables/submission-file/{submission}', [DeliverableController::class, 'downloadSubmissionFile']);
    Route::get('/deliverables/{deliverable}', [DeliverableController::class, 'show']);
    Route::post('/deliverables/{deliverable}/changes/mark-read', [DeliverableController::class, 'markChangesRead']);
    Route::get('/self-deliverables', [DeliverableController::class, 'mySelfDeliverables']);

    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead')->group(function () {
        Route::post('/projects/{project}/deliverables', [DeliverableController::class, 'store']);
        Route::put('/deliverables/{deliverable}', [DeliverableController::class, 'update']);
        Route::delete('/deliverables/{deliverable}', [DeliverableController::class, 'destroy']);
        Route::post('/deliverables/{deliverable}/approve', [DeliverableController::class, 'approve']);
        Route::post('/deliverables/{deliverable}/reject', [DeliverableController::class, 'reject']);
        Route::post('/deliverables/{deliverable}/reopen', [DeliverableController::class, 'reopen']);
    });

    // Assignee can submit
    Route::post('/deliverables/{deliverable}/submit', [DeliverableController::class, 'submit']);
    // Get latest submission for a deliverable (assigner view)
    Route::get('/deliverables/{deliverable}/latest-submission', [DeliverableController::class, 'latestSubmission']);
    // Self-deliverable review actions
    Route::post('/deliverables/{deliverable}/self-approve', [DeliverableController::class, 'selfApprove']);
    Route::post('/deliverables/{deliverable}/self-rework', [DeliverableController::class, 'selfRework']);

    /*
    | NOTIFICATIONS + DEVICE TOKENS
    */
    Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [\App\Http\Controllers\NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{notification}/read', [\App\Http\Controllers\NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [\App\Http\Controllers\NotificationController::class, 'markAllAsRead']);

    // Device tokens for push notifications (all authenticated users)
    Route::post('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'store']);
    Route::delete('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'destroy']);

    /*
    | CALENDAR / EVENTS
    */
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/{event}', [EventController::class, 'show']);
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{event}', [EventController::class, 'update']);
    Route::delete('/events/{event}', [EventController::class, 'destroy']);

    /*
    | UNIFIED CALENDAR - TASKS, PROJECTS, DELIVERABLES & EVENTS
    */
    Route::get('/unified-calendar', [EventController::class, 'unifiedCalendar']);

    /*
    | REPORTS
    */
    Route::get('/reports/team-performance', [ReportController::class, 'teamPerformance']);
    Route::get('/reports/summary', [ReportController::class, 'summaryReport']);
    Route::get('/reports/detailed', [ReportController::class, 'detailedReport']);
    Route::get('/reports/performance', [ReportController::class, 'performanceReport']);
    Route::get('/reports/progress', [ReportController::class, 'progressReport']);
    Route::get('/reports/user/{user}', [ReportController::class, 'userPerformance']);
    Route::get('/reports/project/{project}', [ReportController::class, 'projectReport']);

    /*
    | ROLE BASED DASHBOARD INFO (all roles)
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead,member')->group(function () {
        Route::get('/role-dashboard', function (Request $request) {
            return response()->json([
                'message' => 'Welcome ' . ucfirst(str_replace('_', ' ', $request->user()->role)),
                'role' => $request->user()->role,
            ]);
        });
    });

});

// Download route outside auth:sanctum so <a> tags can access it with token query param
Route::get('/deliverables/attachment/{attachment}/download', [DeliverableController::class, 'downloadAttachment']);
