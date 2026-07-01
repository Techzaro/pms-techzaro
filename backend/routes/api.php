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
use App\Http\Controllers\ActivityController;

/*
| Public Routes
| These routes are accessible without authentication.
*/

// User login (no auth required)
Route::post('/login', [AuthController::class, 'login']);

// Password reset (no auth required)
Route::post('/forgot-password', [\App\Http\Controllers\PasswordResetController::class, 'forgotPassword']);
Route::post('/reset-password', [\App\Http\Controllers\PasswordResetController::class, 'resetPassword']);


/*
| Protected Routes (require valid Sanctum token)
| These routes require authentication via Sanctum middleware.
*/

Route::middleware('auth:sanctum')->group(function () {

    /*
    | Authentication & Profile Routes
    | Routes for user authentication, profile management, and password changes.
    */

    // User logout
    Route::post('/logout', [AuthController::class, 'logout']);

    // Get current authenticated user
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // View own profile
    Route::get('/auth/my-profile', [AuthController::class, 'myProfile']);

    // Update own profile
    Route::post('/auth/update-profile', [AuthController::class, 'updateProfile']);

    // Change password (requires old password)
    Route::put('/user/change-password', [AuthController::class, 'changePassword']);

    // First-time password change (no old password required)
    Route::put('/user/first-time-change-password', [AuthController::class, 'firstTimeChangePassword']);

    /*
    | Dashboard Routes
    | Main dashboard data for authenticated users.
    */
    Route::get('/dashboard', [DashboardController::class, 'index']);

    /*
    | User Management Routes
    | Admin and manager only: CRUD operations for managing users.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // List all users
        Route::get('/users', [UserController::class, 'index']);
        // Create new user
        Route::post('/users', [UserController::class, 'store']);
        // View user details
        Route::get('/users/{user}', [UserController::class, 'show']);
        // Update user information
        Route::put('/users/{user}', [UserController::class, 'update']);
        // Delete user
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        // Mark user as resigned
        Route::put('/users/{user}/resign', [UserController::class, 'resign']);
        // View user profile
        Route::get('/users/{id}/profile', [UserController::class, 'profile']);
        // Test email functionality
        Route::post('/test-email', [UserController::class, 'testEmail']);
        // Reorder users list
        Route::post('/users/reorder', [UserController::class, 'reorder']);
    });

    // Get users for team management (all authenticated users)
    Route::get('/team-users', [UserController::class, 'getTeamUsers']);

    // Member/Team Lead: view own team(s)
    Route::get('/my-team', [TeamController::class, 'myTeam']);

    /*
    | Team Management Routes
    | Admin and manager only: CRUD operations for managing teams and members.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // List all teams
        Route::get('/teams', [TeamController::class, 'index']);
        // Create new team
        Route::post('/teams', [TeamController::class, 'store']);
        // View team details
        Route::get('/teams/{team}', [TeamController::class, 'show']);
        // Update team information
        Route::put('/teams/{team}', [TeamController::class, 'update']);
        // Set team leader
        Route::put('/teams/{team}/leader', [TeamController::class, 'setLeader']);
        // Add member to team
        Route::post('/teams/{team}/members', [TeamController::class, 'addMember']);
        // Remove member from team
        Route::delete('/teams/{team}/members/{user}', [TeamController::class, 'removeMember']);
        // Delete team
        Route::delete('/teams/{team}', [TeamController::class, 'destroy']);
    });

    /*
    | Project Management Routes (Read)
    | All authenticated users can view projects and mark changes as read.
    */
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::post('/projects/{project}/changes/mark-read', [ProjectController::class, 'markChangesRead']);

    /*
    | Project Management Routes (Write)
    | Admin and manager only: create, update, delete projects and manage files.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Create new project
        Route::post('/projects', [ProjectController::class, 'store']);
        // Update project
        Route::put('/projects/{project}', [ProjectController::class, 'update']);
        // Partial update project
        Route::patch('/projects/{project}', [ProjectController::class, 'patch']);
        // Delete project
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
        // Upload project file
        Route::post('/projects/{project}/files', [ProjectController::class, 'uploadFile']);
        // Add link to project
        Route::post('/projects/{project}/links', [ProjectController::class, 'addLink']);
        // Delete project file
        Route::delete('/projects/{project}/files/{file}', [ProjectController::class, 'deleteFile']);
    });

    // Project visibility settings (admin and manager only)
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Get project visibility settings
        Route::get('/projects/{project}/visibility', [ProjectController::class, 'getVisibility']);
        // Update project visibility settings
        Route::post('/projects/{project}/visibility', [ProjectController::class, 'setVisibility']);
    });

    // Mark project as complete (any assigned user)
    Route::post('/projects/{project}/complete', [ProjectController::class, 'completeProject']);

    /*
    | Task Management Routes
    | CRUD operations, submission workflows, file attachments, and personal notes for tasks.
    */

    // Create standalone task (no project required)
    Route::post('/tasks', [TaskController::class, 'storeStandalone']);

    // Create task under a project (any authenticated user)
    Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);

    // Task CRUD operations
    Route::get('/tasks/{task}', [TaskController::class, 'show']); // View task details
    Route::put('/tasks/{task}', [TaskController::class, 'update']); // Update task
    Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus']); // Update task status
    Route::post('/tasks/{task}/complete', [TaskController::class, 'completeTask']); // Mark task as complete
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']); // Delete task

    // Task submission workflow (submit for review, approve, reject, reopen)
    Route::post('/tasks/{task}/submit', [TaskController::class, 'submit']); // Submit task for review
    Route::get('/tasks/{task}/latest-submission', [TaskController::class, 'latestSubmission']); // Get latest submission
    Route::get('/tasks/submission-file/{submission}', [TaskController::class, 'downloadSubmissionFile']); // Download submission file
    Route::post('/tasks/{task}/approve', [TaskController::class, 'approve']); // Approve submitted task
    Route::post('/tasks/{task}/reject', [TaskController::class, 'reject']); // Reject submitted task
    Route::post('/tasks/{task}/reopen', [TaskController::class, 'reopen']); // Reopen rejected task

    // Project submission workflow (similar to task submission)
    Route::post('/projects/{project}/submit', [ProjectController::class, 'submit']); // Submit project for review
    Route::get('/projects/{project}/latest-submission', [ProjectController::class, 'latestSubmission']); // Get latest submission
    Route::get('/projects/submission-file/{submission}', [ProjectController::class, 'downloadSubmissionFile']); // Download submission file
    Route::post('/projects/{project}/approve', [ProjectController::class, 'approve']); // Approve submitted project
    Route::post('/projects/{project}/reject', [ProjectController::class, 'reject']); // Reject submitted project
    Route::post('/projects/{project}/reopen', [ProjectController::class, 'reopen']); // Reopen rejected project

    // Reorder tasks within a project
    Route::post('/tasks/reorder', [TaskController::class, 'reorderTasks']);

    // Mark task changes as read (for notification tracking)
    Route::post('/tasks/{task}/changes/mark-read', [TaskController::class, 'markChangesRead']);

    // Task file attachments and links
    Route::post('/tasks/{task}/files', [TaskController::class, 'uploadFile']); // Upload file to task
    Route::post('/tasks/{task}/links', [TaskController::class, 'addLink']); // Add link to task
    Route::delete('/tasks/{task}/files/{file}', [TaskController::class, 'deleteFile']); // Delete task file

    // Personal user notes on tasks (private per user)
    Route::get('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'show']); // View own note
    Route::post('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'store']); // Create/update own note
    Route::delete('/tasks/{task}/my-note/{note}', [\App\Http\Controllers\TaskUserNoteController::class, 'destroy']); // Delete own note

    // Task filtering routes
    Route::get('/my-tasks', [TaskController::class, 'myTasks']); // Tasks assigned to me
    Route::get('/assigned-tasks', [TaskController::class, 'assignedByMe']); // Tasks I assigned to others
    Route::get('/self-tasks', [TaskController::class, 'mySelfTasks']); // Tasks I created for myself
    Route::get('/user-tasks/{userId}', [TaskController::class, 'userTasks']); // Tasks assigned to specific user

    /*
    | Deliverable Management Routes
    | CRUD operations, submission workflows, and review actions for deliverables.
    */
    // Read routes (all authenticated users)
    Route::get('/deliverables', [DeliverableController::class, 'index']); // List all deliverables
    Route::get('/deliverables/assigned-by-me', [DeliverableController::class, 'assignedByMe']); // Deliverables I assigned
    Route::get('/deliverables/submission-file/{submission}', [DeliverableController::class, 'downloadSubmissionFile']); // Download submission file
    Route::get('/deliverables/{deliverable}', [DeliverableController::class, 'show']); // View deliverable details
    Route::post('/deliverables/{deliverable}/changes/mark-read', [DeliverableController::class, 'markChangesRead']); // Mark changes as read
    Route::get('/self-deliverables', [DeliverableController::class, 'mySelfDeliverables']); // Deliverables I created for myself
    Route::post('/deliverables/reorder', [DeliverableController::class, 'reorder']); // Reorder deliverables

    // Write routes (admin, manager, team lead only)
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead')->group(function () {
        Route::post('/projects/{project}/deliverables', [DeliverableController::class, 'store']); // Create deliverable
        Route::put('/deliverables/{deliverable}', [DeliverableController::class, 'update']); // Update deliverable
        Route::delete('/deliverables/{deliverable}', [DeliverableController::class, 'destroy']); // Delete deliverable
        Route::post('/deliverables/{deliverable}/approve', [DeliverableController::class, 'approve']); // Approve deliverable
        Route::post('/deliverables/{deliverable}/reject', [DeliverableController::class, 'reject']); // Reject deliverable
        Route::post('/deliverables/{deliverable}/reopen', [DeliverableController::class, 'reopen']); // Reopen deliverable
    });

    // Deliverable submission workflow
    Route::post('/deliverables/{deliverable}/submit', [DeliverableController::class, 'submit']); // Submit deliverable for review
    Route::get('/deliverables/{deliverable}/latest-submission', [DeliverableController::class, 'latestSubmission']); // Get latest submission

    // Self-deliverable review actions (assignee reviews their own work)
    Route::post('/deliverables/{deliverable}/self-approve', [DeliverableController::class, 'selfApprove']); // Self-approve deliverable
    Route::post('/deliverables/{deliverable}/self-rework', [DeliverableController::class, 'selfRework']); // Mark for rework

    /*
    | Notification Routes
    | Manage user notifications and device tokens for push notifications.
    */
    Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']); // List notifications
    Route::get('/notifications/unread-count', [\App\Http\Controllers\NotificationController::class, 'unreadCount']); // Get unread count
    Route::post('/notifications/{notification}/read', [\App\Http\Controllers\NotificationController::class, 'markAsRead']); // Mark notification as read
    Route::post('/notifications/read-all', [\App\Http\Controllers\NotificationController::class, 'markAllAsRead']); // Mark all as read

    // Device tokens for push notifications (all authenticated users)
    Route::post('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'store']); // Register device token
    Route::delete('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'destroy']); // Remove device token

    /*
    | Activity Routes
    | Track user activities and work logs.
    */
    Route::get('/activities/today', [ActivityController::class, 'today']); // Today's activities
    Route::get('/activities/past', [ActivityController::class, 'past']); // Past activities
    Route::get('/activities', [ActivityController::class, 'index']); // All activities

    /*
    | Calendar / Event Routes
    | CRUD operations for calendar events.
    */
    Route::get('/events', [EventController::class, 'index']); // List all events
    Route::get('/events/{event}', [EventController::class, 'show']); // View event details
    Route::post('/events', [EventController::class, 'store']); // Create new event
    Route::put('/events/{event}', [EventController::class, 'update']); // Update event
    Route::delete('/events/{event}', [EventController::class, 'destroy']); // Delete event

    /*
    | Unified Calendar Routes
    | Aggregate view of tasks, projects, deliverables, and events.
    */
    Route::get('/unified-calendar', [EventController::class, 'unifiedCalendar']); // Get unified calendar data
    Route::get('/unified-summary', [EventController::class, 'unifiedSummary']); // Get unified summary

    /*
    | Report Routes
    | Various reporting endpoints for analytics and performance tracking.
    */
    Route::get('/reports/team-performance', [ReportController::class, 'teamPerformance']); // Team performance report
    Route::get('/reports/summary', [ReportController::class, 'summaryReport']); // Summary report
    Route::get('/reports/detailed', [ReportController::class, 'detailedReport']); // Detailed report
    Route::get('/reports/performance', [ReportController::class, 'performanceReport']); // Performance report
    Route::get('/reports/progress', [ReportController::class, 'progressReport']); // Progress report
    Route::get('/reports/user/{user}', [ReportController::class, 'userPerformance']); // User performance report
    Route::get('/reports/project/{project}', [ReportController::class, 'projectReport']); // Project report
    Route::get('/reports/summary-cards', [ReportController::class, 'summaryCards']); // Summary cards data
    Route::get('/reports/user-performance-table', [ReportController::class, 'userPerformanceTable']); // User performance table
    Route::get('/reports/company-employees', [ReportController::class, 'companyEmployeesReport']); // Company employees report

    /*
    | Role-Based Dashboard Routes
    | Personalized dashboard information based on user role.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead,member')->group(function () {
        // Get role-specific welcome message and dashboard data
        Route::get('/role-dashboard', function (Request $request) {
            return response()->json([
                'message' => 'Welcome ' . ucfirst(str_replace('_', ' ', $request->user()->role)),
                'role' => $request->user()->role,
            ]);
        });
    });

});

/*
| Document Download Routes
| These routes are outside auth:sanctum so <a> tags can access them with ?token= query param.
*/
Route::get('/deliverables/attachment/{attachment}/download', [DeliverableController::class, 'downloadAttachment']); // Download deliverable attachment
Route::get('/auth/my-documents/{document}', [UserController::class, 'downloadMyDocument']); // Download own document
Route::get('/users/{user}/documents/{document}', [UserController::class, 'downloadDocument']); // Download user document
