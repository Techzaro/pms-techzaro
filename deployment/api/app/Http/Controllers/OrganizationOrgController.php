<?php

namespace App\Http\Controllers;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationSubscription;
use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationBillingInvoice;
use App\Models\Master\OrganizationSupportTicket;
use App\Models\Master\OrganizationSupportMessage;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrganizationOrgController extends Controller
{
    public function __construct(
        private AuditService $auditService
    ) {}

    private function resolveOrganization(Request $request): ?Organization
    {
        $org = $request->attributes->get('currentOrganization');
        if ($org) {
            return $org;
        }

        $tenantSlug = $request->header('X-Tenant-ID');
        if ($tenantSlug) {
            $org = Organization::on('mysql_master')
                ->where('slug', $tenantSlug)
                ->first();
            if ($org) {
                return $org;
            }
        }

        $dbName = DB::connection()->getDatabaseName();
        return Organization::on('mysql_master')
            ->where('database_name', $dbName)
            ->first();
    }

    // ──────────────────────────────────────────────
    // STORAGE ENDPOINTS
    // ──────────────────────────────────────────────

    public function getStorageUsage(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;

        $storageFiles = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalMb = round($totalBytes / (1024 * 1024), 2);
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);

        $byCategory = $storageFiles->groupBy('category')->map(function ($files, $category) {
            $bytes = $files->sum('file_size_bytes');
            return [
                'category'    => $category,
                'file_count'  => $files->count(),
                'total_bytes' => $bytes,
                'total_mb'    => round($bytes / (1024 * 1024), 2),
                'total_gb'    => round($bytes / (1024 * 1024 * 1024), 4),
            ];
        })->values();

        $recentFiles = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get()
            ->map(function ($file) {
                return [
                    'id'         => $file->id,
                    'file_name'  => $file->file_name,
                    'category'   => $file->category,
                    'mime_type'  => $file->mime_type,
                    'file_size'  => $file->file_size_bytes,
                    'file_size_mb' => $file->file_size_mb,
                    'uploaded_by'=> $file->uploaded_by_name,
                    'created_at' => $file->created_at?->toISOString(),
                ];
            });

        return response()->json([
            'success' => true,
            'storage' => [
                'total_bytes'      => $totalBytes,
                'total_mb'         => $totalMb,
                'total_gb'         => $totalGb,
                'max_storage_gb'   => $maxStorageGb,
                'usage_percent'    => $maxStorageGb > 0 ? round(($totalGb / $maxStorageGb) * 100, 1) : 0,
                'remaining_gb'     => max(0, round($maxStorageGb - $totalGb, 4)),
                'by_category'      => $byCategory,
                'recent_files'     => $recentFiles,
                'total_files'      => $storageFiles->count(),
            ],
        ]);
    }

    public function trackStorageUsage(Request $request): JsonResponse
    {
        $request->validate([
            'category'    => 'required|string|max:50',
            'file_path'   => 'required|string|max:500',
            'file_name'   => 'required|string|max:255',
            'mime_type'   => 'nullable|string|max:100',
            'file_size_bytes' => 'required|integer|min:0',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $usage = OrganizationStorageUsage::on('mysql_master')->create([
            'organization_id'  => $org->id,
            'category'         => $request->category,
            'file_path'        => $request->file_path,
            'file_name'        => $request->file_name,
            'mime_type'        => $request->mime_type,
            'file_size_bytes'  => $request->file_size_bytes,
            'uploaded_by_name' => $request->user()?->name,
            'uploaded_by_id'   => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'usage' => $usage]);
    }

    public function deleteStorageRecord(Request $request, int $id): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageFileService::deleteFile($org, $id);

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Record not found.'], 404);
        }

        return response()->json(['success' => true, 'message' => 'File deleted from storage and database.']);
    }

    public function deleteOldFiles(Request $request): JsonResponse
    {
        $request->validate([
            'months' => 'required|integer|in:3,6,12',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageFileService::deleteOldFiles($org, $request->months);

        return response()->json([
            'success' => true,
            'message' => "{$result['deleted_count']} old files deleted from storage.",
            'deleted_count' => $result['deleted_count'],
            'freed_bytes' => $result['freed_bytes'],
            'freed_mb' => $result['freed_mb'],
        ]);
    }

    public function deleteLargeFiles(Request $request): JsonResponse
    {
        $request->validate([
            'min_size_gb' => 'required|numeric|min:0.5',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageFileService::deleteLargeFiles($org, $request->min_size_gb);

        return response()->json([
            'success' => true,
            'message' => "{$result['deleted_count']} large files deleted from storage.",
            'deleted_count' => $result['deleted_count'],
            'freed_bytes' => $result['freed_bytes'],
            'freed_mb' => $result['freed_mb'],
        ]);
    }

    public function getLargeFiles(Request $request): JsonResponse
    {
        $request->validate([
            'min_size_mb' => 'nullable|integer|min:1',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $minBytes = ($request->get('min_size_mb', 500)) * 1024 * 1024;
        $largeFiles = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', $minBytes)
            ->orderBy('file_size_bytes', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($file) {
                return [
                    'id'            => $file->id,
                    'file_name'     => $file->file_name,
                    'category'      => $file->category,
                    'mime_type'     => $file->mime_type,
                    'file_size'     => $file->file_size_bytes,
                    'file_size_mb'  => $file->file_size_mb,
                    'file_size_gb'  => round($file->file_size_bytes / (1024 * 1024 * 1024), 2),
                    'uploaded_by'   => $file->uploaded_by_name,
                    'created_at'    => $file->created_at?->toISOString(),
                ];
            });

        return response()->json([
            'success' => true,
            'large_files' => $largeFiles,
            'total_count' => $largeFiles->count(),
        ]);
    }

    public function getStorageSummary(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;
        $planName = $subscription?->plan?->name ?? 'Unknown';

        $storageFiles = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->get();

        $totalBytes = $storageFiles->sum('file_size_bytes');
        $totalGb = round($totalBytes / (1024 * 1024 * 1024), 4);
        $usagePercent = $maxStorageGb > 0 ? round(($totalGb / $maxStorageGb) * 100, 1) : 0;

        $oldFiles3m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(3))
            ->count();
        $oldSize3m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(3))
            ->sum('file_size_bytes');

        $oldFiles6m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(6))
            ->count();
        $oldSize6m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(6))
            ->sum('file_size_bytes');

        $oldFiles12m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(12))
            ->count();
        $oldSize12m = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('created_at', '<', now()->subMonths(12))
            ->sum('file_size_bytes');

        $largeFiles1gb = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', 1024 * 1024 * 1024)
            ->count();
        $largeSize1gb = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', 1024 * 1024 * 1024)
            ->sum('file_size_bytes');

        $largeFiles2gb = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', 2 * 1024 * 1024 * 1024)
            ->count();
        $largeSize2gb = OrganizationStorageUsage::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('file_size_bytes', '>=', 2 * 1024 * 1024 * 1024)
            ->sum('file_size_bytes');

        return response()->json([
            'success' => true,
            'summary' => [
                'org_name'       => $org->name,
                'plan_name'      => $planName,
                'total_bytes'    => $totalBytes,
                'total_gb'       => $totalGb,
                'max_storage_gb' => $maxStorageGb,
                'usage_percent'  => $usagePercent,
                'remaining_gb'   => max(0, round($maxStorageGb - $totalGb, 4)),
                'total_files'    => $storageFiles->count(),
                'old_files' => [
                    '3_months'  => ['count' => $oldFiles3m, 'size_mb' => round($oldSize3m / (1024 * 1024), 2)],
                    '6_months'  => ['count' => $oldFiles6m, 'size_mb' => round($oldSize6m / (1024 * 1024), 2)],
                    '12_months' => ['count' => $oldFiles12m, 'size_mb' => round($oldSize12m / (1024 * 1024), 2)],
                ],
                'large_files' => [
                    'over_1gb' => ['count' => $largeFiles1gb, 'size_mb' => round($largeSize1gb / (1024 * 1024), 2)],
                    'over_2gb' => ['count' => $largeFiles2gb, 'size_mb' => round($largeSize2gb / (1024 * 1024), 2)],
                ],
            ],
        ]);
    }

    // ──────────────────────────────────────────────
    // STORAGE NOTIFICATIONS
    // ──────────────────────────────────────────────

    public function getStorageNotifications(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        // Trigger fresh notification check to dismiss stale notifications
        \App\Services\StorageNotificationService::checkAndNotify($org);

        $notifications = \App\Services\StorageNotificationService::getActiveNotifications($org->id);
        $pinned = \App\Services\StorageNotificationService::getPinnedNotifications($org->id);

        return response()->json([
            'success' => true,
            'notifications' => $notifications->map(fn($n) => [
                'id'         => $n->id,
                'type'       => $n->type,
                'severity'   => $n->severity,
                'title'      => $n->title,
                'message'    => $n->message,
                'metadata'   => $n->metadata,
                'is_read'    => $n->is_read,
                'created_at' => $n->created_at?->toISOString(),
            ]),
            'pinned' => $pinned->map(fn($n) => [
                'id'         => $n->id,
                'type'       => $n->type,
                'severity'   => $n->severity,
                'title'      => $n->title,
                'message'    => $n->message,
                'metadata'   => $n->metadata,
                'created_at' => $n->created_at?->toISOString(),
            ]),
            'unread_count' => $notifications->where('is_read', false)->count(),
        ]);
    }

    public function markNotificationRead(Request $request, int $notifId): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageNotificationService::markRead($org->id, $notifId);
        return response()->json(['success' => $result]);
    }

    public function dismissNotification(Request $request, int $notifId): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $result = \App\Services\StorageNotificationService::dismiss($org->id, $notifId);
        return response()->json(['success' => $result]);
    }

    public function dismissAllNotifications(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $count = \App\Services\StorageNotificationService::dismissAll($org->id);
        return response()->json(['success' => true, 'dismissed_count' => $count]);
    }

    // ──────────────────────────────────────────────
    // STORAGE PREFERENCES
    // ──────────────────────────────────────────────

    public function getStoragePreferences(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'preferences' => [
                'auto_delete'        => $org->storage_auto_delete ?? false,
                'overwrite'          => $org->storage_overwrite ?? true,
                'warn_threshold'     => $org->storage_warn_threshold ?? 80,
                'critical_threshold' => $org->storage_critical_threshold ?? 90,
                'pin_threshold'      => $org->storage_pin_threshold ?? 95,
                'driver'             => $org->storage_driver ?? 'local',
                's3_prefix'          => $org->storage_s3_prefix ?? "org-{$org->id}",
            ],
        ]);
    }

    public function updateStoragePreferences(Request $request): JsonResponse
    {
        $request->validate([
            'auto_delete'        => 'nullable|boolean',
            'overwrite'          => 'nullable|boolean',
            'warn_threshold'     => 'nullable|integer|min:50|max:95',
            'critical_threshold' => 'nullable|integer|min:60|max:98',
            'pin_threshold'      => 'nullable|integer|min:70|max:100',
            'driver'             => 'nullable|string|in:local,s3',
            's3_prefix'          => 'nullable|string|max:100',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $org->update(array_filter([
            'storage_auto_delete'        => $request->has('auto_delete') ? $request->boolean('auto_delete') : null,
            'storage_overwrite'          => $request->has('overwrite') ? $request->boolean('overwrite') : null,
            'storage_warn_threshold'     => $request->input('warn_threshold'),
            'storage_critical_threshold' => $request->input('critical_threshold'),
            'storage_pin_threshold'      => $request->input('pin_threshold'),
            'storage_driver'             => $request->input('driver'),
            'storage_s3_prefix'          => $request->input('s3_prefix'),
        ], fn($v) => $v !== null));

        return response()->json([
            'success' => true,
            'message' => 'Storage preferences updated.',
            'preferences' => [
                'auto_delete'        => $org->storage_auto_delete,
                'overwrite'          => $org->storage_overwrite,
                'warn_threshold'     => $org->storage_warn_threshold,
                'critical_threshold' => $org->storage_critical_threshold,
                'pin_threshold'      => $org->storage_pin_threshold,
                'driver'             => $org->storage_driver,
                's3_prefix'          => $org->storage_s3_prefix,
            ],
        ]);
    }

    // ──────────────────────────────────────────────
    // BILLING ENDPOINTS
    // ──────────────────────────────────────────────

    public function getBillingInvoices(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $invoices = OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan:id,name,slug')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($invoice) {
                return [
                    'id'              => $invoice->id,
                    'invoice_number'  => $invoice->invoice_number,
                    'status'          => $invoice->status,
                    'amount'          => $invoice->amount,
                    'tax_amount'      => $invoice->tax_amount,
                    'total_amount'    => $invoice->total_amount,
                    'currency'        => $invoice->currency,
                    'billing_period'  => $invoice->billing_period,
                    'payment_method'  => $invoice->payment_method,
                    'description'     => $invoice->description,
                    'paid_at'         => $invoice->paid_at?->toISOString(),
                    'due_at'          => $invoice->due_at?->toISOString(),
                    'plan'            => $invoice->plan ? [
                        'id'   => $invoice->plan->id,
                        'name' => $invoice->plan->name,
                        'slug' => $invoice->plan->slug,
                    ] : null,
                    'created_at'      => $invoice->created_at?->toISOString(),
                ];
            });

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        $totalPaid = OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('status', 'paid')
            ->sum('total_amount');

        $totalPending = OrganizationBillingInvoice::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('status', 'pending')
            ->sum('total_amount');

        return response()->json([
            'success' => true,
            'invoices' => $invoices,
            'summary' => [
                'total_paid'     => round($totalPaid, 2),
                'total_pending'  => round($totalPending, 2),
                'total_invoices' => $invoices->count(),
                'current_plan'   => $subscription?->plan ? [
                    'name'           => $subscription->plan->name,
                    'price_monthly'  => $subscription->getEffectivePriceMonthly(),
                    'price_yearly'   => $subscription->getEffectivePriceYearly(),
                    'billing_period' => $subscription->billing_period,
                ] : null,
            ],
        ]);
    }

    public function generateInvoice(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $subscription = OrganizationSubscription::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('plan')
            ->latest()
            ->first();

        if (!$subscription) {
            return response()->json(['success' => false, 'message' => 'No active subscription found.'], 404);
        }

        $invoiceNumber = 'INV-' . strtoupper(Str::random(4)) . '-' . date('YmdHis');
        $amount = $subscription->getEffectivePrice();
        $taxRate = 0.10;
        $taxAmount = round($amount * $taxRate, 2);
        $totalAmount = round($amount + $taxAmount, 2);

        $invoice = OrganizationBillingInvoice::on('mysql_master')->create([
            'organization_id'  => $org->id,
            'subscription_id'  => $subscription->id,
            'plan_id'          => $subscription->plan_id,
            'invoice_number'   => $invoiceNumber,
            'status'           => 'paid',
            'amount'           => $amount,
            'tax_amount'       => $taxAmount,
            'total_amount'     => $totalAmount,
            'currency'         => $subscription->currency,
            'billing_period'   => $subscription->billing_period,
            'payment_method'   => 'card',
            'description'      => ucfirst($subscription->billing_period) . ' subscription - ' . ($subscription->plan->name ?? 'Unknown'),
            'paid_at'          => now(),
            'due_at'           => null,
        ]);

        return response()->json(['success' => true, 'invoice' => $invoice]);
    }

    // ──────────────────────────────────────────────
    // SUPPORT ENDPOINTS
    // ──────────────────────────────────────────────

    public function getSupportTickets(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $status = $request->query('status');
        $priority = $request->query('priority');

        $query = OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('user:id,name,email');

        if ($status) {
            $query->where('status', $status);
        }
        if ($priority) {
            $query->where('priority', $priority);
        }

        $tickets = $query->orderBy('created_at', 'desc')->get()->map(function ($ticket) {
            $lastMessage = $ticket->messages()->orderBy('created_at', 'desc')->first();
            return [
                'id'              => $ticket->id,
                'ticket_number'   => $ticket->ticket_number,
                'subject'         => $ticket->subject,
                'message'         => $ticket->message,
                'status'          => $ticket->status,
                'priority'        => $ticket->priority,
                'category'        => $ticket->category,
                'assigned_to'     => $ticket->assigned_to_name,
                'user'            => $ticket->user ? [
                    'id'    => $ticket->user->id,
                    'name'  => $ticket->user->name,
                    'email' => $ticket->user->email,
                ] : null,
                'last_message'    => $lastMessage ? [
                    'message'     => Str::limit($lastMessage->message, 100),
                    'sender_type' => $lastMessage->sender_type,
                    'created_at'  => $lastMessage->created_at?->toISOString(),
                ] : null,
                'resolved_at'     => $ticket->resolved_at?->toISOString(),
                'closed_at'       => $ticket->closed_at?->toISOString(),
                'created_at'      => $ticket->created_at?->toISOString(),
                'updated_at'      => $ticket->updated_at?->toISOString(),
            ];
        });

        $counts = [
            'open'    => OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'open')->count(),
            'pending' => OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'pending')->count(),
            'resolved'=> OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'resolved')->count(),
            'closed'  => OrganizationSupportTicket::on('mysql_master')->where('organization_id', $org->id)->where('status', 'closed')->count(),
        ];

        return response()->json([
            'success' => true,
            'tickets' => $tickets,
            'counts'  => $counts,
        ]);
    }

    public function getSupportTicketDetail(Request $request, int $ticketId): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->with('user:id,name,email')
            ->with('messages.user:id,name,email')
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        // Mark organization messages as read
        OrganizationSupportMessage::on('mysql_master')
            ->where('ticket_id', $ticket->id)
            ->where('sender_type', 'support')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        $messages = $ticket->messages->map(function ($msg) {
            return [
                'id'          => $msg->id,
                'message'     => $msg->message,
                'sender_type' => $msg->sender_type,
                'is_read'     => $msg->is_read,
                'user'        => $msg->user ? [
                    'id'    => $msg->user->id,
                    'name'  => $msg->user->name,
                    'email' => $msg->user->email,
                ] : null,
                'created_at'  => $msg->created_at?->toISOString(),
            ];
        });

        return response()->json([
            'success'  => true,
            'ticket'   => [
                'id'            => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject'       => $ticket->subject,
                'message'       => $ticket->message,
                'status'        => $ticket->status,
                'priority'      => $ticket->priority,
                'category'      => $ticket->category,
                'assigned_to'   => $ticket->assigned_to_name,
                'user'          => $ticket->user ? [
                    'id'    => $ticket->user->id,
                    'name'  => $ticket->user->name,
                    'email' => $ticket->user->email,
                ] : null,
                'resolved_at'   => $ticket->resolved_at?->toISOString(),
                'closed_at'     => $ticket->closed_at?->toISOString(),
                'created_at'    => $ticket->created_at?->toISOString(),
                'updated_at'    => $ticket->updated_at?->toISOString(),
            ],
            'messages' => $messages,
        ]);
    }

    public function createSupportTicket(Request $request): JsonResponse
    {
        $request->validate([
            'subject'   => 'required|string|max:255',
            'message'   => 'required|string',
            'priority'  => 'nullable|string|in:low,medium,high,urgent',
            'category'  => 'nullable|string|max:50',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticketNumber = 'TKT-' . strtoupper(Str::random(4)) . '-' . date('YmdHis');

        $ticket = OrganizationSupportTicket::on('mysql_master')->create([
            'organization_id' => $org->id,
            'user_id'         => $request->user()?->id,
            'ticket_number'   => $ticketNumber,
            'subject'         => $request->subject,
            'message'         => $request->message,
            'status'          => 'open',
            'priority'        => $request->priority ?? 'medium',
            'category'        => $request->category ?? 'general',
        ]);

        OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id'    => $ticket->id,
            'user_id'      => $request->user()?->id,
            'message'      => $request->message,
            'sender_type'  => 'organization',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Support ticket created successfully.',
            'ticket'  => $ticket,
        ], 201);
    }

    public function replySupportTicket(Request $request, int $ticketId): JsonResponse
    {
        $request->validate([
            'message' => 'required|string',
        ]);

        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        if (in_array($ticket->status, ['closed'])) {
            return response()->json(['success' => false, 'message' => 'Cannot reply to a closed ticket.'], 400);
        }

        $msg = OrganizationSupportMessage::on('mysql_master')->create([
            'ticket_id'    => $ticket->id,
            'user_id'      => $request->user()?->id,
            'message'      => $request->message,
            'sender_type'  => 'organization',
        ]);

        if ($ticket->status === 'open') {
            $ticket->update(['status' => 'pending']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Reply sent.',
            'reply'   => $msg,
        ]);
    }

    public function closeSupportTicket(Request $request, int $ticketId): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticket = OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->find($ticketId);

        if (!$ticket) {
            return response()->json(['success' => false, 'message' => 'Ticket not found.'], 404);
        }

        $ticket->update([
            'status'    => 'closed',
            'closed_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Ticket closed.']);
    }

    public function getUnreadSupportCount(Request $request): JsonResponse
    {
        $org = $this->resolveOrganization($request);
        if (!$org) {
            return response()->json(['success' => false, 'message' => 'Organization not found.'], 404);
        }

        $ticketIds = OrganizationSupportTicket::on('mysql_master')
            ->where('organization_id', $org->id)
            ->where('status', '!=', 'closed')
            ->pluck('id');

        $unreadCount = OrganizationSupportMessage::on('mysql_master')
            ->whereIn('ticket_id', $ticketIds)
            ->where('sender_type', 'support')
            ->where('is_read', false)
            ->count();

        return response()->json(['success' => true, 'unread_count' => $unreadCount]);
    }
}
