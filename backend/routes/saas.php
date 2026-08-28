<?php

/**
 * Super Admin API routes for SaaS management.
 *
 * All routes are prefixed with /api/super-admin (configured in bootstrap/app.php).
 */
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Saas\SuperAdminController;
use App\Http\Controllers\Saas\SuperAdminAuthController;
use App\Http\Controllers\OrgChatController;
use App\Http\Controllers\HealthCheckController;
use App\Services\Saas\OrganizationService;
use App\Models\Master\Organization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

$ctrl = SuperAdminController::class;
$authCtrl = SuperAdminAuthController::class;

// ─── Public Auth Routes (no auth required) ────────────────────
Route::post('/login', [$authCtrl, 'login']);
Route::post('/forgot-password', [$authCtrl, 'forgotPassword']);
Route::post('/reset-password', [$authCtrl, 'resetPassword']);

// ─── Public Organization Registration (no auth required) ──────
Route::post('/organizations/register', [$ctrl, 'register']);

// ─── Public Plans (no auth required — for registration page) ──
Route::get('/public/plans', [$ctrl, 'plans']);

// ─── Protected Routes (require super admin auth) ──────────────
Route::middleware('super.admin')->group(function () use ($ctrl, $authCtrl) {

    // ─── Auth ────────────────────────────────────────────────────
    Route::post('/logout', [$authCtrl, 'logout']);
    Route::post('/change-password', [$authCtrl, 'changePassword']);

    // ─── Dashboard ─────────────────────────────────────────────
    Route::get('/stats', [$ctrl, 'stats']);

    // ─── Super Admin Profile ────────────────────────────────────
    Route::match(['get', 'post'], '/my-profile', [$ctrl, 'myProfile']);

    // ─── Organizations CRUD ────────────────────────────────────
    Route::get('/organizations', [$ctrl, 'organizations']);
    Route::get('/organizations/{id}', [$ctrl, 'organization']);
    Route::post('/organizations', [$ctrl, 'storeOrganization']);
    Route::put('/organizations/{id}', [$ctrl, 'updateOrganization']);
    Route::delete('/organizations/{id}', [$ctrl, 'destroyOrganization']);
    Route::post('/organizations/{id}/suspend', [$ctrl, 'suspendOrganization']);
    Route::post('/organizations/{id}/activate', [$ctrl, 'activateOrganization']);
    Route::post('/organizations/{id}/change-admin-password', [$ctrl, 'changeOrgAdminPassword']);
    Route::post('/organizations/{id}/change-plan', [$ctrl, 'changePlan']);
    Route::get('/organizations/{id}/subscription-history', [$ctrl, 'subscriptionHistory']);
    Route::get('/organizations/{id}/subscription-summary', [$ctrl, 'subscriptionSummary']);

    // ─── Organization Storage, Billing, Support ────────────────
    Route::get('/organizations/{id}/storage', [$ctrl, 'orgStorageUsage']);
    Route::get('/organizations/{id}/storage/summary', [$ctrl, 'orgStorageSummary']);
    Route::delete('/organizations/{id}/storage/{recordId}', [$ctrl, 'deleteOrgStorageRecord']);
    Route::delete('/organizations/{id}/storage/bulk', [$ctrl, 'deleteOrgStorageBulk']);
    // Storage Notifications (Super Admin)
    Route::get('/organizations/{id}/storage/notifications', [$ctrl, 'orgStorageNotifications']);
    Route::post('/organizations/{id}/storage/notifications/dismiss-all', [$ctrl, 'orgStorageNotificationsDismissAll']);
    Route::post('/organizations/{id}/storage/notifications/{notifId}/dismiss', [$ctrl, 'orgStorageNotificationsDismiss']);
    // Storage Preferences (Super Admin)
    Route::get('/organizations/{id}/storage/preferences', [$ctrl, 'orgStoragePreferences']);
    Route::put('/organizations/{id}/storage/preferences', [$ctrl, 'orgStoragePreferencesUpdate']);
    Route::post('/organizations/{id}/storage/test-connection', [$ctrl, 'orgTestS3Connection']);
    Route::get('/organizations/{id}/billing', [$ctrl, 'orgBillingInvoices']);
    Route::post('/billing/{invoiceId}/approve', [$ctrl, 'approvePayment']);
    Route::post('/billing/{invoiceId}/reject', [$ctrl, 'rejectPayment']);
    Route::get('/billing/{invoiceId}/download', [$ctrl, 'downloadInvoice']);
    Route::get('/billing/summary', [$ctrl, 'billingSummary']);
    Route::get('/organizations/{id}/support/tickets', [$ctrl, 'orgSupportTickets']);
    Route::get('/organizations/{id}/support/tickets/{ticketId}', [$ctrl, 'orgSupportTicketDetail']);
    Route::post('/organizations/{id}/support/tickets/{ticketId}/reply', [$ctrl, 'orgSupportReply']);
    Route::post('/organizations/{id}/support/tickets/{ticketId}/close', [$ctrl, 'orgSupportClose']);

    // ─── Organization Audit Logs (Super Admin) ─────────────────
    Route::get('/organizations/{id}/audit-logs', [$ctrl, 'orgAuditLogs']);
    Route::get('/organizations/{id}/audit-logs/modules', [$ctrl, 'orgAuditLogModules']);
    Route::get('/organizations/{id}/audit-logs/actions', [$ctrl, 'orgAuditLogActions']);
    Route::get('/organizations/{id}/audit-logs/users', [$ctrl, 'orgAuditLogUsers']);

    // ─── Feedback Tickets (Super Admin) ────────────────────────
    Route::get('/feedback-tickets', [$ctrl, 'allFeedbackTickets']);
    Route::get('/feedback-tickets/{ticketId}', [$ctrl, 'feedbackTicketDetail']);
    Route::post('/feedback-tickets/{ticketId}/reply', [$ctrl, 'feedbackTicketReply']);
    Route::post('/feedback-tickets/{ticketId}/close', [$ctrl, 'feedbackTicketClose']);
    Route::post('/feedback-tickets/{ticketId}/status', [$ctrl, 'feedbackTicketUpdateStatus']);

    // ─── Organization Trial Settings ────────────────────────────
    Route::get('/organizations/{id}/trial-settings', [$ctrl, 'getTrialSettings']);
    Route::put('/organizations/{id}/trial-settings', [$ctrl, 'updateTrialSettings']);
    Route::delete('/organizations/{id}/trial-settings', [$ctrl, 'resetTrialSettings']);
    Route::get('/trial-defaults', [$ctrl, 'getGlobalTrialDefaults']);

    // ─── Plans & Modules ───────────────────────────────────────
    Route::get('/plans', [$ctrl, 'plans']);
    Route::put('/plans/{id}', [$ctrl, 'updatePlan']);
    Route::get('/modules', [$ctrl, 'modules']);
    Route::get('/domains', [$ctrl, 'domains']);

    // ─── Available Plans ────────────────────────────────────────
    Route::get('/available-plans', [$ctrl, 'availablePlans']);

    // ─── TechXaro's Own Subscription ───────────────────────────
    Route::get('/my-subscription', [$ctrl, 'mySubscription']);
    Route::post('/change-my-plan', [$ctrl, 'changeMyPlan']);

    // ─── Notifications ─────────────────────────────────────────
    Route::get('/notifications', [$ctrl, 'notifications']);
    Route::get('/notifications/unread-count', [$ctrl, 'notificationUnreadCount']);
    Route::get('/notifications/latest', [$ctrl, 'notificationLatest']);
    Route::post('/notifications/{id}/read', [$ctrl, 'notificationMarkAsRead']);
    Route::post('/notifications/read-all', [$ctrl, 'notificationMarkAllAsRead']);

    // ─── Activity Logs ─────────────────────────────────────────
    Route::get('/activity-logs', [$ctrl, 'activityLogs']);
    Route::get('/activity-logs/actions', [$ctrl, 'activityLogActions']);
    Route::get('/all-org-audit-logs', [$ctrl, 'allOrgAuditLogs']);
    Route::get('/all-org-audit-logs/modules', [$ctrl, 'allOrgAuditLogModules']);

    // ─── Health ────────────────────────────────────────────────
    Route::get('/health', [$ctrl, 'health']);
    Route::get('/health/tenant/{slug}', [$ctrl, 'healthTenant']);
    Route::get('/health/all', [$ctrl, 'healthAll']);

    // ─── Org Chat (Super Admin <-> Organization) ─────────────
    $orgChatCtrl = OrgChatController::class;
    Route::get('/org-chat/conversations', [$orgChatCtrl, 'superAdminIndex']);
    Route::get('/org-chat/unread-count', [$orgChatCtrl, 'superAdminUnreadCount']);
    Route::post('/org-chat/conversations', [$orgChatCtrl, 'superAdminStore']);
    Route::get('/org-chat/conversations/{conversationId}', [$orgChatCtrl, 'superAdminShow']);
    Route::post('/org-chat/conversations/{conversationId}/messages', [$orgChatCtrl, 'superAdminSend']);

    // ─── Debug (keep existing) ─────────────────────────────────
    Route::get('/tenant/current', function (Request $request) {
        $org = $request->attributes->get('currentOrganization');
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'No tenant resolved.']);
        }
        return response()->json([
            'success' => true,
            'tenant' => [
                'id' => $org->id, 'name' => $org->name, 'slug' => $org->slug,
                'type' => $org->type ?? 'standard', 'database_name' => $org->database_name,
                'status' => $org->status,
            ],
        ]);
    });
});
