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
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\TaskCommentController;
use App\Http\Controllers\TaskFollowerController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\CredentialController;
use App\Http\Controllers\NotificationSettingController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\OrganizationSettingsController;
use App\Http\Controllers\OrganizationOrgController;
use App\Http\Controllers\RegionalSettingsController;

/*
| Public Routes
| These routes are accessible without authentication.
*/

// User login (no auth required)
Route::post('/login', [AuthController::class, 'login']);

// Password reset (no auth required)
Route::post('/forgot-password', [\App\Http\Controllers\PasswordResetController::class, 'forgotPassword']);
Route::post('/reset-password', [\App\Http\Controllers\PasswordResetController::class, 'resetPassword']);

// Public File Download Proxy (No auth required so browser download links work cleanly)
Route::get('/files/download', function (Illuminate\Http\Request $request) {
    $path = $request->query('path');
    $name = $request->query('name') ?: basename($path);
    if (! $path) {
        return response()->json(['success' => false, 'message' => 'File path required'], 400);
    }
    $resolved = \App\Services\FileStorageService::resolveFile($path);
    if (! $resolved) {
        return response()->json(['success' => false, 'message' => 'File not found'], 404);
    }
    return \Illuminate\Support\Facades\Storage::disk($resolved['disk'])->download($resolved['path'], $name);
});
Route::get('/tasks/submission-file/{submission}', [TaskController::class, 'downloadSubmissionFile']);
Route::get('/deliverables/submission-file/{submission}', [DeliverableController::class, 'downloadSubmissionFile']);


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
    Route::get('/auth/my-changes', [AuthController::class, 'myChanges']);
    
    // FEATURE: Route to save user's category-based desktop and email notification preferences
    Route::post('/user/notification-preferences', [UserController::class, 'updateNotificationPreferences']);
    Route::get('/notification-settings', [NotificationSettingController::class, 'index']);
    Route::put('/notification-settings', [NotificationSettingController::class, 'update']);
    Route::post('/notification-settings', [NotificationSettingController::class, 'update']);
    Route::post('/notification-settings/test-webhook', [NotificationSettingController::class, 'testWebhook']);

    // User Regional Settings (Timezone, Language, Working Hours, Date & Time Formats)
    Route::get('/regional-settings', [RegionalSettingsController::class, 'getSettings']);
    Route::put('/regional-settings', [RegionalSettingsController::class, 'updateSettings']);
    Route::post('/regional-settings', [RegionalSettingsController::class, 'updateSettings']);
    Route::get('/regional-settings/timezones', [RegionalSettingsController::class, 'getTimezones']);
    Route::get('/user/regional-settings', [RegionalSettingsController::class, 'getSettings']);
    Route::put('/user/regional-settings', [RegionalSettingsController::class, 'updateSettings']);

    // Organization settings (branding, subscription, email policy, regional & working hours)
    Route::get('/organization-settings/email-policy', [OrganizationSettingsController::class, 'getEmailPolicy']);
    Route::put('/organization-settings/email-policy', [OrganizationSettingsController::class, 'updateEmailPolicy']);
    Route::get('/organization-settings/branding', [OrganizationSettingsController::class, 'getBranding']);
    Route::put('/organization-settings/branding', [OrganizationSettingsController::class, 'updateBranding']);
    Route::get('/organization-settings/subscription', [OrganizationSettingsController::class, 'getSubscription']);
    Route::get('/organization-settings/subscription-history', [OrganizationSettingsController::class, 'getSubscriptionHistory']);
    Route::get('/organization-settings/details', [OrganizationSettingsController::class, 'getOrganizationDetails']);
    Route::get('/organization-settings/billing-history', [OrganizationSettingsController::class, 'getBillingHistory']);
    Route::put('/organization-settings/timezone', [OrganizationSettingsController::class, 'updateTimezone']);
    Route::get('/organization-settings/regional', [OrganizationSettingsController::class, 'getRegionalSettings']);
    Route::put('/organization-settings/regional', [OrganizationSettingsController::class, 'updateRegionalSettings']);
    Route::get('/organization-settings/working-hours', [OrganizationSettingsController::class, 'getRegionalSettings']);
    Route::put('/organization-settings/working-hours', [OrganizationSettingsController::class, 'updateRegionalSettings']);

    // Organization Storage Management
    Route::get('/organization/storage', [OrganizationOrgController::class, 'getStorageUsage']);
    Route::get('/organization/storage/summary', [OrganizationOrgController::class, 'getStorageSummary']);
    Route::get('/organization/storage/large-files', [OrganizationOrgController::class, 'getLargeFiles']);
    Route::post('/organization/storage/track', [OrganizationOrgController::class, 'trackStorageUsage']);
    Route::delete('/organization/storage/old-files', [OrganizationOrgController::class, 'deleteOldFiles']);
    Route::delete('/organization/storage/large-files', [OrganizationOrgController::class, 'deleteLargeFiles']);
    Route::delete('/organization/storage/{id}', [OrganizationOrgController::class, 'deleteStorageRecord']);

    // Storage Notifications
    Route::get('/organization/storage/notifications', [OrganizationOrgController::class, 'getStorageNotifications']);
    Route::post('/organization/storage/notifications/{notifId}/read', [OrganizationOrgController::class, 'markNotificationRead']);
    Route::post('/organization/storage/notifications/{notifId}/dismiss', [OrganizationOrgController::class, 'dismissNotification']);
    Route::post('/organization/storage/notifications/dismiss-all', [OrganizationOrgController::class, 'dismissAllNotifications']);

    // Storage Preferences
    Route::get('/organization/storage/preferences', [OrganizationOrgController::class, 'getStoragePreferences']);
    Route::put('/organization/storage/preferences', [OrganizationOrgController::class, 'updateStoragePreferences']);

    // Organization Billing
    Route::get('/organization/billing/invoices', [OrganizationOrgController::class, 'getBillingInvoices']);
    Route::post('/organization/billing/generate-invoice', [OrganizationOrgController::class, 'generateInvoice']);

    // Organization Support Tickets
    Route::get('/organization/support/tickets', [OrganizationOrgController::class, 'getSupportTickets']);
    Route::get('/organization/support/unread-count', [OrganizationOrgController::class, 'getUnreadSupportCount']);
    Route::post('/organization/support/tickets', [OrganizationOrgController::class, 'createSupportTicket']);
    Route::get('/organization/support/tickets/{ticketId}', [OrganizationOrgController::class, 'getSupportTicketDetail']);
    Route::post('/organization/support/tickets/{ticketId}/reply', [OrganizationOrgController::class, 'replySupportTicket']);
    Route::post('/organization/support/tickets/{ticketId}/close', [OrganizationOrgController::class, 'closeSupportTicket']);

    // Self-service document management
    Route::put('/auth/my-document/rename', [\App\Http\Controllers\UserController::class, 'renameMyDocument']);
    Route::post('/auth/my-document/replace', [\App\Http\Controllers\UserController::class, 'replaceMyDocument']);
    Route::delete('/auth/my-document', [\App\Http\Controllers\UserController::class, 'removeMyDocument']);

    // Update own profile
    Route::post('/auth/update-profile', [AuthController::class, 'updateProfile']);

    // Change password (requires old password)
    Route::put('/user/change-password', [AuthController::class, 'changePassword']);

    // First-time password change (no old password required)
    Route::put('/user/first-time-change-password', [AuthController::class, 'firstTimeChangePassword']);

    // Activity view tracking
    Route::post('/activity-views/check', [\App\Http\Controllers\ActivityviewController::class, 'check']);
    Route::post('/activity-views/mark-viewed', [\App\Http\Controllers\ActivityviewController::class, 'markViewed']);

    /*
    | Global Search Routes
    | Search across projects, tasks, and deliverables by business code or title.
    */
    Route::get('/search', [\App\Http\Controllers\SearchController::class, 'search']);

    /*
    | Business ID Backfill Route
    | Run once after deployment to generate missing business_ids for existing data.
    | GET /api/admin/backfill-business-ids
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin')->get('/admin/backfill-business-ids', function () {
        $result = app(\App\Services\BusinessIdService::class)->backfillMissingBusinessIds();
        return response()->json([
            'success' => true,
            'message' => "Backfill complete: {$result['projects']} projects, {$result['tasks']} tasks, {$result['deliverables']} deliverables updated.",
            'data' => $result,
        ]);
    });

    /*
    | Dashboard Routes
    | Main dashboard data for authenticated users.
    */
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // List all users (available to all authenticated users for search, mentions, and task assignees)
    Route::get('/users', [UserController::class, 'index']);

    /*
    | User Management Routes
    | Admin and manager only: CRUD operations for managing users.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Create new user (enforces plan user limit)
        Route::post('/users', [UserController::class, 'store'])->middleware(\App\Http\Middleware\CheckPlanLimits::class . ':users');
        // View user details
        Route::get('/users/{user}', [UserController::class, 'show']);
        // Update user information
        Route::put('/users/{user}', [UserController::class, 'update']);
        // Delete user
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        // Mark user as resigned
        Route::put('/users/{user}/resign', [UserController::class, 'resign']);
        // Get resignation impact analysis (before confirming)
        Route::get('/users/{user}/resignation-impact', [UserController::class, 'resignationImpact']);
        // View user profile
        Route::get('/users/{id}/profile', [UserController::class, 'profile']);
        Route::get('/users/{id}/changes', [UserController::class, 'changes']);
        // Rename a user document (single docs label or other_document name)
        Route::put('/users/{user}/document/rename', [UserController::class, 'renameDocument']);
        // Replace a user document file (and optionally rename)
        Route::post('/users/{user}/document/replace', [UserController::class, 'replaceDocument']);
        // Remove a user document
        Route::delete('/users/{user}/document', [UserController::class, 'removeDocument']);
        // Test email functionality
        Route::post('/test-email', [UserController::class, 'testEmail']);
        // Reorder users list
        Route::post('/users/reorder', [UserController::class, 'reorder']);

        // Request user deletion (for Manager role)
        Route::post('/users/{user}/request-deletion', [UserController::class, 'requestDeletion']);

        // Guest (Client Portal) management
        Route::post('/guests', [UserController::class, 'storeGuest'])->middleware(\App\Http\Middleware\CheckPlanLimits::class . ':users');
        Route::put('/guests/{user}', [UserController::class, 'updateGuest']);
        Route::delete('/guests/{user}', [UserController::class, 'destroyGuest']);
        Route::post('/guests/{user}/resend-invitation', [UserController::class, 'resendInvitation']);
        Route::post('/guests/{user}/reset-password', [UserController::class, 'resetGuestPassword']);
        Route::put('/guests/{user}/toggle-status', [UserController::class, 'toggleGuestStatus']);
        Route::put('/guests/{user}/resign', [UserController::class, 'resignGuest']);

        // Company documents management (logo, QR code, contracts, etc.) - admin/manager only for write operations
        Route::post('/company-documents', [\App\Http\Controllers\CompanyDocumentController::class, 'store']);
        Route::delete('/company-documents/{type}', [\App\Http\Controllers\CompanyDocumentController::class, 'destroy']);
    });

    // Credential Management - Admin only
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin')->group(function () {
        // Admin changes a user's password
        Route::post('/users/{user}/admin-change-password', [CredentialController::class, 'changePassword']);
        // Admin unlocks password recovery for a user
        Route::post('/users/{user}/unlock-password-recovery', [CredentialController::class, 'unlockPasswordRecovery']);
        // Get credential management status for a user
        Route::get('/users/{user}/credential-status', [CredentialController::class, 'getCredentialStatus']);
    });

    // Company documents - view only for all authenticated users
    Route::get('/company-documents', [\App\Http\Controllers\CompanyDocumentController::class, 'index']);

    // Get users for team management (all authenticated users)
    Route::get('/team-users', [UserController::class, 'getTeamUsers']);

    // Get all guest users (for project creation dropdown)
    Route::get('/guest-users', function () {
        $guests = \App\Models\User::select('id', 'name', 'email', 'role', 'department', 'active')
            ->where('role', 'guest')
            ->orderBy('name')
            ->get();
        return response()->json(['success' => true, 'users' => $guests]);
    });

    // Member/Team Lead: view own team(s)
    Route::get('/my-team', [TeamController::class, 'myTeam']);

    /*
    | User Feedback & Product Improvement Routes
    */
    Route::post('/feedback', [FeedbackController::class, 'store']);
    Route::get('/feedback', [FeedbackController::class, 'index']);
    Route::get('/feedback/{id}', [FeedbackController::class, 'show']);
    Route::patch('/feedback/{id}', [FeedbackController::class, 'update']);
    Route::post('/feedback/{id}/notes', [FeedbackController::class, 'addNote']);

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

    // Team Working Hours (Accessible to Admin, Manager, and Team Leads)
    Route::get('/teams/{team}/working-hours', [TeamController::class, 'getWorkingHours']);
    Route::put('/teams/{team}/working-hours', [TeamController::class, 'updateWorkingHours'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/teams/{team}/working-hours', [TeamController::class, 'updateWorkingHours'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    /*
    | Project Management Routes (Read)
    | All authenticated users can view projects and mark changes as read.
    */
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::get('/projects/{project}/members', [ProjectController::class, 'getMembers']);
    Route::get('/projects/{project}/tasks', [ProjectController::class, 'getTasks']);
    Route::post('/projects/{project}/changes/mark-read', [ProjectController::class, 'markChangesRead']);

    /*
    | Project Management Routes (Write)
    | Admin and manager only: create, update, delete projects and manage files.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Create new project (enforces plan project limit)
        Route::post('/projects', [ProjectController::class, 'store'])->middleware(\App\Http\Middleware\CheckPlanLimits::class . ':projects');
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

    // Reorder project files (any authenticated user with project access)
    Route::post('/projects/{project}/files/reorder', [ProjectController::class, 'reorderFiles']);

    // Project visibility settings (admin and manager only)
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Get project visibility settings
        Route::get('/projects/{project}/visibility', [ProjectController::class, 'getVisibility']);
        // Update project visibility settings
        Route::post('/projects/{project}/visibility', [ProjectController::class, 'setVisibility']);
    });

    // Project access credentials
    // Any authenticated user can view credentials they're assigned to
    Route::get('/projects/{project}/access-credentials', [ProjectController::class, 'getAccessCredentials']);

    // Admin and manager only: create, update, delete access credentials
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        // Create access credential
        Route::post('/projects/{project}/access-credentials', [ProjectController::class, 'storeAccessCredential']);
        // Update access credential
        Route::put('/projects/{project}/access-credentials/{credential}', [ProjectController::class, 'updateAccessCredential']);
        // Delete access credential
        Route::delete('/projects/{project}/access-credentials/{credential}', [ProjectController::class, 'deleteAccessCredential']);
    });

    // Mark project as complete (any assigned user)
    Route::post('/projects/{project}/complete', [ProjectController::class, 'completeProject']);

    // Toggle milestone achievement status
    Route::post('/projects/{project}/milestones/{milestone}/achieve', [ProjectController::class, 'toggleMilestoneAchieve'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    /*
    | Task Management Routes
    | CRUD operations, submission workflows, file attachments, and personal notes for tasks.
    */

    // Create standalone task (no project required) - not for guests
    Route::post('/tasks', [TaskController::class, 'storeStandalone'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Preview recurring deliverables calculation
    Route::post('/tasks/recurring-preview', [TaskController::class, 'recurringPreview'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Create task under a project (any authenticated user except guests)
    Route::post('/projects/{project}/tasks', [TaskController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Task CRUD operations
    Route::get('/tasks/{task}', [TaskController::class, 'show']); // View task details
    Route::put('/tasks/{task}', [TaskController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update task
    Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update task status
    Route::post('/tasks/{task}/complete', [TaskController::class, 'completeTask'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Mark task as complete
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete task
    Route::post('/tasks/{task}/update-recurring', [TaskController::class, 'updateRecurring'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update recurring task with confirmation
    Route::put('/tasks/{task}/update-recurring', [TaskController::class, 'updateRecurring'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::delete('/tasks/{task}/recurrence', [TaskController::class, 'deleteRecurring'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete active recurrence rule

    // Task submission workflow (submit for review, approve, reject, reopen)
    Route::post('/tasks/{task}/acknowledge', [TaskController::class, 'acknowledge']); // Acknowledge task assignment
    Route::post('/tasks/{task}/pause', [TaskController::class, 'pause']); // Pause an in-progress task
    Route::post('/tasks/{task}/continue', [TaskController::class, 'continueTask']); // Continue a paused task
    Route::post('/tasks/{task}/assigner-pause', [TaskController::class, 'assignerPause']); // Assigner pauses task (locks assignee)
    Route::post('/tasks/{task}/assigner-resume', [TaskController::class, 'assignerResume']); // Assigner resumes task (unlocks assignee)
    Route::post('/tasks/{task}/submit', [TaskController::class, 'submit']); // Submit task for review
    Route::get('/tasks/{task}/timer', [TaskController::class, 'timer']); // Get live timer state
    Route::get('/tasks/{task}/timer-sessions', [TaskController::class, 'timerSessions']); // Get pause session history
    Route::get('/tasks/{task}/latest-submission', [TaskController::class, 'latestSubmission']); // Get latest submission
    Route::match(['put', 'post'], '/tasks/submissions/{submission}', [TaskController::class, 'updateSubmission']); // Edit submission
    Route::post('/tasks/{task}/approve', [TaskController::class, 'approve'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Approve submitted task
    Route::post('/tasks/{task}/reject', [TaskController::class, 'reject'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reject submitted task
    Route::post('/tasks/{task}/reopen', [TaskController::class, 'reopen'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reopen rejected task
    Route::post('/tasks/{task}/request-abandon', [TaskController::class, 'requestAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/tasks/{task}/approve-abandon', [TaskController::class, 'approveAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/tasks/{task}/decline-abandon', [TaskController::class, 'declineAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/tasks/{task}/abandon', [TaskController::class, 'abandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Task delegation workflow
    Route::post('/tasks/{task}/delegate', [TaskController::class, 'delegate'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delegate task to another user
    Route::post('/tasks/{task}/accept-delegation', [TaskController::class, 'acceptDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Accept pending delegation
    Route::post('/tasks/{task}/reject-delegation', [TaskController::class, 'rejectDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reject pending delegation
    Route::post('/tasks/{task}/revoke-delegation', [TaskController::class, 'revokeDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Revoke a delegation
    Route::get('/tasks/{task}/delegation-chain', [TaskController::class, 'delegationChain']); // Get delegation chain details

    // Project submission workflow removed - projects no longer submitted as tasks
    Route::post('/projects/reorder', [ProjectController::class, 'reorderProjects'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reorder projects

    // Reorder tasks within a project
    Route::post('/tasks/reorder', [TaskController::class, 'reorderTasks'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Mark task changes as read (for notification tracking)
    Route::post('/tasks/{task}/changes/mark-read', [TaskController::class, 'markChangesRead']);

    // Task file attachments and links
    Route::post('/tasks/{task}/files', [TaskController::class, 'uploadFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Upload file to task
    Route::post('/tasks/{task}/links', [TaskController::class, 'addLink'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Add link to task
    Route::put('/tasks/{task}/files/{file}', [TaskController::class, 'renameFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Rename task file/link
    Route::delete('/tasks/{task}/files/{file}', [TaskController::class, 'deleteFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete task file
    Route::post('/tasks/{task}/files/reorder', [TaskController::class, 'reorderFiles'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reorder task files

    // Task access credentials
    Route::get('/tasks/{task}/access-credentials', [TaskController::class, 'getAccessCredentials']);
    Route::post('/tasks/{task}/access-credentials', [TaskController::class, 'storeAccessCredential']);
    Route::put('/tasks/{task}/access-credentials/{credential}', [TaskController::class, 'updateAccessCredential']);
    Route::delete('/tasks/{task}/access-credentials/{credential}', [TaskController::class, 'deleteAccessCredential']);

    // Task discussion / comments
    Route::get('/tasks/{task}/comments', [TaskCommentController::class, 'index']); // List task comments
    Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'store']); // Post a task comment
    Route::get('/tasks/{task}/comments-count', [TaskCommentController::class, 'count']); // Get task comment count
    Route::get('/tasks/{task}/comments-participants', [TaskCommentController::class, 'participants']); // Get task mentionable participants

    // Subtask (deliverable) discussion / comments
    Route::get('/deliverables/{deliverable}/comments', [TaskCommentController::class, 'indexByDeliverable']); // List subtask comments
    Route::post('/deliverables/{deliverable}/comments', [TaskCommentController::class, 'storeByDeliverable']); // Post a subtask comment
    Route::get('/deliverables/{deliverable}/comments-count', [TaskCommentController::class, 'countByDeliverable']); // Get subtask comment count
    Route::get('/deliverables/{deliverable}/comments-participants', [TaskCommentController::class, 'participantsByDeliverable']); // Get subtask mentionable participants

    // Shared comment routes
    Route::put('/comments/{comment}', [TaskCommentController::class, 'update']); // Edit a comment
    Route::delete('/comments/{comment}', [TaskCommentController::class, 'destroy']); // Delete a comment
    Route::get('/comments/{comment}/file', [TaskCommentController::class, 'downloadFile']); // Download attachment

    // Task followers
    Route::get('/tasks/{task}/followers', [TaskFollowerController::class, 'index']); // List followers
    Route::post('/tasks/{task}/followers', [TaskFollowerController::class, 'addFollower']); // Add follower
    Route::delete('/tasks/{task}/followers', [TaskFollowerController::class, 'removeFollower']); // Remove follower
    Route::delete('/tasks/{task}/followers/{user}', [TaskFollowerController::class, 'removeFollower']); // Remove follower by user ID

    // Personal user notes on tasks (private per user)
    Route::get('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'show']); // View own note
    Route::post('/tasks/{task}/my-note', [\App\Http\Controllers\TaskUserNoteController::class, 'store']); // Create own note
    Route::put('/tasks/{task}/my-note/{note}', [\App\Http\Controllers\TaskUserNoteController::class, 'update']); // Update own note
    Route::delete('/tasks/{task}/my-note/{note}', [\App\Http\Controllers\TaskUserNoteController::class, 'destroy']); // Delete own note

        // Task Saved Views Routes (SRS Section 11)
    Route::get('/task-saved-views', [\App\Http\Controllers\TaskSavedViewController::class, 'index']);
    Route::post('/task-saved-views', [\App\Http\Controllers\TaskSavedViewController::class, 'store']);
    Route::put('/task-saved-views/{taskSavedView}', [\App\Http\Controllers\TaskSavedViewController::class, 'update']);
    Route::delete('/task-saved-views/{taskSavedView}', [\App\Http\Controllers\TaskSavedViewController::class, 'destroy']);
    Route::get('/tasks', [TaskController::class, 'allTasks']);

    // Task filtering routes
    Route::get('/my-tasks', [TaskController::class, 'myTasks']); // Tasks assigned to me
    Route::get('/assigned-tasks', [TaskController::class, 'assignedByMe']); // Tasks I assigned to others
    Route::get('/self-tasks', [TaskController::class, 'mySelfTasks']); // Tasks I created for myself
    Route::get('/all-tasks', [TaskController::class, 'allTasks']); // All tasks (role-based visibility, read-only)
    Route::get('/user-tasks/{userId}', [TaskController::class, 'userTasks']); // Tasks assigned to specific user

    // All deliverables (role-based visibility, read-only)
    Route::get('/all-deliverables', [DeliverableController::class, 'allDeliverables']);

    /*
    | Deliverable Management Routes
    | CRUD operations, submission workflows, timer, files, comments, and review actions for deliverables.
    */
    // Read routes (all authenticated users)
    Route::get('/deliverables', [DeliverableController::class, 'index']); // List all deliverables
    Route::get('/deliverables/assigned-by-me', [DeliverableController::class, 'assignedByMe']); // Deliverables I assigned
    Route::get('/deliverables/submission-file/{submission}', [DeliverableController::class, 'downloadSubmissionFile']); // Download submission file
    Route::get('/deliverables/{deliverable}', [DeliverableController::class, 'show']); // View deliverable details
    Route::post('/deliverables/{deliverable}/changes/mark-read', [DeliverableController::class, 'markChangesRead']); // Mark changes as read
    Route::get('/self-deliverables', [DeliverableController::class, 'mySelfDeliverables']); // Deliverables I created for myself
    Route::post('/deliverables/reorder', [DeliverableController::class, 'reorder']); // Reorder deliverables

    // Deliverable creation & update routes (accessible to non-guest authenticated users)
    Route::middleware(\App\Http\Middleware\EnsureNotGuest::class)->group(function () {
        Route::post('/projects/{project}/deliverables', [DeliverableController::class, 'store']); // Create deliverable (project-scoped)
        Route::post('/deliverables', [DeliverableController::class, 'storeStandalone']); // Create deliverable (no project, task_id required)
        Route::put('/deliverables/{deliverable}', [DeliverableController::class, 'update']); // Update deliverable
        Route::delete('/deliverables/{deliverable}', [DeliverableController::class, 'destroy']); // Delete deliverable
    });

    // Deliverable review routes (admin, manager, team lead only)
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead')->group(function () {
        Route::post('/deliverables/{deliverable}/approve', [DeliverableController::class, 'approve']); // Approve deliverable
        Route::post('/deliverables/{deliverable}/reject', [DeliverableController::class, 'reject']); // Reject deliverable
        Route::post('/deliverables/{deliverable}/reopen', [DeliverableController::class, 'reopen']); // Reopen deliverable
    });

    // Deliverable submission workflow
    Route::post('/deliverables/{deliverable}/submit', [DeliverableController::class, 'submit'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Submit deliverable for review
    Route::get('/deliverables/{deliverable}/latest-submission', [DeliverableController::class, 'latestSubmission']); // Get latest submission
    Route::match(['put', 'post'], '/deliveries/submissions/{submission}', [DeliverableController::class, 'updateSubmission']); // Edit submission
    Route::match(['put', 'post'], '/deliverables/submissions/{submission}', [DeliverableController::class, 'updateSubmission']); // Edit submission

    // Self-deliverable review actions (assignee reviews their own work)
    Route::post('/deliverables/{deliverable}/self-approve', [DeliverableController::class, 'selfApprove'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Self-approve deliverable
    Route::post('/deliverables/{deliverable}/self-rework', [DeliverableController::class, 'selfRework'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Mark for rework
    Route::post('/deliverables/{deliverable}/request-abandon', [DeliverableController::class, 'requestAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/deliverables/{deliverable}/approve-abandon', [DeliverableController::class, 'approveAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/deliverables/{deliverable}/decline-abandon', [DeliverableController::class, 'declineAbandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::post('/deliverables/{deliverable}/abandon', [DeliverableController::class, 'abandon'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    // Deliverable delegation workflow
    Route::post('/deliverables/{deliverable}/delegate', [DeliverableController::class, 'delegate'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delegate deliverable to another user
    Route::post('/deliverables/{deliverable}/accept-delegation', [DeliverableController::class, 'acceptDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Accept pending delegation
    Route::post('/deliverables/{deliverable}/reject-delegation', [DeliverableController::class, 'rejectDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reject pending delegation
    Route::post('/deliverables/{deliverable}/revoke-delegation', [DeliverableController::class, 'revokeDelegation'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Revoke a delegation
    Route::get('/deliverables/{deliverable}/delegation-chain', [DeliverableController::class, 'delegationChain']); // Get delegation chain details

    // Deliverable acknowledge
    Route::post('/deliverables/{deliverable}/acknowledge', [DeliverableController::class, 'acknowledge']); // Acknowledge deliverable assignment

    // Deliverable timer
    Route::post('/deliverables/{deliverable}/pause', [DeliverableController::class, 'pause']); // Pause deliverable timer
    Route::post('/deliverables/{deliverable}/continue', [DeliverableController::class, 'continueTimer']); // Resume deliverable timer
    Route::post('/deliverables/{deliverable}/assigner-pause', [DeliverableController::class, 'assignerPause']); // Assigner pauses deliverable
    Route::post('/deliverables/{deliverable}/assigner-resume', [DeliverableController::class, 'assignerResume']); // Assigner resumes deliverable
    Route::get('/deliverables/{deliverable}/timer', [DeliverableController::class, 'timer']); // Get live timer state
    Route::get('/deliverables/{deliverable}/timer-sessions', [DeliverableController::class, 'timerSessions']); // Get pause session history

    // Deliverable file attachments and links
    Route::post('/deliverables/{deliverable}/files', [DeliverableController::class, 'uploadFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Upload file
    Route::post('/deliverables/{deliverable}/links', [DeliverableController::class, 'addLink'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Add link
    Route::put('/deliverables/{deliverable}/files/{file}', [DeliverableController::class, 'renameFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Rename file/link
    Route::delete('/deliverables/{deliverable}/files/{file}', [DeliverableController::class, 'deleteFile'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete file/link
    Route::post('/deliverables/{deliverable}/files/reorder', [DeliverableController::class, 'reorderFiles'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Reorder files

    // Personal user notes on deliverables (private per user)
    Route::get('/deliverables/{deliverable}/my-note', [DeliverableController::class, 'myNote']); // View own note
    Route::post('/deliverables/{deliverable}/my-note', [DeliverableController::class, 'storeNote']); // Create/update own note
    Route::delete('/deliverables/{deliverable}/my-note/{note}', [DeliverableController::class, 'destroyNote']); // Delete own note

    /*
    | Notification Routes
    | Manage user notifications and device tokens for push notifications.
    */
    Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']); // List notifications
    Route::get('/notifications/unread-count', [\App\Http\Controllers\NotificationController::class, 'unreadCount']); // Get unread count
    Route::get('/notifications/latest', [\App\Http\Controllers\NotificationController::class, 'latest']); // Get latest unread for desktop notifications
    Route::post('/notifications/{notification}/read', [\App\Http\Controllers\NotificationController::class, 'markAsRead']); // Mark notification as read
    Route::post('/notifications/read-all', [\App\Http\Controllers\NotificationController::class, 'markAllAsRead']); // Mark all as read
    Route::get('/notifications/{notification}/comments', [\App\Http\Controllers\NotificationController::class, 'getComments']); // List comments on a notification
    Route::post('/notifications/{notification}/comments', [\App\Http\Controllers\NotificationController::class, 'storeComment']); // Add comment to a notification

    // Device tokens for push notifications (all authenticated users)
    Route::post('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'store']); // Register device token
    Route::delete('/device-tokens', [\App\Http\Controllers\DeviceTokenController::class, 'destroy']); // Remove device token

    /*
    | Chat Routes
    | Project-based messaging between guests and internal users.
    */
    Route::get('/conversations', [ChatController::class, 'index']); // List user's conversations
    Route::get('/conversations/unread-count', [ChatController::class, 'unreadCount']); // Get unread conversation count
    Route::get('/chat-items', [ChatController::class, 'chatItems']); // Get projects, tasks, deliverables for chat
    Route::get('/conversations/{conversation}', [ChatController::class, 'show']); // View conversation messages
    Route::post('/conversations', [ChatController::class, 'store']); // Create new conversation
    Route::post('/conversations/{conversation}/messages', [ChatController::class, 'sendMessage']); // Send message
    Route::get('/messages/{message}/file', [ChatController::class, 'downloadFile']); // Download message attachment

    /*
    | Org Chat Routes
    | Organization <-> Super Admin messaging.
    */
    Route::get('/org-chat/conversations', [\App\Http\Controllers\OrgChatController::class, 'orgIndex']);
    Route::get('/org-chat/unread-count', [\App\Http\Controllers\OrgChatController::class, 'orgUnreadCount']);
    Route::get('/org-chat/conversations/{conversationId}', [\App\Http\Controllers\OrgChatController::class, 'orgShow']);
    Route::post('/org-chat/conversations/{conversationId}/messages', [\App\Http\Controllers\OrgChatController::class, 'orgSend']);
    Route::get('/org-chat/messages/{messageId}/file', [\App\Http\Controllers\OrgChatController::class, 'downloadFile']);

    /*
    | Activity Routes
    | Track user activities and work logs.
    */
    Route::get('/activities/today', [ActivityController::class, 'today']); // Today's activities
    Route::get('/activities/past', [ActivityController::class, 'past']); // Past activities
    Route::get('/activities', [ActivityController::class, 'index']); // All activities
    Route::get('/tasks/{task}/unified-activity', [TaskController::class, 'unifiedActivity']);
    Route::get('/projects/{project}/unified-activity', [ProjectController::class, 'unifiedActivity']);

    /*
    | My Activity (all authenticated users)
    | Personal audit log entries for the current user.
    */
    Route::get('/my-activity', [AuditLogController::class, 'myActivity']);

    /*
    | Audit Log Routes
    | Admin and manager only: view and export application audit logs.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/audit-logs/recent', [AuditLogController::class, 'recent']);
        Route::get('/audit-logs/modules', [AuditLogController::class, 'modules']);
        Route::get('/audit-logs/actions', [AuditLogController::class, 'actions']);
        Route::get('/audit-logs/users', [AuditLogController::class, 'users']);
        Route::post('/audit-logs/export', [AuditLogController::class, 'export']);
        Route::get('/audit-logs/{auditLog}', [AuditLogController::class, 'show']);
    });

    /*
    | Calendar / Event Routes
    | CRUD operations for calendar events and event categories.
    */
    Route::get('/event-categories', [\App\Http\Controllers\EventCategoryController::class, 'index']);
    Route::get('/event-categories/{eventCategory}', [\App\Http\Controllers\EventCategoryController::class, 'show']);
    Route::post('/event-categories', [\App\Http\Controllers\EventCategoryController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::match(['put', 'post'], '/event-categories/{eventCategory}', [\App\Http\Controllers\EventCategoryController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::delete('/event-categories/{eventCategory}', [\App\Http\Controllers\EventCategoryController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    Route::get('/events', [EventController::class, 'index']); // List all events
    Route::get('/events/{event}', [EventController::class, 'show']); // View event details
    Route::post('/events', [EventController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Create new event
    Route::match(['put', 'post'], '/events/{event}', [EventController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update event
    Route::delete('/events/{event}', [EventController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete event

    /*
    | Unified Calendar Routes
    | Aggregate view of tasks, projects, deliverables, and events.
    */
    Route::get('/unified-calendar', [EventController::class, 'unifiedCalendar']); // Get unified calendar data
    Route::get('/unified-summary', [EventController::class, 'unifiedSummary']); // Get unified summary

    /*
    | Draft Management Routes
    | Centralized draft system for all modules.
    */
    Route::get('/drafts', [DraftController::class, 'index']); // List drafts (filtered by role)
    Route::post('/drafts', [DraftController::class, 'store']); // Create new draft
    Route::get('/drafts/{draft}', [DraftController::class, 'show']); // View draft details
    Route::put('/drafts/{draft}', [DraftController::class, 'update']); // Update draft
    Route::delete('/drafts/{draft}', [DraftController::class, 'destroy']); // Delete draft
    Route::post('/drafts/{draft}/publish', [DraftController::class, 'publish']); // Publish draft to live record
    Route::post('/drafts/{draft}/publish-returned', [DraftController::class, 'publishReturned']); // Publish returned-from-resignation draft
    Route::post('/drafts/{draft}/duplicate', [DraftController::class, 'duplicate']); // Duplicate draft
    Route::post('/drafts/{draft}/restore/{version}', [DraftController::class, 'restoreVersion']); // Restore draft version
    Route::post('/drafts/{draft}/auto-save', [DraftController::class, 'autoSave']); // Auto-save draft

    // Admin/manager only: draft cleanup
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager')->group(function () {
        Route::post('/drafts/cleanup', [DraftController::class, 'cleanup']); // Cleanup old drafts
        Route::post('/drafts/archive', [DraftController::class, 'archive']); // Archive old drafts
    });

    /*
    | Template Management Routes
    | Universal template system with visibility categories (private, project_team, department_team, organization).
    */
    Route::get('/templates', [\App\Http\Controllers\TemplateController::class, 'index']); // List visible templates
    Route::post('/templates', [\App\Http\Controllers\TemplateController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Create/upload template
    Route::match(['put', 'post'], '/templates/{template}', [\App\Http\Controllers\TemplateController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update template
    Route::delete('/templates/{template}', [\App\Http\Controllers\TemplateController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete template

    /*
    | Knowledge Base Management Routes
    | Tiered visibility knowledge sharing system for articles, documentation, and resources.
    */
    Route::get('/kb-categories', [\App\Http\Controllers\KbCategoryController::class, 'index']);
    Route::get('/kb-categories/{kbCategory}', [\App\Http\Controllers\KbCategoryController::class, 'show']);
    Route::post('/kb-categories', [\App\Http\Controllers\KbCategoryController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::match(['put', 'post'], '/kb-categories/{kbCategory}', [\App\Http\Controllers\KbCategoryController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);
    Route::delete('/kb-categories/{kbCategory}', [\App\Http\Controllers\KbCategoryController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class);

    Route::get('/knowledge-base', [\App\Http\Controllers\KnowledgeBaseController::class, 'index']); // List visible knowledge base items
    Route::get('/knowledge-base/{knowledgeBase}', [\App\Http\Controllers\KnowledgeBaseController::class, 'show']); // View article details
    Route::get('/knowledge-base/{knowledgeBase}/versions', [\App\Http\Controllers\KnowledgeBaseController::class, 'getVersions']); // View article versions
    Route::post('/knowledge-base/{knowledgeBase}/versions/{versionId}/restore', [\App\Http\Controllers\KnowledgeBaseController::class, 'restoreVersion'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Restore version
    Route::post('/knowledge-base', [\App\Http\Controllers\KnowledgeBaseController::class, 'store'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Create article
    Route::match(['put', 'post'], '/knowledge-base/{knowledgeBase}', [\App\Http\Controllers\KnowledgeBaseController::class, 'update'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Update article
    Route::delete('/knowledge-base/{knowledgeBase}', [\App\Http\Controllers\KnowledgeBaseController::class, 'destroy'])->middleware(\App\Http\Middleware\EnsureNotGuest::class); // Delete article

    /*
    | Report Routes
    | Various reporting endpoints for analytics and performance tracking.
    */
    Route::middleware(\App\Http\Middleware\EnsureNotGuest::class)->group(function () {
        Route::get('/reports/team-performance', [ReportController::class, 'teamPerformance']); // Team performance report
        Route::get('/reports/summary', [ReportController::class, 'summaryReport']); // Summary report
        Route::get('/reports/detailed', [ReportController::class, 'detailedReport']); // Detailed report
        Route::get('/reports/performance', [ReportController::class, 'performanceReport']); // Performance report
        Route::get('/reports/progress', [ReportController::class, 'progressReport']); // Progress report
        Route::get('/reports/user/me', [ReportController::class, 'myPerformance']); // User performance report (own)
        Route::get('/reports/user/{user}', [ReportController::class, 'userPerformance'])->where('user', '[0-9]+'); // User performance report
        Route::get('/reports/project/{project}', [ReportController::class, 'projectReport']); // Project report
        Route::get('/reports/summary-cards', [ReportController::class, 'summaryCards']); // Summary cards data
        Route::get('/reports/user-performance-table', [ReportController::class, 'userPerformanceTable']); // User performance table
        Route::get('/reports/company-employees', [ReportController::class, 'companyEmployeesReport']); // Company employees report
        Route::get('/reports/teams-overview', [ReportController::class, 'teamsOverview']); // Teams overview for reports page
    });

    /*
    | Role-Based Dashboard Routes
    | Personalized dashboard information based on user role.
    */
    Route::middleware(\App\Http\Middleware\RoleMiddleware::class . ':admin,manager,team_lead,member,guest')->group(function () {
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